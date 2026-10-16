//! 把整个数据目录**移到回收站**，而不是删掉。
//!
//! 设置里那一下按下去就没有第二次机会，所以这里只有两条规矩：
//!
//! 1. **只走回收站。** 用的是 shell 的 `SHFileOperationW` + `FOF_ALLOWUNDO`：东西进
//!    `$Recycle.Bin`，用户可以自己右键还原。带 `FOF_ALLOWUNDO` 但落不到回收站的位置
//!    （FAT32/exFAT 的 U 盘、网络盘）会**静默地永久删除**——那正是最不能发生的失败模式，
//!    所以先问 `GetDriveTypeW`，只认固定磁盘，其余一律拒绝并说清楚为什么。
//! 2. **不引入 `windows` 元 crate。** 与 `report.rs`（user32 的 MessageBoxW）、
//!    `replace.rs`（kernel32 的 WaitForSingleObject）同一个做法：只要这两个函数，
//!    就自己声明 `#[link]`。多一个依赖就多一份审计，而这两个 ABI 十年没变过。
//!
//! 判断"该不该删"不在这里，在 `paths.rs::delete_verdict`——那个能单测；这里的 `verdict`
//! 只管"这块盘能不能收"。真正调 shell 的那一小段是 FFI，测不了，也尽量薄。

use std::path::{Component, Path};

/// 错误码全部与 `paths.rs` 同源（`src/shared/data-dir.ts` 那侧也是同一批字符串）。
#[cfg(windows)]
use crate::paths::{ERR_BUSY, ERR_DISK, ERR_MISSING, ERR_NO_RECYCLE_BIN};
#[cfg(not(windows))]
use crate::paths::{ERR_MISSING, ERR_NO_RECYCLE_BIN, ERR_UNSUPPORTED};

/// `SHFILEOPSTRUCTW.wFunc`。
#[cfg(windows)]
const FO_DELETE: u32 = 3;
/// 可以从"撤销"里恢复——这一条就是"移到回收站"的全部含义。
#[cfg(windows)]
const FOF_ALLOWUNDO: u16 = 0x0040;
/// 系统不再问第二遍：确认由界面自己做过（两步按钮），弹两次框只会让人以为按错了。
#[cfg(windows)]
const FOF_NOCONFIRMATION: u16 = 0x0010;
/// 不弹进度框。
#[cfg(windows)]
const FOF_SILENT: u16 = 0x0004;
/// 失败也不要 shell 自己弹框：错误得回到界面那句话里，不是落进一个没人读的对话框。
#[cfg(windows)]
const FOF_NOERRORUI: u16 = 0x0400;

/// `GetDriveTypeW` 的返回值（winbase.h）。只写用得到的那几个，数字本身按原值。
const DRIVE_UNKNOWN: u32 = 0;
const DRIVE_NO_ROOT_DIR: u32 = 1;
const DRIVE_REMOVABLE: u32 = 2;
const DRIVE_FIXED: u32 = 3;
const DRIVE_REMOTE: u32 = 4;
const DRIVE_CDROM: u32 = 5;
const DRIVE_RAMDISK: u32 = 6;

/// `SHFileOperationW` 的 `DE_FILENOTFOUND`：目录在刚才那一瞬间已经没了。
#[cfg(windows)]
const DE_FILE_NOT_FOUND: i32 = 124;

