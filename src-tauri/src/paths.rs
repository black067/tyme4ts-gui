//! 数据目录：它在哪、没有的时候怎么让用户选一个、怎么搬到别处、怎么整份删掉。
//!
//! 全仓库的读写都走 `plugin-fs` 的 `BaseDirectory.AppData`（见 `src/backend/host.ts`），而它
//! 由 `tauri.conf.json` 的 `appDirectoriesOverride.data` 决定。Tauri 2.12 允许在
//! `Builder::run(context)` 之前改这份配置，**并且能力清单里的 `$APPDATA/**` 跟着 override 走**
//! （`tauri_utils::config::AppConfig::app_directories_override` 的 Security 一节写明了这点）。
//! 所以"换一个数据目录"不需要放宽任何权限：改指向，权限范围自己跟过去。
//!
//! 也正因为权限跟着走，目标必须是本应用专用的目录——选一个混着别的东西的文件夹，等于把整个
//! 文件夹交给 webview 读写。于是这里只报事实（空不空、有没有我们的标记、写不写得进去），
//! 判断留在 `src/backend/data-dir.ts`：与更新那条链路一样的分工。
//!
//! 有四件事值得各自说明一次：
//!
//! 1. **指针文件不能存在数据目录里。** 它记的内容就是"数据目录在哪"，而那个目录正是等着被搬走
//!    的东西。锚点按 `identifier` 定位（Windows 是 `%APPDATA%\com.tyme.desktop`），与 override
//!    无关，也就与搬没搬过无关。
//! 2. **指向只能在进程开始之前定下来。** `config_mut()` 只在 `Context` 上有（Tauri 的
//!    `lib.rs:438`），而 `Builder::build()` 里 `initialize_plugins` 就把 `$APPDATA` 解析完了，
//!    比用户的 `setup()` 还早。所以选完位置唯一诚实的做法是**重启一次**（[`relaunch`]），
//!    而不是"本次会话先在旧目录里凑合"——凑合意味着要凭空造一个用户没选过的目录出来。
//! 3. **启动不建目录。** 找不到既有的用户目录就回 [`StartupPlan::NeedsChoice`]，把"要不要在这
//!    儿建一个"这个决定交回给人。只有 [`choose_data_dir`] 会建目录，因为那一下是用户按的。
//!    指针指向的盘不在（拔掉的移动硬盘是最常见的一种）也不算例外：这次仍然问用户，指针留着，
//!    盘插回来那天不需要重设一遍。
//! 4. **删除走回收站。** [`delete_data_dir`] 只对"能证明是本应用那份"的目录动手，并且只走
//!    `recycle.rs`：宁可拒绝，也不要在一张 FAT32 的 U 盘上把"移到回收站"变成静默的永久删除。

use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};
use tauri::utils::config::{AppDirectoriesOverride, AppDirectoryOverrides, Config};
use tauri::{AppHandle, Manager, State};

/// 指针文件，写在锚点目录里：`{ "dataDir": "D:\\万年历数据" }`。
const POINTER_FILE: &str = "location.json";
/// 标记文件，写进每一个本应用持有的数据目录。搬走之后旧目录也留着它，于是"再指回去"
/// 永远算数——那是最常见的第二次操作，不该被"这个目录非空"挡在外面。
const MARKER_FILE: &str = ".tyme-data-dir";
/// 设置文件的**名字**。Electron 时代与 v0.2.x 的目录里没有标记，但一定有这个文件，
/// 所以它是标记之外第二份"这个目录我们用过"的证据（[`has_settings`]）。
const SETTINGS_FILE: &str = "settings.json";
/// 认定"这是本应用的设置文件"要看到的键之一。只判文件存在太宽：谁都可能在自己的
/// 文件夹里放一个叫 `settings.json` 的东西，而这个目录从此就归 webview 读写了。
const SETTING_KEYS: &[&str] = &["themeId", "appearance", "locale", "autoUpdateHolidays"];
/// exe 同级的那个候选目录名。绿色便携的惯例：数据跟着 exe 走，就叫这个名字。
const EXE_DIR_NAME: &str = ".chinese-calendar";
/// 不搬的目录：里面全是可再生的东西（更新产物、下到一半的 `.part`）。
/// 搬一份 10 MB 的半成品到新地方，不如到了新地方重新下一次。
const SKIP_DIRS: &[&str] = &["updates"];

/// 选的就是当前正在用的那个目录。
pub const ERR_SAME: &str = "same";
/// 两个目录互相包含：搬进去等于自己套自己，复制会一路套娃。
pub const ERR_NESTED: &str = "nested";
/// 非空、又没有本应用的痕迹：不能确定这目录专给本应用用，也就不能把权限范围扩到它身上。
/// 删除时它的意思更硬——**认不出是自己的东西，就不进回收站**。
pub const ERR_NOT_DEDICATED: &str = "not-dedicated";
/// 写探针失败：只读盘、权限、满盘都归这一条。
pub const ERR_NOT_WRITABLE: &str = "not-writable";
/// 复制过去之后字节对不上。走到这里源目录一个文件都没删。
pub const ERR_VERIFY: &str = "verify";
/// 其余的磁盘与路径问题。
pub const ERR_DISK: &str = "disk";
/// 磁盘根（`D:\`、`E:\`）。空的根能通过上面所有检查，唯独过不了这一条：把整个盘
/// 交出来当数据目录，之后连"删掉自己的数据"都会变成删掉那块盘。
pub const ERR_ROOT: &str = "is-root";
/// 目录已经不在了。删除与搬运动作撞车时就是这个，而不是"没删成"。
pub const ERR_MISSING: &str = "missing";
/// 重启没被批准（调试版）或等待者起不来。`dev` 这个码与 `replace::ERR_DEV` 同源，
/// 界面据此说"重启后生效"而不是"出错了"。见 `src/backend/data-dir.ts`。
pub const ERR_DEV: &str = "dev";
/// 有文件正被别的程序读着，回收站不收。
pub const ERR_BUSY: &str = "busy";
/// 那块盘上没有回收站可去（U 盘、网络盘、光盘）。见 `recycle.rs`。
pub const ERR_NO_RECYCLE_BIN: &str = "no-recycle-bin";
/// 别的平台上不做这件事（回收站是 Windows 的功能）。
///
/// Windows 构建里 Rust 侧永远不会报这个码——只有 `recycle.rs` 的非 Windows 分支用得上。
/// 但它仍然属于契约：`src/shared/data-dir.ts` 里有同一批字符串，界面有对应的那句话。
/// `#[allow(dead_code)]` 是为了不让下一个人为了消警告把它删掉。
#[allow(dead_code)]
pub const ERR_UNSUPPORTED: &str = "unsupported";

