//! 更新包的下载、校验、安装。
//!
//! 这一段在 Electron 时代是主进程里的 Node 代码（`src/main/updater.ts`）。搬到 Rust 有两个理由：
//!
//! 1. **哈希**。webview 里的 `crypto.subtle` 依赖安全上下文，而这个应用的产物页跑在
//!    `http://tauri.localhost` 上；与其赌它一定算得出摘要，不如在本机算，也顺便省下把
//!    100 MB 字节来回搬给 JS 的开销。
//! 2. **流**。`@tauri-apps/plugin-http` 的 `fetch` 会把响应整体缓冲成内存里的 `Uint8Array`
//!    再交给前端，逐块写盘 + 逐块累加摘要需要一个真正的字节流。
//!
//! 分工保持不变：**判断**仍在 TS——比对基准版本、挑产物、决定错误码、发状态事件都出自
//! `src/backend/updater.ts`，错误码也仍是 `src/shared/update.ts` 里那几个。Rust 只回答两件事：
//! "字节落盘了，摘要是这个"和"我没能落盘，原因是这个"。取消、限额（600 MB）、临时文件、
//! 原子改名，都和 Node 版一一对应。
//!
//! "安装"是唯一的例外，而且是有理由的例外：换掉**正在运行的自己**这件事没有任何判断成分，
//! 却全是操作系统语义（运行中的映像不能覆盖、能改名；新实例必须等旧进程结束），所以它整个属于
//! 宿主，写在 `src-tauri/src/replace.rs`。这里只负责把暂存文件的路径与基准摘要交过去。

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncWriteExt, BufWriter};

use crate::replace;

/// 与今天 `USER_AGENT` 同一个串：GitHub 用它做流量归因，改了就等于换了个身份。
const USER_AGENT: &str = "tyme-app-updater (https://github.com/black067/tyme4ts-gui)";
/// 与今天 `REQUEST_TIMEOUT_MS` 一致：连接阶段 15 秒。
const CONNECT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(15);
/// 与今天 `MAX_DOWNLOAD_BYTES` 一致：超过 600 MB 一律丢掉，防的是响应体与 `size` 不符。
const MAX_DOWNLOAD_BYTES: u64 = 600 * 1024 * 1024;
/// 事件名，值由 `src/shared/ipc.ts` 的 `HostEvent.downloadProgress` 定义，两边必须一致。
pub const PROGRESS_EVENT: &str = "update://progress";
/// 事件节流：与今天 `Upstream` 里那个 80 毫秒的节拍一致，够顺眼也够省。
const CHUNK_PROGRESS_INTERVAL: std::time::Duration = std::time::Duration::from_millis(80);

/// 与今天 `UpdateProgress` 同形状：`transferred` 与可空的 `total`。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    transferred: u64,
    total: u64,
}

/// 一次进行中的下载。`cancel_update` 只把这个开关拨上去，
/// 真正的清理（删临时文件）由下载协程自己在退出前做。
struct Download {
    cancel: Arc<AtomicBool>,
}

/// 挂在 `tauri::Builder::manage` 上的宿主状态。
#[derive(Default)]
pub struct UpdaterState {
    active: Mutex<Option<Download>>,
}

/// 落点：`%APPDATA%\万年历\updates`。目录名与今天完全一致，
/// 老用户留在盘上的半成品因此还能被认出来。
///
/// 会建目录：只有"用户按了下载"才走到这里。启动路径上的清扫用 [`existing_updates_dir`]，
/// 否则第一次启动会在用户还没选定位置时就造出一个 `updates` 来。
fn updates_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = data_dir(app)?.join("updates");
    std::fs::create_dir_all(&dir).map_err(|_| "disk".to_string())?;
    Ok(dir)
}

/// 同一个落点，但**不建**：目录不在就是"没有暂存过任何东西"。
///
/// `Err` 与 `Ok(None)` 都算没有——调用方关心的只是"有没有垃圾要扫"。
fn existing_updates_dir(app: &AppHandle) -> Option<PathBuf> {
    let dir = data_dir(app).ok()?.join("updates");
    dir.is_dir().then_some(dir)
}

/// 数据目录的绝对路径。`app_data_dir()` 本身不建目录，但目录不存在时这里回 `None`，
/// 让调用方自己决定"没有这个目录"是错误还是空操作。
fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|_| "disk".to_string())?;
    Ok(dir)
}