/// 把 `dir` 移到回收站。错误码见 `src/shared/data-dir.ts` 的 `DataDirErrorCode`。
#[cfg(windows)]
pub fn to_bin(dir: &Path) -> Result<(), &'static str> {
    let root = volume_root(dir).ok_or(ERR_MISSING)?;
    // 卷根要传给 GetDriveTypeW，必须是 `\` 结尾的那一层（`D:\`、`\\服务器\共享\`）。
    let root_wide = to_wide(&root);
    let drive_type = unsafe { GetDriveTypeW(root_wide.as_ptr()) };
    verdict(drive_type)?;

    let from = double_null(dir);
    let mut operation = SHFILEOPSTRUCTW {
        hwnd: std::ptr::null_mut(),
        wFunc: FO_DELETE,
        // 借用 `from` 的指针：那个 Vec 必须活到 SHFileOperationW 返回，所以它在这里而不是
        // 塞进结构体的初始化里就地构造。
        pFrom: from.as_ptr(),
        pTo: std::ptr::null(),
        // ALLOWUNDO 是这一整个模块存在的理由；其余三个是"别再弹框"：确认由界面自己做过，
        // 失败也要回到界面那句话里，而不是落进一个没人读的对话框。
        fFlags: FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT | FOF_NOERRORUI,
        fAnyOperationsAborted: 0,
        hNameMappings: std::ptr::null_mut(),
        lpszProgressTitle: std::ptr::null(),
    };

    // 命令跑在 spawn_blocking 的线程上，那条线程可能没有套间，而 shell 这组调用是 COM 之上的
    // API。已经初始化过就沿用：只在真的由我们初始化时才对等地收回，不动别人的引用计数。
    let initialized = unsafe { CoInitializeEx(std::ptr::null_mut(), COINIT_APARTMENTTHREADED) };
    let code = unsafe { SHFileOperationW(&mut operation) };
    if initialized == S_OK || initialized == S_FALSE {
        unsafe { CoUninitialize() };
    }

    if operation.fAnyOperationsAborted != 0 {
        // 文件被别的程序读着（杀毒软件扫这个文件夹是最常见的一种）。
        return Err(ERR_BUSY);
    }
    match code {
        0 => Ok(()),
        DE_FILE_NOT_FOUND => Err(ERR_MISSING),
        _ => Err(ERR_DISK),
    }
}

/// 别的平台没有"回收站"这个可寻址的地方，界面上那三个字的承诺兑不了现，所以不做。
/// 本产品只出 Windows 便携版；这一条留在这里是为了不让下一个读代码的人以为是漏了。
#[cfg(not(windows))]
#[allow(unused_variables)]
pub fn to_bin(dir: &Path) -> Result<(), &'static str> {
    Err(ERR_UNSUPPORTED)
}

/// 这块盘收不收回收站。
///
/// 认固定磁盘，只因为 `FOF_ALLOWUNDO` 在别的介质上的行为不是"失败"而是"照办但不留底"：
/// 用户在界面上看到"已移到回收站"，实际上没有任何东西可以还原。拒绝至少是诚实的。
fn verdict(drive_type: u32) -> Result<(), &'static str> {
    match drive_type {
        DRIVE_FIXED => Ok(()),
        DRIVE_NO_ROOT_DIR => Err(ERR_MISSING),
        DRIVE_UNKNOWN | DRIVE_REMOVABLE | DRIVE_REMOTE | DRIVE_CDROM | DRIVE_RAMDISK => {
            Err(ERR_NO_RECYCLE_BIN)
        }
        // `GetDriveTypeW` 以后新增的取值一律不当固定磁盘用。
        _ => Err(ERR_NO_RECYCLE_BIN),
    }
}

/// 路径所在的卷根。
///
/// `C:\Users\x\AppData\Roaming\万年历` → `C:\`；`\\服务器\共享\数据` → `\\服务器\共享\`；
/// `/home/x` → `/`。相对路径没有卷根（`None`）——那本来也不该走到这一步。
fn volume_root(path: &Path) -> Option<String> {
    let first = path.components().next()?;
    match first {
        Component::Prefix(prefix) => {
            let raw = prefix
                .as_os_str()
                .to_string_lossy()
                .trim_end_matches('\\')
                .to_string();
            match path.components().nth(1)? {
                Component::RootDir => Some(format!("{}\\", raw)),
                // 认不出的第二段：宁可说"不知道在哪块盘"，也不要拿一个错的路径去问系统。
                _ => None,
            }
        }
        Component::RootDir => Some("/".to_string()),
        _ => None,
    }
}

/// `pFrom` 的编码：**双 null 结尾**的一串路径。
///
/// 少一个结尾的 0，shell 会一路读到后面的堆内存，把下一个字符串也当成要删的东西；
/// 多一个只是浪费两个字节。这里只放一条路径，所以补两个 0 就够。
#[cfg(windows)]
fn double_null(path: &Path) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    let mut wide: Vec<u16> = path.as_os_str().encode_wide().collect();
    wide.push(0);
    wide.push(0);
    wide
}

