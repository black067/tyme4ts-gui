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

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncWriteExt, BufWriter};

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
fn updates_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "disk".to_string())?
        .join("updates");
    std::fs::create_dir_all(&dir).map_err(|_| "disk".to_string())?;
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
    let path = updates_dir(&app)?.join(name);
    match tokio::fs::remove_file(&path).await {
        Ok(()) => Ok(()),
        // 文件本来就不在，等同于删除成功。
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("disk".into()),
    }
}

/// 启动产物并退出。TS 侧已经确认过 `canInstall`，这里只补本机事实：文件在、非空。
///
/// 失败时像今天 `shell.showItemInFolder` 那样在资源管理器里选中它——用户至少能手动双击。
#[tauri::command]
pub fn install_update(app: AppHandle, file_name: String) -> Result<(), String> {
    let name = safe_file_name(&file_name).ok_or("install-failed")?;
    let path = updates_dir(&app)?.join(name);
    let metadata = std::fs::metadata(&path).map_err(|_| "install-failed")?;
    if metadata.len() == 0 {
        return Err("install-failed".into());
    }

    // 子进程独立于本进程：新实例要在旧进程退出之后才允许启动（single-instance 只看窗口）。
    if std::process::Command::new(&path).spawn().is_err() {
        let _ = std::process::Command::new("explorer.exe")
            .arg(format!("/select,{}", path.display()))
            .spawn();
        return Err("install-failed".into());
    }

    // 与今天 `setTimeout(() => app.quit(), 400)` 一样：留一点时间让状态先落地。
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(400)).await;
        handle.exit(0);
    });
    Ok(())
}