/// 产物名来自 GitHub 的响应，属于外部输入。TS 侧已经用正则挑过一遍，这里再收紧一层：
/// 只允许文件名安全的字符，任何分隔符、`..`、绝对路径都进不来。
fn safe_file_name(raw: &str) -> Option<&str> {
    if raw.is_empty() || raw.len() > 128 || !raw.ends_with(".exe") || !raw.contains("portable") {
        return None;
    }
    if raw.contains("..") {
        return None;
    }
    if !raw
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '+'))
    {
        return None;
    }
    Some(raw)
}

/// 落盘失败的错误码由写操作自己报；reqwest 的错误一律归 `network`。
///
/// 旧 Node 版把所有下载失败都塞进一个 `catch` 然后 `fail('disk')`，包括对端断流——那是错的，
/// 用户看到"磁盘错误"却无从下手。`src/shared/update.ts` 的错误码里没有更细的档，
/// 也不值得为这个加一档：网络问题在界面上是同一句话。
fn network_error(_: reqwest::Error) -> String {
    "network".to_string()
}

/// 丢弃临时文件；失败无所谓，本来就只是不留垃圾。
async fn discard(path: &PathBuf) {
    let _ = tokio::fs::remove_file(path).await;
}

/// 流式下载 + 逐块 SHA-256，成功返回十六进制摘要（小写）。
///
/// 错误一律是短代码字符串：`network` / `disk` / `too-large` / `cancelled`。
#[tauri::command]
pub async fn download_update(
    app: AppHandle,
    url: String,
    file_name: String,
    state: State<'_, UpdaterState>,
) -> Result<String, String> {
    let name = safe_file_name(&file_name).ok_or("disk")?.to_string();
    let final_path = updates_dir(&app)?.join(&name);
    let tmp_path = final_path.with_extension("part");

    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut active = state.active.lock().map_err(|_| "disk".to_string())?;
        *active = Some(Download {
            cancel: Arc::clone(&cancel),
        });
    }

    let result = run(&app, &cancel, &url, &tmp_path, &final_path).await;

    // 无论成败都收摊，UI 之后不会再看这条进度。
    if let Ok(mut active) = state.active.lock() {
        *active = None;
    }
    result
}

async fn run(
    app: &AppHandle,
    cancel: &AtomicBool,
    url: &str,
    tmp_path: &PathBuf,
    final_path: &PathBuf,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .connect_timeout(CONNECT_TIMEOUT)
        // 更新包必须走完整的重定向链（GitHub 的 302 到对象存储），默认策略即可。
        .build()
        .map_err(|_| "network".to_string())?;

    let response = client.get(url).send().await.map_err(network_error)?;
    if !response.status().is_success() {
        return Err("network".into());
    }
    let total = response.content_length().unwrap_or(0);

    let file = tokio::fs::File::create(tmp_path)
        .await
        .map_err(|_| "disk".to_string())?;
    let mut writer = BufWriter::with_capacity(64 * 1024, file);
    let mut hasher = Sha256::new();
    let mut transferred: u64 = 0;
    let mut last_emit = std::time::Instant::now();
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        if cancel.load(Ordering::SeqCst) {
            drop(writer);
            discard(tmp_path).await;
            return Err("cancelled".into());
        }
        let chunk = chunk.map_err(network_error)?;
        if transferred + chunk.len() as u64 > MAX_DOWNLOAD_BYTES {
            drop(writer);
            discard(tmp_path).await;
            return Err("too-large".into());
        }
        hasher.update(&chunk);
        writer
            .write_all(&chunk)
            .await
            .map_err(|_| "disk".to_string())?;
        transferred += chunk.len() as u64;

        // 节流：与今天一样，80 毫秒一次；下载完成那一下必定会发一次（循环外）。
        if last_emit.elapsed() >= CHUNK_PROGRESS_INTERVAL {
            last_emit = std::time::Instant::now();
            let _ = app.emit(PROGRESS_EVENT, Progress { transferred, total });
        }
    }

    if cancel.load(Ordering::SeqCst) {
        drop(writer);
        discard(tmp_path).await;
        return Err("cancelled".into());
    }
    writer.flush().await.map_err(|_| "disk".to_string())?;
    drop(writer);

    // 原子改名：与 settings.json / holidays 缓存同一套写法，不留半个文件。
    tokio::fs::rename(tmp_path, final_path)
        .await
        .map_err(|_| "disk".to_string())?;

    let _ = app.emit(
        PROGRESS_EVENT,
        Progress {
            transferred,
            total: if total == 0 { transferred } else { total },
        },
    );
    Ok(format!("{:x}", hasher.finalize()))
}