#[cfg(windows)]
fn to_wide(text: &str) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    let mut wide: Vec<u16> = std::ffi::OsStr::new(text).encode_wide().collect();
    wide.push(0);
    wide
}

#[cfg(windows)]
const S_OK: i32 = 0;
#[cfg(windows)]
const S_FALSE: i32 = 1;
/// `COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DCE`：套间线程，并且不去初始化老 DCE——
/// 我们只用到 shell 的这一件事，越少副作用越好。
#[cfg(windows)]
const COINIT_APARTMENTTHREADED: u32 = 0x2 | 0x4;

// 与 `report.rs`、`replace.rs` 同一个做法：需要的 API 自己声明，不引元 crate。
#[cfg(windows)]
#[link(name = "shell32")]
extern "system" {
    fn SHFileOperationW(operation: *mut SHFILEOPSTRUCTW) -> i32;
    fn GetDriveTypeW(root_path: *const u16) -> u32;
}

#[cfg(windows)]
#[link(name = "ole32")]
extern "system" {
    fn CoInitializeEx(reserved: *mut core::ffi::c_void, coinit: u32) -> i32;
    fn CoUninitialize();
}

/// Windows SDK 里的那个结构，字段顺序与 `SHFILEOPSTRUCTW` 逐字一致（ABI，不能改顺序）。
///
/// 字段名也照抄：那是 SDK 的写法，`non_snake_case` 的告警在这里是让代码更像它对应的文档，
/// 不是需要修掉的东西。
#[cfg(windows)]
#[allow(non_snake_case)]
#[repr(C)]
struct SHFILEOPSTRUCTW {
    hwnd: *mut core::ffi::c_void,
    wFunc: u32,
    pFrom: *const u16,
    pTo: *const u16,
    fFlags: u16,
    fAnyOperationsAborted: i32,
    hNameMappings: *mut core::ffi::c_void,
    lpszProgressTitle: *const u16,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn only_fixed_drives_get_a_recycle_bin() {
        assert_eq!(verdict(DRIVE_FIXED), Ok(()));
        for kind in [
            DRIVE_UNKNOWN,
            DRIVE_REMOVABLE,
            DRIVE_REMOTE,
            DRIVE_CDROM,
            DRIVE_RAMDISK,
            99,
        ] {
            assert_eq!(
                verdict(kind),
                Err(ERR_NO_RECYCLE_BIN),
                "{kind} 这块盘上的 FOF_ALLOWUNDO 会静默永久删除"
            );
        }
        assert_eq!(verdict(DRIVE_NO_ROOT_DIR), Err(ERR_MISSING));
    }

    #[test]
    fn the_volume_root_is_where_the_drive_type_is_asked() {
        // 相对路径没有卷根：问系统"这块盘是什么"需要一个绝对到卷根的路径。
        assert_eq!(volume_root(&PathBuf::from("data/子目录")), None);
        if cfg!(windows) {
            assert_eq!(
                volume_root(&PathBuf::from(r"C:\Users\x\AppData\Roaming\万年历")).as_deref(),
                Some("C:\\")
            );
            assert_eq!(
                volume_root(&PathBuf::from(r"\\server\share\数据\目录")).as_deref(),
                Some("\\\\server\\share\\")
            );
        } else {
            assert_eq!(
                volume_root(&PathBuf::from("/home/x/万年历")).as_deref(),
                Some("/")
            );
        }
    }

    /// `pFrom` 的结尾是**两个** 0。这条 ABI 细节用断言钉住：少一个 0，shell 会把后面的堆内存
    /// 读成"还要再删一条路径"，而那正是最不该由一次删除引发的错误。
    #[cfg(windows)]
    #[test]
    fn the_path_list_ends_with_two_nulls() {
        let encoded = double_null(std::path::Path::new(r"D:\万年历数据"));
        assert_eq!(&encoded[encoded.len() - 2..], &[0, 0]);
        assert_ne!(encoded[encoded.len() - 3], 0, "路径本身不该以 0 结尾");
        assert!(!encoded
            .iter()
            .take(encoded.len() - 2)
            .any(|unit| *unit == 0));
    }
}