/// 启动早期调用（`Builder::run(context)` 之前）：决定这次是用一个既有的用户目录，还是先问用户。
///
/// 返回值要一路带到建窗口那一步：`NeedsChoice` 时建的是那个小窗口，`Adopted` 时才是日历。
/// 任何一步不成立都只是"再问一次"，绝不让双击图标的人看到启动失败对话框。
pub fn apply_override(config: &mut Config) -> StartupPlan {
    match locations(config) {
        Some(places) => apply_override_at(config, &places),
        // 连 `$DATA` 都展开不出来（环境变量缺失）就没法记位置：直接问用户，
        // 那种机器上 `app_data_dir()` 本身也一样会失败，不值得为它编一个默认值。
        None => StartupPlan::NeedsChoice {
            reason: ChoiceReason::FirstRun,
            recorded: None,
        },
    }
}

/// 启动时对"用户目录在哪"做出的决定。
#[derive(Clone, Debug)]
pub enum StartupPlan {
    /// 找到了既有的用户目录：配置已经指向它（或者本来就落在配置写的默认位置上）。
    Adopted { path: PathBuf },
    /// 没有可用的既有目录，得先让用户选一个位置。
    NeedsChoice {
        reason: ChoiceReason,
        /// `RecordedMissing` 时那条指针记着的路径：界面把它原样填进"自定义"里，
        /// 用户按确定就能在原处重建（盘插回来的情形）。
        recorded: Option<String>,
    },
}

/// 为什么会走到"要用户选"。界面对外只说一句话，但这个区别决定了"自定义"里预填什么。
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ChoiceReason {
    /// 三个位置一个都没有：真正的第一次启动。
    FirstRun,
    /// 指针记着的目录不在了（拔掉的移动硬盘是最常见的一种）。
    RecordedMissing,
}

/// 启动要看的那三个位置。
///
/// 单独成一个结构是为了单测能造一个"什么都没有"的世界：真实的 `%APPDATA%` 里有老数据，
/// 而 `current_exe()` 在测试里指的是测试二进制，两个都不该被拿来做判断。
pub struct Locations {
    /// 指针的锚点目录（Windows 是 `%APPDATA%\<identifier>`）。
    anchor: PathBuf,
    /// 配置里写的默认数据目录，`$DATA` 已经展开。
    default: PathBuf,
    /// exe 同级的候选目录。
    exe: Option<PathBuf>,
}

/// [`apply_override`] 的实现，位置由参数给出。
fn apply_override_at(config: &mut Config, places: &Locations) -> StartupPlan {
    if let Some(chosen) = recorded_pointer(&places.anchor) {
        if chosen.is_dir() {
            return StartupPlan::Adopted {
                path: adopt(config, places, &chosen),
            };
        }
        // 指针说的地方不在盘上了。**不建它**：那等于替用户做一个他没做过的决定，
        // 也正是"启动就凭空造目录"要治的那件事。指针留着——盘插回来那天它自己就恢复了。
        return StartupPlan::NeedsChoice {
            reason: ChoiceReason::RecordedMissing,
            recorded: Some(chosen.display().to_string()),
        };
    }

    if places.default.is_dir() {
        return StartupPlan::Adopted {
            path: adopt(config, places, &places.default),
        };
    }

    if let Some(exe) = places.exe.as_deref() {
        // exe 同级这一项要留痕迹才算数：绿色便携版常被丢进下载目录，那里什么都有。
        if exe.is_dir() && (has_marker(exe) || has_settings(exe)) {
            return StartupPlan::Adopted {
                path: adopt(config, places, exe),
            };
        }
    }

    StartupPlan::NeedsChoice {
        reason: ChoiceReason::FirstRun,
        recorded: None,
    }
}

/// 认下这个目录当数据目录。**不建它**（走到这里它一定已经在盘上了），只做记号上的三件事：
/// 补一份标记、按需把配置的 `data` 指过去、按需记下指针。
///
/// 补标记不是多余动作：搬走之后旧目录只剩这一个文件，将来"指回去"才不需要用户先找到一个
/// 空文件夹；删除时也靠它证明"这是我们那份"。它写进已存在的目录，不是造目录。
///
/// 指向默认位置时什么都不用记：配置本来就去那儿，而留着一条"数据目录 = 默认目录"的指针
/// 只会让下一次启动多绕一步（所以顺手把它清掉）。指针写失败不当致命处理——这一轮已经按
/// 对的目录跑起来了，下一次启动还能靠目录里的痕迹重新认出来。
fn adopt(config: &mut Config, places: &Locations, dir: &Path) -> PathBuf {
    write_marker(dir);
    if canonical(dir) == canonical(&places.default) {
        remove_pointer(&places.anchor);
        return dir.to_path_buf();
    }
    config.app.app_directories_override = Some(only_data_changed(config, dir.to_path_buf()));
    let _ = write_pointer(&places.anchor, dir);
    dir.to_path_buf()
}

fn locations(config: &Config) -> Option<Locations> {
    Some(Locations {
        anchor: anchor_dir(config)?,
        default: default_data_dir(config)?,
        exe: exe_data_dir(),
    })
}

/// 指针记着的那个绝对路径。坏指针（相对路径、空串、不是 JSON）按"没有指针"处理。
fn recorded_pointer(anchor: &Path) -> Option<PathBuf> {
    let chosen = read_pointer(anchor)?;
    let path = PathBuf::from(&chosen);
    if !path.is_absolute() {
        // 指针是磁盘上的一个文件，谁都可能改。只接受说清楚了的位置，其余一律忽略。
        eprintln!("[tyme-app] 数据目录指针不是绝对路径（{chosen}），忽略。");
        return None;
    }
    Some(path)
}

/// 配置里的默认数据目录，`$DATA` 已展开。
fn default_data_dir(config: &Config) -> Option<PathBuf> {
    let declared = match config.app.app_directories_override.as_ref()? {
        AppDirectoriesOverride::Root(root) => root.clone(),
        AppDirectoriesOverride::Directories(directories) => directories.data.clone()?,
    };
    Some(expand_data(&declared))
}

/// 把配置里的 `$DATA/…` 展开成绝对路径；不含 `$DATA` 时原样返回。
///
/// 之所以自己展开一次：Tauri 只在 `path()` 那套 API 里做这件事，而那套 API 要 `AppHandle`
/// ——可指向必须在任何插件初始化之前定下来。展开规则与 Tauri 同源：`$DATA` 在 Windows 上
/// 就是 `%APPDATA%`（漫游），其余平台是 `$XDG_DATA_HOME` 或 `~/.local/share`。
fn expand_data(path: &Path) -> PathBuf {
    let raw = path.to_string_lossy().replace('\\', "/");
    let Some(rest) = raw.strip_prefix("$DATA") else {
        return path.to_path_buf();
    };
    let Some(base) = roaming_base() else {
        return path.to_path_buf();
    };
    let rest = rest.trim_start_matches('/');
    if rest.is_empty() {
        base
    } else {
        base.join(rest)
    }
}

