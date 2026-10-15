//! 便携版的**原地**自更新：把新字节换到"用户双击的那个路径"上，并保证新实例只在旧进程
//! 真的结束之后才启动。
//!
//! 这一模块存在的理由是三条互相咬住的硬约束，少任何一条都会退化成"关掉应用但不再打开"：
//!
//! 1. **更新必须落在 `current_exe()` 那个路径上。** 便携版的承诺是"我把 exe 放在哪它就在哪"。
//!    把新版写进 `%APPDATA%` 再指望用户去那儿双击，等于把 launcher、快捷方式、以及"下次别再
//!    提示更新"三件事都丢回给用户——旧版就是坏在这里，用户"找不到下载的新版本"。
//! 2. **新实例必须在旧进程结束之后才启动。** `tauri-plugin-single-instance` 的互斥体只按
//!    `identifier` 命名（不含版本号），所以旧进程还活着时拉起的新版会被认成"第二个实例"，
//!    在它自己的 plugin setup 里 `std::process::exit(0)`——那时窗口都还没建。
//!    而一个进程无法在自己退出之后再做任何事，所以**必须有进程外的等待者**；
//!    "先 spawn 再 sleep 400 毫秒"是在赌对方的启动耗时，从来就不是对的写法。
//! 3. **Windows 不允许覆盖或删除正在运行的映像，但允许重命名它。** 于是腾位置靠 rename，
//!    不靠删除，也不靠"重启后再清理"。
//!
//! 分工因此是：本进程只做"换字节"这件必须原子的事，然后把收尾交给同一个 exe 的隐藏等待者
//! 模式（[`WAIT_FLAG`]）——由它等旧进程结束、删掉旧映像、拉起新版。
//!
//! 等待者**不去碰那把互斥体**：命名对象只要还有一个句柄开着就仍然存在，`CreateMutexW` 照样
//! 返回 `ERROR_ALREADY_EXISTS`，那样等于把原来那个 bug 原封不动搬进等待者。这里等的是旧进程的
//! 进程句柄，语义恰好就是"这个 PID 结束了"。

use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;

use sha2::{Digest, Sha256};

/// 同一个 exe 的第二种身份：被更新的应用，以及替新版把门打开的等待者。
///
/// **这是跨版本的冻结契约**：换完字节之后跑这段代码的是新二进制，而参数是旧版本传出去的。
/// 改参数名不会让当前版本出问题，只会让"从上一个版本升上来"的那一次退化成固定等
/// [`FALLBACK_DELAY`] 再重启。要改就得同时想清楚那一次升级的兼容。
pub const WAIT_FLAG: &str = "--__updater-wait";
/// 更新完成后带在新进程上的一次用参数：设置页据此说"已从 0.1.4 更新到 0.2.0"，
/// 于是这条链路第一次有了可观测的结果——旧版连"到底更没更上"都无人知道。
pub const UPDATED_FROM_FLAG: &str = "--updated-from";

/// 等待者参数：等谁结束。
const PID_FLAG: &str = "--pid";

/// 等旧进程结束的上限。真走到上限说明旧进程卡在退出路径上；这时照样拉起新版——大概率被
/// single-instance 挡掉，但磁盘上的文件已经是新的了，用户再开一次就是新版。
#[cfg(windows)]
const WAIT_PROCESS_TIMEOUT_MS: u32 = 20_000;
#[cfg(not(windows))]
const WAIT_PROCESS_POLL: std::time::Duration = std::time::Duration::from_millis(100);
#[cfg(not(windows))]
const WAIT_PROCESS_POLL_LIMIT: u32 = 200;
/// 认不出 `--pid` 时的固定等待：宁可慢三秒，也不要"两个都不在了"。
const FALLBACK_DELAY: std::time::Duration = std::time::Duration::from_secs(3);

/// 错误码，与 `src/shared/update.ts` 里的字符串同源。
const ERR_INSTALL: &str = "install-failed";
const ERR_DISK: &str = "disk";
const ERR_NOT_WRITABLE: &str = "target-not-writable";
/// 摘要不符。`paths.rs` 搬数据目录时也要问同一个问题（"字节 landed 且一致吗"），
/// 所以这个码与 [`copy_then_verify`]、[`sha256_file`]、[`probe_writable`] 一起对 crate 内可见。
pub(crate) const ERR_CHECKSUM: &str = "checksum-mismatch";

