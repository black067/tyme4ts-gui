//! 启动还没到"有窗口"那一步就失败时的告知方式。
//!
//! 便携版是 GUI 子系统程序：双击之后 stderr 去进了虚无，任何 panic 的表现都只是
//! "图标闪一下，什么都没发生"，连截图都没法截。旧版 Electron 在渲染进程崩溃时用
//! `dialog.showMessageBoxSync` 说话，这条路径得保留——所以这里直调 `MessageBoxW`，
//! 不依赖 Tauri 窗口，也就不会反过来依赖正要创建的那个 WebView2。
//!
//! `tauri dev` 跑的是控制台子系统，消息同时打在 stderr 上，终端里能直接看见。

/// 对话框标题，与产品名一致。
const CAPTION: &str = "万年历";

/// 报告一个致命错误并结束进程：stderr 一行，Windows 上再弹一个系统对话框。
pub fn fatal_and_exit(body: &str) -> ! {
    eprintln!("{CAPTION}：{body}");
    #[cfg(windows)]
    show_message_box(body);
    std::process::exit(1);
}

#[cfg(windows)]
fn show_message_box(body: &str) {
    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(
            hwnd: *mut core::ffi::c_void,
            text: *const u16,
            caption: *const u16,
            kind: u32,
        ) -> i32;
    }
    const MB_OK: u32 = 0x0;
    const MB_ICONERROR: u32 = 0x10;

    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }

    let caption = wide(CAPTION);
    let text = wide(body);
    // 0x10 = MB_ICONERROR：启动都起不来，别用信息图标粉饰。
    unsafe {
        MessageBoxW(
            core::ptr::null_mut(),
            text.as_ptr(),
            caption.as_ptr(),
            MB_OK | MB_ICONERROR,
        );
    }
}