#[cfg(windows)]
fn roaming_base() -> Option<PathBuf> {
    Some(PathBuf::from(std::env::var("APPDATA").ok()?))
}

#[cfg(not(windows))]
fn roaming_base() -> Option<PathBuf> {
    match std::env::var("XDG_DATA_HOME") {
        Ok(value) if !value.is_empty() => Some(PathBuf::from(value)),
        _ => Some(PathBuf::from(std::env::var("HOME").ok()?).join(".local/share")),
    }
}

/// exe 同级那个候选目录的完整路径。拿不到 exe 路径就没有这一项：界面少一个选项，
/// 也好过显示一个说不清自己在哪的选项。
fn exe_data_dir() -> Option<PathBuf> {
    Some(std::env::current_exe().ok()?.parent()?.join(EXE_DIR_NAME))
}

/// 指针所在的锚点目录。
///
/// Windows 取 `%APPDATA%\<identifier>`，其余取 `$XDG_CONFIG_HOME`（没有则 `~/.config`）下的
/// `<identifier>`。刻意不用 `app.config_dir()`：那个 API 要 `AppHandle`，而指向必须在任何
/// 插件初始化之前定下来。
fn anchor_dir(config: &Config) -> Option<PathBuf> {
    #[cfg(windows)]
    let base = PathBuf::from(std::env::var("APPDATA").ok()?);
    #[cfg(not(windows))]
    let base = match std::env::var("XDG_CONFIG_HOME") {
        Ok(value) if !value.is_empty() => PathBuf::from(value),
        _ => PathBuf::from(std::env::var("HOME").ok()?).join(".config"),
    };
    Some(base.join(config.identifier.as_str()))
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Pointer {
    data_dir: String,
}

fn read_pointer(anchor: &Path) -> Option<String> {
    let raw = std::fs::read_to_string(anchor.join(POINTER_FILE)).ok()?;
    serde_json::from_str::<Pointer>(&raw)
        .ok()
        .map(|pointer| pointer.data_dir)
}

fn write_pointer(anchor: &Path, chosen: &Path) -> Result<(), &'static str> {
    std::fs::create_dir_all(anchor).map_err(|_| ERR_DISK)?;
    let json = serde_json::to_string(&Pointer {
        data_dir: chosen.display().to_string(),
    })
    .map_err(|_| ERR_DISK)?;
    std::fs::write(anchor.join(POINTER_FILE), json).map_err(|_| ERR_DISK)
}

/// 只换 `data` 这一项，配置里其余的 override 原样留着。
fn only_data_changed(config: &Config, data: PathBuf) -> AppDirectoriesOverride {
    let mut overrides = match config.app.app_directories_override.as_ref() {
        Some(AppDirectoriesOverride::Directories(existing)) => existing.clone(),
        _ => AppDirectoryOverrides::default(),
    };
    overrides.data = Some(data);
    AppDirectoriesOverride::Directories(overrides)
}

fn has_marker(dir: &Path) -> bool {
    dir.join(MARKER_FILE).is_file()
}

/// 有没有一份像是本应用留下的设置文件。Electron 时代与 v0.2.x 的目录里没有标记，只有它，
/// 所以"既有的用户目录"必须认得出这一类。
///
/// 只判"存在一个叫 settings.json 的文件"太宽：那正是别人文件夹里最常见的文件名之一，
/// 而这个目录从此就归 webview 读写了。所以要顶层是个对象，并且带一个我们认识的键。
fn has_settings(dir: &Path) -> bool {
    let Ok(raw) = std::fs::read_to_string(dir.join(SETTINGS_FILE)) else {
        return false;
    };
    match serde_json::from_str::<serde_json::Value>(&raw) {
        Ok(serde_json::Value::Object(map)) => SETTING_KEYS.iter().any(|key| map.contains_key(*key)),
        _ => false,
    }
}

/// 清掉指针。"位置就是默认目录"这件事不需要被记下来，留着一条指向别处的指针
/// 只会让用户下次启动又被问一遍。
fn remove_pointer(anchor: &Path) {
    let _ = std::fs::remove_file(anchor.join(POINTER_FILE));
}

/// 认下这个目录归本应用持有。写失败不当错误上报：目录本身能用，标记只是留给"下次允许
/// 指回来"的那份证据，缺了它顶多是下次要用户再选一次空文件夹。
fn write_marker(dir: &Path) {
    let marker = dir.join(MARKER_FILE);
    if marker.exists() {
        return;
    }
    let _ = std::fs::write(&marker, "万年历的数据目录\n");
}

/// 一个候选目录的事实。判断（能不能用、为什么不能用）在 TS 侧，见 `src/backend/data-dir.ts`。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataDirFacts {
    /// 现在正在用的那个目录，绝对路径。
    pub current: String,
    /// 候选目录已存在（不存在意味着会新建）。
    pub exists: bool,
    /// 里面一个条目都没有。列不出来按"非空"处理：证明不了是空的，就不能当专用目录。
    pub empty: bool,
    pub marker: bool,
    /// 有一份像是本应用的 `settings.json`（见 [`has_settings`]）。老目录没有标记，靠这一条认。
    pub settings: bool,
    /// 候选就是当前这个目录。
    pub same: bool,
    /// 两者互相包含。
    pub nested: bool,
    /// 写探针成功。目录还不存在时探的是最近的已存在祖先，也就是"能不能把它建出来"。
    pub writable: bool,
}

fn facts(current: &Path, target: &Path) -> DataDirFacts {
    let exists = target.is_dir();
    let empty = match exists {
        true => match std::fs::read_dir(target) {
            Ok(mut entries) => entries.next().is_none(),
            Err(_) => false,
        },
        false => true,
    };
    let (here, there) = (canonical(current), canonical(target));
    let same = here == there;
    DataDirFacts {
        current: current.display().to_string(),
        exists,
        empty,
        marker: exists && has_marker(target),
        settings: exists && has_settings(target),
        same,
        nested: !same && (there.starts_with(&here) || here.starts_with(&there)),
        writable: match exists {
            true => crate::replace::probe_writable(target),
            false => crate::replace::probe_writable(&nearest_existing(target)),
        }
        .is_ok(),
    }
}

fn canonical(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

fn nearest_existing(dir: &Path) -> PathBuf {
    let mut cursor = dir;
    while !cursor.is_dir() {
        match cursor.parent() {
            Some(parent) => cursor = parent,
            None => break,
        }
    }
    cursor.to_path_buf()
}

/// 一次搬运的结果，够界面说一句完整的话。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveReport {
    pub from: String,
    pub to: String,
    pub copied: u32,
    pub bytes: u64,
    pub removed: u32,
    /// 没能删掉的源文件数。两边都留着内容不算失败：新目录是对的，旧目录只是没打扫干净，
    /// 所以它进"完成"的分支而不是错误分支。
    pub left_behind: u32,
}