/// 中止当前下载。没有进行中的下载时什么都不做（今天的 `cancelUpdate` 同样只是幂等地拨开关）。
#[tauri::command]
pub fn cancel_update(state: State<'_, UpdaterState>) -> Result<(), String> {
    let guard = state.active.lock().map_err(|_| "disk".to_string())?;
    if let Some(download) = guard.as_ref() {
        download.cancel.store(true, Ordering::SeqCst);
    }
    Ok(())
}

/// 删掉已下载的产物（校验不通过时 TS 会调用它）。
#[tauri::command]
pub async fn delete_update(app: AppHandle, file_name: String) -> Result<(), String> {
    let name = safe_file_name(&file_name).ok_or("disk")?;
    // 暂存区不存在 = 没有东西可删，这是成功而不是失败（下面"文件本来就不在"同一意义）。
    let Some(dir) = existing_updates_dir(&app) else {
        return Ok(());
    };
    let path = dir.join(name);
    match tokio::fs::remove_file(&path).await {
        Ok(()) => Ok(()),
        // 文件本来就不在，等同于删除成功。
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("disk".into()),
    }
}

/// 安装 = 原地替换掉正在运行的自己 + 派一个等待者，然后本进程退出。
///
/// 与旧版有一处关键差别：**失败时本进程不退**。旧版是"先起新版、四百毫秒后自杀"，
/// 新版起没起来、为什么没起来都无人知道；现在"换字节"这件事在本进程里做完，
/// 任何一步不对劲都原样退回错误态，界面上第一次有话说，也留着重试的机会。
///
/// `sha256` 是 TS 已经判过一次的那个基准，交回来在**换掉自己之前**复验一次落盘的字节：
/// 判据仍然在 TS，这里只是把"复制到目标盘是否完整"这个只有本机知道的事实核对掉。
#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    file_name: String,
    sha256: String,
) -> Result<(), String> {
    let name = safe_file_name(&file_name).ok_or("install-failed")?;
    let staged = updates_dir(&app)?.join(&name);
    // "我从哪个版本更新来的"只有旧进程知道自己。这个值由等待者带进新进程，供界面自证。
    let updated_from = app.package_info().version.to_string();
    let handle = app.clone();

    // 复制 10 MB + 算一遍摘要 + 两次 rename 都是同步文件操作，别把它们放在主线程上。
    let outcome = tauri::async_runtime::spawn_blocking(move || {
        replace::install_in_place(&staged, &sha256, &updated_from)
    })
    .await
    .map_err(|_| "install-failed".to_string())?;
    outcome.map_err(|code| code.to_string())?;

    // 这四百毫秒不是在等新版起来——那是等待者的职责（它等的是旧进程的结束）——
    // 只是让状态与 IPC 应答先落地，再开始拆窗口。
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(400)).await;
        handle.exit(0);
    });
    Ok(())
}

/// 界面需要、但只有本机答得出的两件事。见 `UpdateState.installPath` 与 `updatedFrom`。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateContext {
    install_path: String,
    updated_from: Option<String>,
}

/// 更新会写到哪个路径、这次启动是不是刚更新完。
#[tauri::command]
pub fn update_context() -> UpdateContext {
    UpdateContext {
        install_path: replace::install_path().unwrap_or_default(),
        updated_from: replace::updated_from().map(|tag| tag.to_string()),
    }
}

/// `updates\` 里暂存资产的保留期（天）。等待者被杀、用户改了主意、下了却没装，
/// 都不该让这个目录每版堆 10 MB 长下去。
pub const STAGED_RETENTION_DAYS: i64 = 7;

/// 清掉暂存区里的垃圾：被中断的 `.part`，以及过了保留期的资产。
///
/// `.part` 只有崩溃才会留下（正常路径是原子改名），所以它永远不可能变成"可用的下载"；
/// 留着只会让人以为下载还停在某个百分比上。
pub fn sweep_updates_dir(app: &AppHandle) {
    // 启动路径上跑的正是这一个：目录不在就是没东西可扫，绝不能"为了扫而把它建出来"。
    let Some(dir) = existing_updates_dir(app) else {
        return;
    };
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let text = entry.file_name().to_string_lossy().to_string();
        if text.ends_with(".part") {
            let _ = std::fs::remove_file(&path);
        } else if text.ends_with(".exe") {
            if let Some(age) = modified_days_ago(&path) {
                if age > STAGED_RETENTION_DAYS {
                    let _ = std::fs::remove_file(&path);
                }
            }
        }
    }
}

fn modified_days_ago(path: &Path) -> Option<i64> {
    let modified = std::fs::metadata(path).ok()?.modified().ok()?;
    let elapsed = std::time::SystemTime::now().duration_since(modified).ok()?;
    Some(elapsed.as_secs() as i64 / 86_400)
}