/// 本次启动是否来自一次原地更新（由 `--updated-from` 带入，进程内事实，不进设置文件）。
static UPDATED_FROM: OnceLock<Option<String>> = OnceLock::new();

/// 等待者模式的输入。字段可空是刻意的：参数可能来自另一个版本的自己，认不全也要把活干完。
pub struct WaitRequest {
    pid: Option<u32>,
    updated_from: Option<String>,
}

/// 把命令行认成等待者请求；没有 [`WAIT_FLAG`] 时返回 `None`，也就是普通启动。
///
/// 只用 `args_os()`：路径里带空格与汉字是便携版的日常（`D:\临时\万年历 0.2\…exe`），
/// 用 `String` 收参数恰好会在最需要更新能用的机器上坏掉。
pub fn parse_wait_request() -> Option<WaitRequest> {
    if !std::env::args_os().any(|arg| arg == OsStr::new(WAIT_FLAG)) {
        return None;
    }

    let mut pid = None;
    let mut updated_from = None;
    let mut rest = std::env::args_os().skip(1);
    while let Some(arg) = rest.next() {
        // 缺值的坏参数只跳过这一个旗标：整个请求仍然成立，兜底路径会把它干完。
        let Some(value) = rest.next() else { continue };
        let text = value.to_string_lossy().to_string();
        if arg == OsStr::new(PID_FLAG) {
            pid = text.trim().parse::<u32>().ok();
        } else if arg == OsStr::new(UPDATED_FROM_FLAG) {
            updated_from = safe_version_tag(&text).map(|tag| tag.to_string());
        }
    }

    Some(WaitRequest { pid, updated_from })
}

/// 普通启动时读一遍 `--updated-from`，存进进程内常量供 `update_context` 命令取用。
pub fn record_updated_from_arg() {
    let mut found = None;
    let mut argv = std::env::args_os().skip(1);
    while let Some(arg) = argv.next() {
        if arg == OsStr::new(UPDATED_FROM_FLAG) {
            if let Some(value) = argv.next() {
                found = safe_version_tag(&value.to_string_lossy())
                    .map(|tag| tag.to_string())
                    .or(found);
            }
        }
    }
    let _ = UPDATED_FROM.set(found);
}

/// 本次启动来自哪个版本；不是更新来的就是 `None`。
pub fn updated_from() -> Option<&'static str> {
    UPDATED_FROM.get().and_then(|value| value.as_deref())
}

/// 正在运行的那个 exe 的绝对路径——"更新写到了哪里"的唯一起点，也是界面该说的那个路径。
pub fn install_path() -> Option<String> {
    std::env::current_exe()
        .ok()
        .map(|path| path.to_string_lossy().into_owned())
}

/// 版本号字面量的护栏。这个值来自我们自己的命令行，但它会被拼回下一次启动的参数，
/// 所以只收"看起来像版本号"的字符，其余当作没有。
fn safe_version_tag(raw: &str) -> Option<&str> {
    let text = raw.trim();
    if text.is_empty() || text.len() > 64 {
        return None;
    }
    text.chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '+' | '_'))
        .then_some(text)
}

/// 摘要必须是 64 个十六进制字符。
fn is_hex64(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f' | b'A'..=b'F'))
}