/// 在系统文件管理器里打开数据目录。
///
/// 目录不在时先建出来再打开：这一条**不算**"启动自动建目录"——它是用户点了浏览，
/// 而 `explorer` 对着一个不存在的路径只会退回到别的地方，让人以为按钮没反应。
#[tauri::command]
pub fn reveal_data_dir(app: AppHandle) -> Result<(), &'static str> {
    open_in_file_manager(&current_data_dir(&app)?)
}

fn current_data_dir(app: &AppHandle) -> Result<PathBuf, &'static str> {
    app.path().app_data_dir().map_err(|_| ERR_DISK)
}

#[cfg(windows)]
fn open_in_file_manager(dir: &Path) -> Result<(), &'static str> {
    std::fs::create_dir_all(dir).map_err(|_| ERR_DISK)?;
    // `explorer <目录>` 是"打开这个文件夹"；`/select,<路径>` 是"打开父目录并选中那一项"，
    // 后者是 `replace::reveal` 用的——那里要指出的是刚换好（或没换成）的那个文件。
    let mut command = Command::new("explorer");
    command.arg(dir.as_os_str());
    crate::replace::detach(&mut command);
    command.spawn().map(|_| ()).map_err(|_| ERR_DISK)
}

#[cfg(not(windows))]
fn open_in_file_manager(dir: &Path) -> Result<(), &'static str> {
    std::fs::create_dir_all(dir).map_err(|_| ERR_DISK)?;
    let opener = if cfg!(target_os = "macos") {
        "open"
    } else {
        "xdg-open"
    };
    Command::new(opener)
        .arg(dir.as_os_str())
        .spawn()
        .map(|_| ())
        .map_err(|_| ERR_DISK)
}

/// 看清一个候选目录能不能当数据目录。命令自己不做取舍。
#[tauri::command]
pub async fn inspect_data_dir(app: AppHandle, path: String) -> Result<DataDirFacts, &'static str> {
    let current = current_data_dir(&app)?;
    let target = PathBuf::from(path);
    tauri::async_runtime::spawn_blocking(move || Ok(facts(&current, &target)))
        .await
        .map_err(|_| ERR_DISK)?
}

/// 小窗口要显示的选项：前两项的完整路径与能不能写。路径由宿主算，取舍与措辞在 TS 侧。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataDirCandidate {
    /// `user` = 用户目录下的应用专属目录，`exe` = 可执行文件所在目录。
    pub id: &'static str,
    /// 完整路径，原样显示给用户看：按下确定之前他该知道东西会落在哪儿。
    pub path: String,
    pub exists: bool,
    /// 目录不在时探的是最近的已存在祖先，也就是"能不能把它建出来"。
    /// 假的时候界面把这一项置灰：让一个用户按了注定失败的确定按钮才是真麻烦。
    pub writable: bool,
}

/// 首启小窗口的原料。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupPlanView {
    pub user: DataDirCandidate,
    /// `None` = 拿不到 exe 路径，界面上这一项整行不出现。
    pub exe: Option<DataDirCandidate>,
    /// 为什么走到这一步。只决定"自定义"里预填什么，界面不解释它。
    pub reason: ChoiceReason,
    pub recorded: Option<String>,
}

#[tauri::command]
pub fn setup_plan(
    app: AppHandle,
    startup: State<'_, StartupPlan>,
) -> Result<SetupPlanView, &'static str> {
    let places = locations(app.config()).ok_or(ERR_DISK)?;
    let (reason, recorded) = match startup.inner() {
        StartupPlan::NeedsChoice { reason, recorded } => (*reason, recorded.clone()),
        // 日历窗口不会问这个。真被问了也不编一个失败理由：按"第一次启动"如实回答，
        // 用户按确定也只是把已经在用的目录再认一次（[`choose_data_dir`] 对此是幂等的）。
        StartupPlan::Adopted { .. } => (ChoiceReason::FirstRun, None),
    };
    Ok(SetupPlanView {
        user: candidate("user", &places.default),
        exe: places.exe.as_deref().map(|path| candidate("exe", path)),
        reason,
        recorded,
    })
}

/// 拿一个候选位置的可见事实。`facts` 的 `same/nested` 在这里没有意义（首启没有"当前目录"），
/// 所以只取路径、存在与否、可写与否三项。
fn candidate(id: &'static str, path: &Path) -> DataDirCandidate {
    let observed = facts(path, path);
    DataDirCandidate {
        id,
        path: path.display().to_string(),
        exists: observed.exists,
        writable: observed.writable,
    }
}

/// 磁盘根（Windows 的 `C:\`、其余平台的 `/`）。
///
/// 要单独拦它：新格出来的盘就是空的，能通过"要么空、要么有标记"那一关，然后把整块盘
/// 交给 webview 读写；之后连"删掉自己的数据"都会变成删掉那块盘。
fn is_drive_root(path: &Path) -> bool {
    let text = path.to_string_lossy();
    let trimmed = text.trim_end_matches(['/', '\\']);
    trimmed.is_empty() || trimmed.ends_with(':')
}

/// 用户选定一个位置。这是全仓库唯一会**建**数据目录的地方，因为那一下是他按的。
#[tauri::command]
pub async fn choose_data_dir(app: AppHandle, path: String) -> Result<String, &'static str> {
    let places = locations(app.config()).ok_or(ERR_DISK)?;
    let target = PathBuf::from(path);
    tauri::async_runtime::spawn_blocking(move || choose_data_dir_at(target, &places))
        .await
        .map_err(|_| ERR_DISK)?
}

/// [`choose_data_dir`] 的全部取舍。判断（能不能用）仍然在 TS：这里只是**动手之前再核一遍**，
/// 与 [`set_data_dir`] 同一份规矩——从对话框到写盘之间用户完全可能往那个文件夹里放了东西。
fn choose_data_dir_at(target: PathBuf, places: &Locations) -> Result<String, &'static str> {
    if !target.is_absolute() {
        return Err(ERR_DISK);
    }
    if is_drive_root(&target) {
        return Err(ERR_ROOT);
    }
    let observed = facts(&places.default, &target);
    if !(observed.empty || observed.marker || observed.settings) {
        return Err(ERR_NOT_DEDICATED);
    }
    if !observed.writable {
        return Err(ERR_NOT_WRITABLE);
    }
    std::fs::create_dir_all(&target).map_err(|_| ERR_DISK)?;
    write_marker(&target);
    // 指回默认位置 = 没有指针。留着一条指向别处的旧指针，下次启动会绕回同一个问题。
    if canonical(&target) == canonical(&places.default) {
        remove_pointer(&places.anchor);
    } else {
        write_pointer(&places.anchor, &target)?;
    }
    Ok(target.display().to_string())
}

