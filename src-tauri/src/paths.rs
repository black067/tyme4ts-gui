//! 数据目录：它现在在哪、怎么在文件管理器里看到它、怎么把它搬到别处。
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
//! 有两件事塞不进数据目录本身，值得各自说明一次：
//!
//! 1. **指针文件不能存在数据目录里。** 它记的内容就是"数据目录在哪"，而那个目录正是等着被搬走
//!    的东西。锚点按 `identifier` 定位（Windows 是 `%APPDATA%\com.tyme.desktop`），与 override
//!    无关，也就与搬没搬过无关。
//! 2. **本次会话不改指向。** `config_mut()` 只在 `App` 上有，命令里能拿到的 `AppHandle` 只有
//!    `&Config`，所以搬完之后当前进程仍在旧目录读写，新指向下次启动才生效。这句话必须让用户
//!    看见，否则"重启之前改的那次设置"会留在旧目录里，看起来像是搬丢了。

use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};
use tauri::utils::config::{AppDirectoriesOverride, AppDirectoryOverrides, Config};
use tauri::{AppHandle, Manager};

/// 指针文件，写在锚点目录里：`{ "dataDir": "D:\\万年历数据" }`。
const POINTER_FILE: &str = "location.json";
/// 标记文件，写进每一个本应用持有的数据目录。搬走之后旧目录也留着它，于是"再指回去"
/// 永远算数——那是最常见的第二次操作，不该被"这个目录非空"挡在外面。
const MARKER_FILE: &str = ".tyme-data-dir";
/// 不搬的目录：里面全是可再生的东西（更新产物、下到一半的 `.part`）。
/// 搬一份 10 MB 的半成品到新地方，不如到了新地方重新下一次。
const SKIP_DIRS: &[&str] = &["updates"];

/// 选的就是当前正在用的那个目录。
pub const ERR_SAME: &str = "same";
/// 两个目录互相包含：搬进去等于自己套自己，复制会一路套娃。
pub const ERR_NESTED: &str = "nested";
/// 非空、又没有本应用的标记：不能确定这目录专给本应用用，也就不能把权限范围扩到它身上。
pub const ERR_NOT_DEDICATED: &str = "not-dedicated";
/// 写探针失败：只读盘、权限、满盘都归这一条。
pub const ERR_NOT_WRITABLE: &str = "not-writable";
/// 复制过去之后字节对不上。走到这里源目录一个文件都没删。
pub const ERR_VERIFY: &str = "verify";
/// 其余的磁盘与路径问题。
pub const ERR_DISK: &str = "disk";

/// 启动早期调用（`Builder::run(context)` 之前）：把指针记着的目录变成配置的 override。
///
/// 任何一步不成立就原样返回。最坏情况必须只是"回到默认位置"：指针坏了、U 盘拔走了、
/// 文件夹被人手删了，都不该让一个双击图标的人看到启动失败对话框。
pub fn apply_override(config: &mut Config) {
    if let Some(anchor) = anchor_dir(config) {
        apply_override_from(config, &anchor);
    }
}

/// [`apply_override`] 的实现，锚点由参数给出：单测不能往真实的 `%APPDATA%` 里写东西。
fn apply_override_from(config: &mut Config, anchor: &Path) {
    let Some(chosen) = read_pointer(anchor) else {
        return;
    };
    let path = PathBuf::from(&chosen);
    if !path.is_absolute() {
        // 指针是磁盘上的一个文件，谁都可能改。只接受说清楚了的位置，其余一律忽略。
        eprintln!("[tyme-app] 数据目录指针不是绝对路径（{chosen}），忽略。");
        return;
    }
    if let Err(error) = std::fs::create_dir_all(&path) {
        // 指针指向的盘不在了（拔掉的移动硬盘最常见）。这次退回默认位置，指针留着：
        // 盘插回去的那天，用户不需要重新设置一遍。
        eprintln!("[tyme-app] 数据目录 {chosen} 建不出来（{error}），这次用默认位置。");
        return;
    }
    write_marker(&path);
    let next = only_data_changed(config, path);
    config.app.app_directories_override = Some(next);
    eprintln!("[tyme-app] 数据目录：{chosen}");
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
        same,
        nested: !same && (there.starts_with(&here) || here.starts_with(&there)),
        writable: crate::replace::probe_writable(&match exists {
            true => target.to_path_buf(),
            false => nearest_existing(target),
        })
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
/// 目录还不存在时先建出来：否则 `explorer` 会退回到别的地方，用户看到的是"这按钮没反应"。
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
    // 自己往那个文件夹里放了东西。
    if !(observed.empty || observed.marker) {
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

    #[test]
    fn no_pointer_leaves_the_config_alone() {
        let anchor = temp_case("no-pointer").join("anchor");
        let mut config = config_with_default_data();
        apply_override_from(&mut config, &anchor);
        assert_eq!(data_of(&config), Some(PathBuf::from("$DATA/万年历")));
    }

    #[test]
    fn a_pointer_moves_only_the_data_directory() {
        let case = temp_case("pointer");
        let (anchor, chosen) = (case.join("anchor"), case.join("chosen"));
        write_file(&anchor, ".keep", "锚点目录要先存在");
        // 指针用生产代码的写函数落：路径里的反斜杠必须被正确转义，手写 JSON 会当场骗过自己。
        write_pointer(&anchor, &chosen).expect("写指针");
        let mut config = config_with_default_data();
        apply_override_from(&mut config, &anchor);
        assert_eq!(data_of(&config), Some(chosen.clone()));
        // 指针指向的目录由本应用持有，就得有自己的标记。
        assert!(has_marker(&chosen));
    }

    #[test]
    fn a_pointer_to_a_relative_path_is_ignored() {
        let case = temp_case("relative-pointer");
        let anchor = case.join("anchor");
        write_file(&anchor, POINTER_FILE, r#"{"dataDir":"万年历数据"}"#);
        let mut config = config_with_default_data();
        apply_override_from(&mut config, &anchor);
        assert_eq!(
            data_of(&config),
            Some(PathBuf::from("$DATA/万年历")),
            "相对路径的指针不该改变任何事"
        );
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