/// 换字节的提交点：全部在本进程里做完，任何一步失败都保证磁盘还是原样。
///
/// 顺序是有理由的：先把新字节复制成**同目录**的 `.new` 并复验摘要，然后才动正在运行的自己。
/// 跨卷复制无所谓（暂存在 `%APPDATA%`、目标在 `D:\` 是常态）；两次 rename 因为同目录才是原子的，
/// 所以绝不允许出现"旧的已改名走了、新的还没就位"那个被人看见的中间态。
pub fn install_in_place(
    staged: &Path,
    expected_digest: &str,
    updated_from: &str,
) -> Result<(), &'static str> {
    let target = std::env::current_exe().map_err(|_| ERR_INSTALL)?;
    let dir = target.parent().ok_or(ERR_INSTALL)?;

    // 直接从 updates\ 里双击起来的那种情况：目标就是暂存文件本身，"原地替换自己"是空操作，
    // 而且中间态里 rename 自己会失败。宁可拒绝，也别表演一次什么都没发生。
    if same_file(staged, &target) {
        return Err(ERR_INSTALL);
    }
    let staged_bytes = std::fs::metadata(staged).map_err(|_| ERR_DISK)?.len();
    if staged_bytes == 0 {
        return Err(ERR_INSTALL);
    }
    if !is_hex64(expected_digest) {
        return Err(ERR_CHECKSUM);
    }

    // 调试版换掉的是 `target/debug/chinese-calendar.exe`：cargo 仍以为那个文件是它刚产出的，
    // 下一次 `npm run dev` 就换一个我们不知道内容的二进制。想在本机验证更新链路，
    // 用 `npm run package` 的产物，或临时设 TYME_ALLOW_DEV_IN_PLACE_UPDATE=1（见 docs/packaging.md）。
    if cfg!(debug_assertions) && std::env::var_os("TYME_ALLOW_DEV_IN_PLACE_UPDATE").is_none() {
        eprintln!(
            "万年历：调试版不做原地替换（换掉 target/debug 里的开发二进制会让 cargo 的构建状态失真）。\
             \n请改用 `npm run package` 的产物，或临时设 TYME_ALLOW_DEV_IN_PLACE_UPDATE=1。"
        );
        return Err(ERR_INSTALL);
    }

    // 1. 预检：目标目录写不进去就别往下走。旧版是"100 MB 都下完了才说装不上"。
    probe_writable(dir)?;

    let staging = appended(&target, ".new").ok_or(ERR_INSTALL)?;
    let trash = appended(&target, ".old.exe").ok_or(ERR_INSTALL)?;

    // 2. 复制并复验。TS 已经对着 GitHub 的 digest 判过一次；这里判的是"落到目标盘上的这份
    //    还是不是那串字节"——判断的基准由 TS 传进来，Rust 不自己记分，也不改判据。
    copy_then_verify(staged, &staging, staged_bytes, expected_digest)?;

    // 3. 腾位：正在运行的映像不能被覆盖，但可以改名。这一步失败磁盘还是原样。
    if std::fs::rename(&target, &trash).is_err() {
        let _ = std::fs::remove_file(&staging);
        return Err(ERR_INSTALL);
    }

    // 4. 就位。这一步失败必须把名字还回去，否则用户得到一个被自己的应用改空了的文件夹。
    if std::fs::rename(&staging, &target).is_err() {
        if std::fs::rename(&trash, &target).is_ok() {
            let _ = std::fs::remove_file(&staging);
        } else {
            // 回滚也失败：新字节就留在 `.new` 里，别删，让用户自己捡回来。
            eprintln!("万年历：原地替换回滚失败，请手动处理 {}", dir.display());
            reveal(&staging);
        }
        return Err(ERR_INSTALL);
    }

    // 5. 交给等待者。起不来就把一切复原——"文件换了但没人重启"比"没换"更难解释。
    if spawn_wait(&target, updated_from).is_err() {
        let _ = std::fs::rename(&target, &staging);
        if std::fs::rename(&trash, &target).is_err() {
            reveal(&staging);
        }
        return Err(ERR_INSTALL);
    }

    // 6. 暂存文件已经没有用处：目标路径上就是同一份字节。趁本进程还活着删掉，
    //    等待者因此不需要知道任何"可以删的路径"——少一个拿命令行当删除清单的原语。
    let _ = std::fs::remove_file(staged);

    Ok(())
}

/// 等待者主流程：等旧进程结束 → 删旧映像 → 拉起新版 → 退场。调用方不返回。
///
/// 它跑在**新字节**里（[`install_in_place`] 已经把自己换掉了），这正是 [`WAIT_FLAG`] 属于冻结
/// 契约的原因：认不全参数时也要把活干完，只是慢三秒。
pub fn run_wait(request: WaitRequest) -> ! {
    match request.pid {
        Some(pid) => wait_for_process_gone(pid),
        None => {
            eprintln!("万年历：等待者没拿到可等待的 PID，改用固定等待。");
            std::thread::sleep(FALLBACK_DELAY);
        }
    }

    match std::env::current_exe() {
        Ok(target) => {
            if launch(&target, request.updated_from.as_deref()) {
                // 新版已经被拉起来，旧映像就只是垃圾；留着它反而让人以为有两个版本。
                if let Some(trash) = appended(&target, ".old.exe") {
                    let _ = std::fs::remove_file(&trash);
                }
            }
        }
        Err(error) => eprintln!("万年历：等待者取不到自身路径（{error}），放弃重启。"),
    }

    std::process::exit(0);
}