/// 把整份用户数据移进回收站。**能证明是本应用那份**才动手，判据与"能不能选它"是同一条。
#[tauri::command]
pub async fn delete_data_dir(app: AppHandle) -> Result<String, &'static str> {
    let current = current_data_dir(&app)?;
    let anchor = anchor_dir(app.config()).ok_or(ERR_DISK)?;
    tauri::async_runtime::spawn_blocking(move || delete_data_dir_at(&current, &anchor))
        .await
        .map_err(|_| ERR_DISK)?
}

/// 删之前能不能动手。**与 FFI 分开**：否则单测要真的去动系统的回收站。
fn delete_verdict(current: &Path, anchor: &Path) -> Result<(), &'static str> {
    if !current.is_dir() {
        return Err(ERR_MISSING);
    }
    if is_drive_root(current) {
        return Err(ERR_ROOT);
    }
    if canonical(current) == canonical(anchor) || current.join(POINTER_FILE).is_file() {
        // 指针住的地方进不了回收站：那一下会把所有"数据目录在哪"的记录一起带走。
        return Err(ERR_NOT_DEDICATED);
    }
    // 两份证据都没有，就证明不了这是本应用那份。一个按钮按下去就没了整个文件夹的操作，
    // 承担不起"猜错了"。
    if !(has_marker(current) || has_settings(current)) {
        return Err(ERR_NOT_DEDICATED);
    }
    Ok(())
}

fn delete_data_dir_at(current: &Path, anchor: &Path) -> Result<String, &'static str> {
    delete_verdict(current, anchor)?;
    crate::recycle::to_bin(current)?;
    // 位置记录跟着数据一起走：留着它，下次启动会被问"上次的位置不在了"，可它确实不在了。
    remove_pointer(anchor);
    Ok(current.display().to_string())
}

/// 重启一次，让新的指向生效。见文件头第 2 条：这是"当场生效"唯一的办法。
///
/// 两种失败分开说：调试版按规矩不重启（位置已经记下来，用户自己重开一次就行，界面该说的是
/// "重启后生效"），与等待者真的起不来。混成一句"失败了"会让人以为白选了。
#[tauri::command]
pub fn relaunch(app: AppHandle) -> Result<(), &'static str> {
    match crate::replace::relaunch(&app) {
        Ok(()) => Ok(()),
        Err(crate::replace::RelaunchError::Refused) => Err(ERR_DEV),
        Err(crate::replace::RelaunchError::Failed) => Err(ERR_DISK),
    }
}

/// 把数据搬到 `path`：复制、逐个对摘要、写指针，最后才删源文件。
#[tauri::command]
pub async fn set_data_dir(app: AppHandle, path: String) -> Result<MoveReport, &'static str> {
    let current = current_data_dir(&app)?;
    let anchor = anchor_dir(app.config()).ok_or(ERR_DISK)?;
    let target = PathBuf::from(path);
    tauri::async_runtime::spawn_blocking(move || move_data_dir(&current, &target, &anchor))
        .await
        .map_err(|_| ERR_DISK)?
}

/// 搬运的全部取舍。顺序是刻意的：删源文件排在"复制成功且摘要一致、指针已落盘"之后，
/// 所以任何一步失败都只会退化成"两边都有一份"，不会退化成"哪边都没有"。
fn move_data_dir(current: &Path, target: &Path, anchor: &Path) -> Result<MoveReport, &'static str> {
    let observed = facts(current, target);
    if observed.same {
        return Err(ERR_SAME);
    }
    if observed.nested {
        return Err(ERR_NESTED);
    }
    // `inspect_data_dir` 已经问过一遍，这里再核一次：从对话框到写盘之间，用户完全可能
    // 自己往那个文件夹里放了东西。`settings` 与 `marker` 同等算"用过"：老目录只有前者。
    if !(observed.empty || observed.marker || observed.settings) {
        return Err(ERR_NOT_DEDICATED);
    }
    if !observed.writable {
        return Err(ERR_NOT_WRITABLE);
    }
    std::fs::create_dir_all(target).map_err(|_| ERR_DISK)?;
    // 首次运行时数据目录可能还没被建出来（设置还没落盘）。没东西可搬不是错误。
    let plan = match current.is_dir() {
        true => copy_plan(current)?,
        false => Vec::new(),
    };
    let bytes = match copy_all(&plan, current, target) {
        Ok(bytes) => bytes,
        Err(code) => {
            undo_copies(&plan, target);
            return Err(code);
        }
    };
    write_marker(target);
    if let Err(code) = write_pointer(anchor, target) {
        // 指针写不进去就等于这次改动根本不存在。把刚复制的东西收回去，旧目录一根毫毛不动。
        undo_copies(&plan, target);
        return Err(code);
    }
    // 旧目录从此也算"本应用用过的"：搬空之后它只剩一个标记，将来指回去不需要挑空文件夹。
    write_marker(current);
    let (removed, left_behind) = remove_moved(&plan, current);
    prune_empty_dirs(&plan, current);
    Ok(MoveReport {
        from: current.display().to_string(),
        to: target.display().to_string(),
        copied: plan.len() as u32,
        bytes,
        removed,
        left_behind,
    })
}

/// 要搬的清单：相对路径，跳过 [`SKIP_DIRS`] 与标记文件（到新目录另写一个）。
fn copy_plan(root: &Path) -> Result<Vec<PathBuf>, &'static str> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for entry in std::fs::read_dir(&dir).map_err(|_| ERR_DISK)? {
            let entry = entry.map_err(|_| ERR_DISK)?;
            let name = entry.file_name();
            let path = entry.path();
            if path.is_dir() {
                if SKIP_DIRS.iter().any(|skip| OsStr::new(skip) == name) {
                    continue;
                }
                stack.push(path);
            } else if name != MARKER_FILE {
                if let Ok(relative) = path.strip_prefix(root) {
                    out.push(relative.to_path_buf());
                }
            }
        }
    }
    out.sort();
    Ok(out)
}

fn copy_all(plan: &[PathBuf], from: &Path, to: &Path) -> Result<u64, &'static str> {
    let mut bytes = 0_u64;
    for relative in plan {
        let source = from.join(relative);
        let dest = to.join(relative);
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent).map_err(|_| ERR_DISK)?;
        }
        let size = std::fs::metadata(&source).map_err(|_| ERR_DISK)?.len();
        let expected = crate::replace::sha256_file(&source).ok_or(ERR_VERIFY)?;
        // 复用更新那条链路的"落字节 + 复核摘要"，但把它的错误码换成本模块的说法：这里没有
        // 正在运行的映像要保护，摘要不符的意义是"别删源文件"。
        crate::replace::copy_then_verify(&source, &dest, size, &expected).map_err(|code| {
            if code == crate::replace::ERR_CHECKSUM {
                ERR_VERIFY
            } else {
                code
            }
        })?;
        bytes += size;
    }
    Ok(bytes)
}