/// 拉起已经就位的新版。失败时在资源管理器里选中它——旧版连这条兜底都没有。
fn launch(target: &Path, updated_from: Option<&str>) -> bool {
    let mut command = Command::new(target);
    if let Some(tag) = updated_from {
        command.arg(UPDATED_FROM_FLAG).arg(tag);
    }
    detach(&mut command);
    match command.spawn() {
        // `Child` 在这里被丢弃：Windows 上那只是关闭句柄，不会终止子进程。
        Ok(_child) => true,
        Err(error) => {
            eprintln!("万年历：更新后无法启动 {}（{error}）。", target.display());
            reveal(target);
            false
        }
    }
}

/// 启动后清扫上一次更新留下的 `.old.exe` 与被中断的 `.new`。
///
/// 放在启动而不是放在"安装成功之后"，是因为安装之后那段代码属于正在退出的旧进程，
/// 而等待者可能连自己都没跑完。让下一个真正活下来的实例去扫，才是有把握的时机。
pub fn cleanup_exe_dir() {
    let Ok(exe) = std::env::current_exe() else {
        return;
    };
    let Some(dir) = exe.parent() else { return };
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        if leftover_of_ours(&name) {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

/// 只认"我们自己的产物名 + 我们自己的后缀"，绝不碰别人的 `.new`，也不碰正在运行的自己。
fn leftover_of_ours(name: &OsStr) -> bool {
    let text = name.to_string_lossy();
    text.contains(".exe") && (text.ends_with(".old.exe") || text.ends_with(".exe.new"))
}

fn appended(path: &Path, suffix: &str) -> Option<PathBuf> {
    let mut name = path.file_name()?.to_os_string();
    name.push(OsStr::new(suffix));
    Some(path.with_file_name(name))
}

fn same_file(a: &Path, b: &Path) -> bool {
    match (std::fs::canonicalize(a), std::fs::canonicalize(b)) {
        (Ok(left), Ok(right)) => left == right,
        _ => false,
    }
}

/// 用一个必定不存在的新文件试写再删：权限、配额、写保护 U 盘都在这一步暴露，
/// 而不是在下载完成之后。
pub(crate) fn probe_writable(dir: &Path) -> Result<(), &'static str> {
    // 必须是 `dir` 里的探针，不是在 `dir` 的名字后面拼一段：后者测的是父目录能不能写，
    // 于是"这个文件夹不让写"这一条恰恰测不出来（单测抓到过一次）。
    let probe = dir.join(".tyme-write-probe");
    if std::fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&probe)
        .is_ok()
    {
        let _ = std::fs::remove_file(&probe);
        Ok(())
    } else {
        Err(ERR_NOT_WRITABLE)
    }
}

pub(crate) fn copy_then_verify(
    from: &Path,
    to: &Path,
    expected_bytes: u64,
    expected_digest: &str,
) -> Result<(), &'static str> {
    let copied = std::fs::copy(from, to).map_err(|_| ERR_DISK)?;
    if copied != expected_bytes {
        let _ = std::fs::remove_file(to);
        return Err(ERR_DISK);
    }
    match sha256_file(to) {
        Some(actual) if actual == expected_digest => Ok(()),
        Some(_) => {
            // 换掉自己之前的最后一道闸：摘要不符就绝不去动那个正在运行的文件。
            let _ = std::fs::remove_file(to);
            Err(ERR_CHECKSUM)
        }
        None => {
            let _ = std::fs::remove_file(to);
            Err(ERR_DISK)
        }
    }
}

pub(crate) fn sha256_file(path: &Path) -> Option<String> {
    use std::io::Read;
    let mut file = std::fs::File::open(path).ok()?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 64 * 1024];
    loop {
        match file.read(&mut buffer) {
            Ok(0) => break,
            Ok(read) => hasher.update(&buffer[..read]),
            Err(_) => return None,
        }
    }
    Some(format!("{:x}", hasher.finalize()))
}

/// 把等待者派出去。参数只有旗标与本进程 PID：等待者不需要知道任何"可以删的路径"。
fn spawn_wait(target: &Path, updated_from: &str) -> Result<(), &'static str> {
    let mut command = Command::new(target);
    command
        .arg(WAIT_FLAG)
        .arg(PID_FLAG)
        .arg(std::process::id().to_string());
    if let Some(tag) = safe_version_tag(updated_from) {
        command.arg(UPDATED_FROM_FLAG).arg(tag);
    }
    detach(&mut command);
    // 丢弃 Child：关闭句柄而不终止它。
    command.spawn().map_err(|_| ERR_INSTALL)?;
    Ok(())
}

#[cfg(windows)]
pub(crate) fn detach(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    // 调试版是控制台子系统，不加这个标志就会闪出一个黑框。
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
pub(crate) fn detach(_command: &mut Command) {}

#[cfg(windows)]
fn reveal(path: &Path) {
    let _ = Command::new("explorer.exe")
        .arg(format!("/select,{}", path.display()))
        .spawn();
}

#[cfg(not(windows))]
fn reveal(_path: &Path) {}

/// 等一个 PID 结束。等不到也返回——调用方的选择是"照样拉起新版"，见 [`WAIT_PROCESS_TIMEOUT_MS`]。
#[cfg(windows)]
fn wait_for_process_gone(pid: u32) {
    const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
    const PROCESS_SYNCHRONIZE: u32 = 0x0010_0000;
    const WAIT_OBJECT_0: u32 = 0;

    // 与 report.rs 同一个做法：只要三个函数，就不为它们引入 windows 元 crate。
    #[link(name = "kernel32")]
    extern "system" {
        fn OpenProcess(access: u32, inherit: i32, pid: u32) -> *mut core::ffi::c_void;
        fn WaitForSingleObject(handle: *mut core::ffi::c_void, ms: u32) -> u32;
        fn CloseHandle(handle: *mut core::ffi::c_void) -> i32;
    }

    let handle = unsafe {
        OpenProcess(
            PROCESS_SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION,
            0,
            pid,
        )
    };
    if handle.is_null() {
        // 打不开句柄最平常的解释是"它已经不在了"：正常路径上旧进程在这几毫秒里早就退完了。
        return;
    }
    let state = unsafe { WaitForSingleObject(handle, WAIT_PROCESS_TIMEOUT_MS) };
    unsafe {
        CloseHandle(handle);
    }
    if state != WAIT_OBJECT_0 {
        eprintln!("万年历：等待旧进程 {pid} 结束超时，仍然尝试拉起新版。");
    }
}

/// 非 Windows：轮询 `/proc/<pid>` 到它消失。本机不出这个产物，写出来是为了让 `cargo check`
/// 在别的平台上也不缺一块实现。
#[cfg(not(windows))]
fn wait_for_process_gone(pid: u32) {
    let proc = PathBuf::from(format!("/proc/{pid}"));
    for _ in 0..WAIT_PROCESS_POLL_LIMIT {
        if !proc.exists() {
            return;
        }
        std::thread::sleep(WAIT_PROCESS_POLL);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 测试目录一律开在 `target/` 下面：cargo 正在往那儿写，所以它必然可写；而 `TEMP` 在不同
    /// 运行环境里会被重定向，甚至指到一个不让你新建目录的位置——把测试挂在那上面不稳。
    fn temp_case(name: &str) -> PathBuf {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or(0);
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/tyme-replace-tests");
        let dir = root.join(format!(
            "tyme-replace-test-{}-{}-{stamp}",
            std::process::id(),
            name
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("建测试目录（在 target/ 下）");
        dir
    }

    #[test]
    fn interim_names_derive_from_the_target() {
        let target = PathBuf::from("chinese-calendar-0.1.4-portable.exe");
        assert_eq!(
            appended(&target, ".new").unwrap(),
            PathBuf::from("chinese-calendar-0.1.4-portable.exe.new")
        );
        assert_eq!(
            appended(&target, ".old.exe").unwrap(),
            PathBuf::from("chinese-calendar-0.1.4-portable.exe.old.exe")
        );
    }

    #[test]
    fn sweep_recognises_only_our_own_names() {
        assert!(leftover_of_ours(OsStr::new(
            "chinese-calendar-0.1.4-portable.exe.old.exe"
        )));
        assert!(leftover_of_ours(OsStr::new(
            "chinese-calendar-0.2.0-portable.exe.new"
        )));
        // 不是我们的名字就不该删：别人的 .new 与正在运行的自己。
        assert!(!leftover_of_ours(OsStr::new("notes.txt.new")));
        assert!(!leftover_of_ours(OsStr::new("tool.exe")));
        assert!(!leftover_of_ours(OsStr::new(
            "chinese-calendar-0.2.0-portable.exe"
        )));
    }

    #[test]
    fn version_tag_accepts_only_version_characters() {
        assert_eq!(safe_version_tag(" 0.1.4 "), Some("0.1.4"));
        assert_eq!(
            safe_version_tag("1.2.3-rc.1+build_9"),
            Some("1.2.3-rc.1+build_9")
        );
        // 会被拼回下一次启动的命令行：空格、旗标、汉字都不可信。
        assert_eq!(safe_version_tag("0.1.4 --asset=x"), None);
        assert_eq!(safe_version_tag(""), None);
        assert_eq!(safe_version_tag("万年历"), None);
    }

    #[test]
    fn digest_must_be_sixty_four_hex_characters() {
        assert!(is_hex64(&"0".repeat(64)));
        assert!(!is_hex64(&"a".repeat(63)));
        assert!(!is_hex64(&"g".repeat(64)));
    }

    #[test]
    fn unwritable_directory_reports_the_actionable_code() {
        let dir = temp_case("writable");
        assert_eq!(probe_writable(&dir), Ok(()));
        assert_eq!(
            probe_writable(&dir.join("no-such-subdir")),
            Err(ERR_NOT_WRITABLE),
            "写保护介质与被拿走的 U 盘就是这个样子"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_failed_reverification_leaves_nothing_behind() {
        let dir = temp_case("verify");
        let from = dir.join("chinese-calendar-0.2.0-portable.exe");
        std::fs::write(&from, b"not a real exe").unwrap();
        let to = dir.join("chinese-calendar-0.2.0-portable.exe.new");
        let bytes = std::fs::metadata(&from).unwrap().len();

        assert_eq!(
            copy_then_verify(&from, &to, bytes, &"0".repeat(64)),
            Err(ERR_CHECKSUM),
            "摘要不符必须拒绝，而且不留半成品"
        );
        assert!(!to.exists());
        assert_eq!(
            copy_then_verify(&from, &to, 9_999, &"0".repeat(64)),
            Err(ERR_DISK),
            "复制字节数与来源不符就是 disk"
        );
        assert!(!to.exists());

        let actual = sha256_file(&from).expect("算得出摘要");
        assert_eq!(copy_then_verify(&from, &to, bytes, &actual), Ok(()));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn replacing_itself_is_refused() {
        let dir = temp_case("self");
        let itself = dir.join("chinese-calendar-0.2.0-portable.exe");
        std::fs::write(&itself, b"x").unwrap();
        // 断言的是判定本身：install_in_place 用的是 current_exe()，在测试里那是 cargo 的
        // 测试二进制。端到端那一段只能拿 `npm run package` 的产物手动验，见 docs/packaging.md。
        assert!(same_file(&itself, &itself));
        assert!(!same_file(&itself, Path::new("nope")));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn an_ordinary_launch_is_not_a_waiter() {
        // 测试进程自己的命令行里没有 WAIT_FLAG，因此这里必须解析不出请求。
        // 真正的"带参数启动"要在产物上手动冒烟——进程级行为没法在这个粒度上伪造。
        assert!(std::env::args_os().all(|arg| arg != OsStr::new(WAIT_FLAG)));
        assert_eq!(safe_version_tag("0.0.0-test"), Some("0.0.0-test"));
    }
}