/// 只删我们自己刚放进去的那些文件：目标目录里原本就有的东西一律不碰。
fn undo_copies(plan: &[PathBuf], to: &Path) {
    for relative in plan {
        let _ = std::fs::remove_file(to.join(relative));
    }
}

fn remove_moved(plan: &[PathBuf], from: &Path) -> (u32, u32) {
    let mut removed = 0_u32;
    let mut left_behind = 0_u32;
    for relative in plan {
        if std::fs::remove_file(from.join(relative)).is_ok() {
            removed += 1;
        } else {
            // 文件被占用（杀毒软件正在读它是最常见的一种）：新目录里已经有一份对过摘要的了，
            // 旧的那份只是没打扫干净，不该为此把整次搬运说成失败。
            left_behind += 1;
        }
    }
    (removed, left_behind)
}

/// 顺手把搬空了的子目录收掉。`remove_dir` 只对空目录成功，所以这一步天生安全。
fn prune_empty_dirs(plan: &[PathBuf], from: &Path) {
    let mut dirs: Vec<PathBuf> = plan
        .iter()
        .filter_map(|relative| relative.parent())
        .filter(|parent| !parent.as_os_str().is_empty())
        .map(|parent| from.join(parent))
        .collect();
    // 先去重再按深度排：深的那些要先删，父目录空了才删得掉。
    // （反过来做——先排序再去重——`dedup` 只看相邻元素，同一路径会被删两次。）
    dirs.sort_unstable();
    dirs.dedup();
    dirs.sort_by_key(|dir| std::cmp::Reverse(dir.components().count()));
    for dir in dirs {
        let _ = std::fs::remove_dir(&dir);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// 测试目录放在 `target/` 底下，不放系统临时目录：沙箱里跑的单测写不了 `%TEMP%`，
    /// 而 `CARGO_MANIFEST_DIR/target` 一定是本次构建自己的地盘（同 `replace.rs`）。
    fn temp_case(name: &str) -> PathBuf {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("tyme-paths-tests")
            .join(format!("{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("建测试目录");
        root
    }

    fn write_file(dir: &Path, relative: &str, body: &str) {
        let path = dir.join(relative);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("建父目录");
        }
        fs::write(&path, body).expect("写文件");
    }

    /// 相对路径用 `/` 归一化后再比，免得断言只在一个平台上成立。
    fn names(plan: &[PathBuf]) -> Vec<String> {
        plan.iter()
            .map(|path| {
                path.components()
                    .map(|c| c.as_os_str().to_string_lossy().into_owned())
                    .collect::<Vec<_>>()
                    .join("/")
            })
            .collect()
    }

    fn config_with_default_data() -> Config {
        let mut config = Config::default();
        config.identifier = "com.tyme.desktop".to_string();
        config.app.app_directories_override =
            Some(AppDirectoriesOverride::Directories(AppDirectoryOverrides {
                data: Some("$DATA/万年历".into()),
                ..AppDirectoryOverrides::default()
            }));
        config
    }

    fn data_of(config: &Config) -> Option<PathBuf> {
        match config.app.app_directories_override.as_ref() {
            Some(AppDirectoriesOverride::Directories(directories)) => directories.data.clone(),
            other => panic!("不该换成别的形状：{other:?}"),
        }
    }

    /// 造一个"三个位置都在 `case` 底下"的世界：真实的 `%APPDATA%` 里有老数据，
    /// `current_exe()` 在测试里指的是测试二进制，两个都不该被拿来做判断。
    fn places(case: &Path) -> Locations {
        Locations {
            anchor: case.join("anchor"),
            default: case.join("万年历"),
            exe: Some(case.join(EXE_DIR_NAME)),
        }
    }

    /// 走到"该让用户选"了吗？以及是哪一种。
    fn needs_choice(plan: StartupPlan) -> (ChoiceReason, Option<String>) {
        match plan {
            StartupPlan::NeedsChoice { reason, recorded } => (reason, recorded),
            StartupPlan::Adopted { path } => panic!("不该认下这个目录：{}", path.display()),
        }
    }

    fn adopted(plan: StartupPlan) -> PathBuf {
        match plan {
            StartupPlan::Adopted { path } => path,
            StartupPlan::NeedsChoice { reason, .. } => {
                panic!("该认出目录来，却在问用户：{reason:?}")
            }
        }
    }

    #[test]
    fn nothing_on_disk_asks_the_user_and_creates_nothing() {
        let case = temp_case("first-run");
        let places = places(&case);
        let mut config = config_with_default_data();
        let plan = apply_override_at(&mut config, &places);
        assert_eq!(needs_choice(plan).0, ChoiceReason::FirstRun);
        assert_eq!(data_of(&config), Some(PathBuf::from("$DATA/万年历")));
        // 需求的第一条：这一趟一个目录都不许建出来。三个位置，全都不该存在。
        for dir in [places.anchor, places.default, places.exe.unwrap()] {
            assert!(!dir.exists(), "启动不该建出 {}", dir.display());
        }
    }

    #[test]
    fn an_existing_default_folder_is_adopted_without_a_pointer() {
        // 老用户原地升级：`%APPDATA%\万年历` 早就在盘上，配置本来也指着它，
        // 于是不问用户、不写指针，只是补一份标记（供日后"搬走再指回来"与删除时认账）。
        let case = temp_case("adopt-default");
        let places = places(&case);
        fs::create_dir_all(&places.default).expect("建默认目录");
        write_file(&places.default, SETTINGS_FILE, r#"{"themeId":"minimal"}"#);
        let mut config = config_with_default_data();
        assert_eq!(
            adopted(apply_override_at(&mut config, &places)),
            places.default
        );
        assert_eq!(data_of(&config), Some(PathBuf::from("$DATA/万年历")));
        assert!(has_marker(&places.default));
        assert!(read_pointer(&places.anchor).is_none());
    }

    #[test]
    fn an_untouched_folder_next_to_the_exe_is_not_data() {
        // 便携版常被丢进下载目录。exe 旁边那个同名目录只有在**留下过痕迹**时才算数据目录，
        // 否则一次"把程序拷到别处"就会莫名其妙地接管一个陌生文件夹。
        let case = temp_case("exe-sibling");
        let places = places(&case);
        fs::create_dir_all(places.exe.as_ref().unwrap()).expect("建同级目录");
        let mut config = config_with_default_data();
        assert_eq!(
            needs_choice(apply_override_at(&mut config, &places)).0,
            ChoiceReason::FirstRun
        );
    }

    #[test]
    fn a_marked_folder_next_to_the_exe_is_adopted_and_recorded() {
        let case = temp_case("exe-adopted");
        let places = places(&case);
        let exe = places.exe.as_ref().unwrap().clone();
        fs::create_dir_all(&exe).expect("建同级目录");
        write_file(&exe, MARKER_FILE, "");
        let mut config = config_with_default_data();
        assert_eq!(
            adopted(apply_override_at(&mut config, &places)),
            exe.clone()
        );
        // 认下来就得记下来：否则下次启动要重新猜一遍，而"猜"这件事是有成本的。
        assert_eq!(
            read_pointer(&places.anchor).expect("指针"),
            exe.display().to_string()
        );
        assert_eq!(data_of(&config), Some(exe.clone()));
    }

    #[test]
    fn a_pointer_to_a_missing_drive_asks_and_leaves_the_record_alone() {
        // 需求最难的一处：指针指向的 U 盘被拔走了。旧做法是"顺手建一个目录继续用"，
        // 于是用户的机器上多了一个他没选过的地方，而他以为自己的数据还在盘里。
        let case = temp_case("recorded-missing");
        let places = places(&case);
        let gone = case.join("拔掉的盘").join("万年历数据");
        write_file(&places.anchor, ".keep", "锚点目录");
        write_pointer(&places.anchor, &gone).expect("写指针");
        let mut config = config_with_default_data();
        let (reason, recorded) = needs_choice(apply_override_at(&mut config, &places));
        assert_eq!(reason, ChoiceReason::RecordedMissing);
        assert_eq!(
            recorded.as_deref(),
            Some(gone.display().to_string().as_str()),
            "界面要把这个位置原样填进自定义那一栏"
        );
        assert!(!gone.exists(), "不在的盘不该被凭空建出来");
        // 指针留着：盘插回来那天，不需要重新设置一遍。
        assert_eq!(
            read_pointer(&places.anchor).expect("指针"),
            gone.display().to_string()
        );
    }

    #[test]
    fn a_pointer_moves_only_the_data_directory() {
        let case = temp_case("pointer");
        let places = places(&case);
        let chosen = case.join("chosen");
        fs::create_dir_all(&chosen).expect("既有的目录才谈得上沿用");
        // 指针用生产代码的写函数落：路径里的反斜杠必须被正确转义，手写 JSON 会当场骗过自己。
        write_pointer(&places.anchor, &chosen).expect("写指针");
        let mut config = config_with_default_data();
        assert_eq!(
            adopted(apply_override_at(&mut config, &places)),
            chosen.clone()
        );
        assert_eq!(data_of(&config), Some(chosen.clone()));
        // 指针指向的目录由本应用持有，就得有自己的标记。
        assert!(has_marker(&chosen));
    }

    #[test]
    fn a_pointer_to_a_relative_path_is_ignored() {
        let case = temp_case("relative-pointer");
        let places = places(&case);
        write_file(&places.anchor, POINTER_FILE, r#"{"dataDir":"万年历数据"}"#);
        let mut config = config_with_default_data();
        let (reason, recorded) = needs_choice(apply_override_at(&mut config, &places));
        assert_eq!(
            (reason, recorded),
            (ChoiceReason::FirstRun, None),
            "相对路径的指针不该改变任何事，也不该被当成一个记下来的位置"
        );
        assert_eq!(data_of(&config), Some(PathBuf::from("$DATA/万年历")));
    }

    #[test]
    fn the_dollar_placeholder_expands_to_an_absolute_path() {
        // 展开规则与 Tauri 同源（Windows 是 `%APPDATA%`）。这里只断言"展开成了绝对路径 +
        // 保留那一层子目录名"，不断言具体是哪个盘：单测跑在谁的机器上都可以。
        let expanded = expand_data(Path::new("$DATA/万年历"));
        assert!(expanded.is_absolute(), "{}", expanded.display());
        assert!(expanded.ends_with("万年历"));
        // 已经是绝对路径的配置值原样返回。
        assert_eq!(expand_data(&expanded), expanded);
    }

    #[test]
    fn choosing_a_place_is_the_only_thing_that_creates_one() {
        let case = temp_case("choose");
        let places = places(&case);
        let chosen = case.join("移动硬盘").join("万年历");
        let written = choose_data_dir_at(chosen.clone(), &places).expect("选定");
        assert_eq!(PathBuf::from(written), chosen);
        assert!(chosen.is_dir(), "用户按了确定，目录才该出现");
        assert!(has_marker(&chosen));
        assert_eq!(
            read_pointer(&places.anchor).expect("指针"),
            chosen.display().to_string()
        );
    }

    #[test]
    fn choosing_a_foreign_folder_creates_nothing() {
        let case = temp_case("choose-foreign");
        let places = places(&case);
        let target = case.join("别人的照片");
        write_file(&target, "IMG_0001.jpg", "别的东西");
        assert_eq!(
            choose_data_dir_at(target.clone(), &places).expect_err("陌生目录不能当数据目录"),
            ERR_NOT_DEDICATED
        );
        assert_eq!(read_pointer(&places.anchor), None, "拒绝就不该留下指针");
    }

    #[test]
    fn an_old_settings_file_is_evidence_enough() {
        // Electron 时代与 v0.2.x 的目录没有标记。用户从备份里恢复一份，得能直接指回去。
        let case = temp_case("choose-legacy");
        let places = places(&case);
        let target = case.join("备份");
        write_file(
            &target,
            SETTINGS_FILE,
            r#"{"themeId":"classic","locale":"zh-Hans"}"#,
        );
        assert!(choose_data_dir_at(target, &places).is_ok());
    }

    #[test]
    fn a_file_called_settings_json_is_not_evidence() {
        // 同名文件太常见了：只判存在，等于谁都能把一个陌生文件夹说成"专用目录"。
        let case = temp_case("choose-fake-settings");
        let places = places(&case);
        let target = case.join("别人的项目");
        write_file(&target, SETTINGS_FILE, r#"{"author":"someone else"}"#);
        assert_eq!(
            choose_data_dir_at(target, &places).expect_err("内容也要对上"),
            ERR_NOT_DEDICATED
        );
    }

    #[test]
    fn a_drive_root_is_never_a_data_directory() {
        // 新格出来的盘是空的，能通过上一节所有检查。它在删除时更危险：那一下会带走整块盘。
        let case = temp_case("choose-root");
        let places = places(&case);
        let root = if cfg!(windows) { "D:\\" } else { "/" };
        assert_eq!(
            choose_data_dir_at(PathBuf::from(root), &places).expect_err("整块盘不能当数据目录"),
            ERR_ROOT
        );
        assert!(is_drive_root(Path::new(root)));
        assert!(!is_drive_root(&places.default));
    }

    #[test]
    fn choosing_the_default_folder_again_clears_the_pointer() {
        // 从 U 盘回到本机默认位置：留着一条指向别处的指针，下次启动会绕回同一个问题。
        let case = temp_case("choose-back");
        let places = places(&case);
        fs::create_dir_all(&places.default).expect("建默认目录");
        write_file(&places.anchor, ".keep", "先有一条指针");
        write_pointer(&places.anchor, &case.join("拔掉的盘")).expect("写指针");
        choose_data_dir_at(places.default.clone(), &places).expect("指回默认");
        assert_eq!(read_pointer(&places.anchor), None);
    }

    #[test]
    fn deleting_needs_proof_that_the_folder_is_ours() {
        let case = temp_case("delete-proof");
        let places = places(&case);
        let foreign = case.join("别人的文件夹");
        write_file(&foreign, "笔记.txt", "不是我们的");
        assert_eq!(
            delete_verdict(&foreign, &places.anchor).expect_err("没有证据就不动手"),
            ERR_NOT_DEDICATED
        );
        let gone = case.join("已经不在了");
        assert_eq!(
            delete_verdict(&gone, &places.anchor).expect_err("没东西可删"),
            ERR_MISSING
        );
    }

    #[test]
    fn the_pointer_home_is_never_recycled() {
        // 删了锚点等于忘掉所有"数据目录在哪"的记录，而这跟"删掉我的数据"是两件事。
        let case = temp_case("delete-anchor");
        let places = places(&case);
        fs::create_dir_all(&places.anchor).expect("建锚点");
        write_marker(&places.anchor);
        assert_eq!(
            delete_verdict(&places.anchor, &places.anchor).expect_err("锚点不能删"),
            ERR_NOT_DEDICATED
        );
        // 指针文件本身出现在候选目录里，也是同一个信号：那是记位置的地方。
        let weird = case.join("装着指针的数据目录");
        write_marker(&weird);
        write_file(&weird, POINTER_FILE, "{}");
        assert_eq!(
            delete_verdict(&weird, &places.anchor).expect_err("装着 location.json 的目录不能删"),
            ERR_NOT_DEDICATED
        );
    }

    #[test]
    fn a_folder_we_used_is_deletable() {
        let case = temp_case("delete-ok");
        let places = places(&case);
        let dir = case.join("用户数据");
        fs::create_dir_all(&dir).expect("建目录");
        write_marker(&dir);
        assert_eq!(delete_verdict(&dir, &places.anchor), Ok(()));
        // 老目录只有 settings.json，没有标记：同样算"我们那份"。
        let legacy = case.join("老数据");
        write_file(&legacy, SETTINGS_FILE, r#"{"appearance":"dark"}"#);
        assert_eq!(delete_verdict(&legacy, &places.anchor), Ok(()));
    }

    #[test]
    fn a_foreign_folder_is_not_dedicated() {
        let case = temp_case("foreign");
        let (current, target) = (case.join("current"), case.join("target"));
        fs::create_dir_all(&current).expect("建 current");
        write_file(&target, "别人的照片.jpg", "别的东西");
        let observed = facts(&current, &target);
        assert!(observed.exists);
        assert!(!observed.empty, "非空目录不该被说成空的");
        assert!(!observed.marker);
        assert!(!observed.same);
        assert!(!observed.nested);
    }

    #[test]
    fn a_folder_inside_the_data_directory_is_refused() {
        let case = temp_case("nested");
        let current = case.join("current");
        fs::create_dir_all(current.join("inner")).expect("建 current/inner");
        assert!(
            facts(&current, &current.join("inner")).nested,
            "搬进自己里面会一路套娃"
        );
        let itself = facts(&current, &current);
        assert!(itself.same);
        assert!(!itself.nested, "自己既是 same 就不算套娃");
    }

    #[test]
    fn the_copy_plan_skips_regenerable_things() {
        let case = temp_case("plan");
        let current = case.join("current");
        write_file(&current, "settings.json", "{}");
        write_file(&current, "holidays/2026.json", "[]");
        write_file(
            &current,
            "updates/chinese-calendar-0.9.9-portable.exe",
            "字节",
        );
        write_file(&current, "updates/keep-me.txt", "也在 updates 底下");
        fs::write(current.join(MARKER_FILE), "标记").expect("写标记");
        assert_eq!(
            names(&copy_plan(&current).expect("清单")),
            vec!["holidays/2026.json", "settings.json"]
        );
    }

    #[test]
    fn a_verified_move_copies_first_and_only_then_removes_the_source() {
        let case = temp_case("move");
        let (current, target, anchor) = (
            case.join("current"),
            case.join("target"),
            case.join("anchor"),
        );
        write_file(&current, "settings.json", r#"{"themeId":"minimal"}"#);
        write_file(&current, "holidays/2026.json", "[]");
        write_file(&current, "updates/stale.exe", "不搬");
        let report = move_data_dir(&current, &target, &anchor).expect("搬动");
        assert_eq!(report.copied, 2, "updates 底下的东西不算");
        assert_eq!(report.removed, 2, "没有理由删不掉：{report:?}");
        assert_eq!(report.left_behind, 0);
        assert!(target.join("settings.json").is_file());
        assert!(target.join("holidays").join("2026.json").is_file());
        assert!(!target.join("updates").exists());
        assert!(has_marker(&target));
        assert!(
            !current.join("settings.json").exists(),
            "复制过且对过摘要就该搬走"
        );
        assert!(
            has_marker(&current),
            "旧目录留着标记，将来指回去不用挑空文件夹"
        );
        assert!(!current.join("holidays").exists(), "搬空了的子目录该收掉");
        assert_eq!(
            read_pointer(&anchor).expect("指针"),
            target.display().to_string()
        );
    }

    #[test]
    fn moving_into_a_non_empty_foreign_folder_writes_nothing() {
        let case = temp_case("refuse");
        let (current, target, anchor) = (
            case.join("current"),
            case.join("target"),
            case.join("anchor"),
        );
        write_file(&current, "settings.json", "{}");
        write_file(&target, "别人的文件.txt", "别的东西");
        assert_eq!(
            move_data_dir(&current, &target, &anchor).expect_err("该拒绝"),
            ERR_NOT_DEDICATED
        );
        assert!(current.join("settings.json").is_file(), "源文件必须还在");
        assert!(!target.join("settings.json").exists(), "拒绝就不该留下副本");
        assert!(read_pointer(&anchor).is_none(), "拒绝就不该留下指针");
    }

    #[test]
    fn moving_back_to_the_emptied_old_folder_is_allowed() {
        // 搬出去之后旧目录只剩标记。"指回去"必须算专用目录，否则用户被自己的操作锁在外面。
        let case = temp_case("back");
        let (first, second, anchor) =
            (case.join("first"), case.join("second"), case.join("anchor"));
        write_file(&first, "settings.json", "{}");
        move_data_dir(&first, &second, &anchor).expect("先搬出去");
        let back = move_data_dir(&second, &first, &anchor).expect("再搬回来");
        assert_eq!(back.copied, 1);
        assert!(first.join("settings.json").is_file());
        assert_eq!(
            read_pointer(&anchor).expect("指针"),
            first.display().to_string()
        );
    }
}
