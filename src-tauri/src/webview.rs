//! WebView2 运行库的前置检查。
//!
//! 只发 portable 产物意味着没有安装器替我们装运行库：`bundle.windows.webviewInstallMode`
//! 只在打 MSI/NSIS 时生效，裸 exe 拿到的是"运行机上有没有 WebView2"这个纯外部条件。
//! Windows 11 自带，Windows 10 大多随 Edge 更新装上，但确实存在干净的机器。
//!
//! 所以这里做的是今天 Electron 隐含替我们做的事（Chromium 就在包里）：查注册表；
//! 没有就从微软官方地址拉 bootstrapper 装一次，装完再查；仍然没有就明确告诉用户
//! 去哪里装，而不是让 wry 在创建 webview 时静默失败、窗口永远不出现。

use std::path::PathBuf;

/// 用户选择的方案：在线拉官方 bootstrapper（体积小，但要网）。
const BOOTSTRAPPER_URL: &str = "https://go.microsoft.com/fwlink/p/?linkid=2124701";
const BOOTSTRAPPER_NAME: &str = "MicrosoftEdgeWebview2Setup.exe";
/// Edge/WebView2 的客户端注册键，两者共用同一个 GUID。
const CLIENT_KEY: &str =
    r"Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";

/// 运行库版本；`None` 表示这台机器上没有可用的 WebView2。
fn installed_version() -> Option<String> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    // HKLM 要看两次：64 位进程读 32 位视图才会看见 WOW6432Node 下注册的安装。
    let candidates = [
        (HKEY_LOCAL_MACHINE, CLIENT_KEY),
        (
            HKEY_LOCAL_MACHINE,
            r"Software\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
        ),
        (HKEY_CURRENT_USER, CLIENT_KEY),
    ];
    for (hive, path) in candidates {
        let value = RegKey::predef(hive)
            .open_subkey_with_flags(path, KEY_READ)
            .and_then(|key| key.get_value::<String, _>("pv"));
        if let Ok(version) = value {
            // 占位值 "0.0.0.0" 表示登记了但没装成。
            if !version.trim().is_empty() && version.trim() != "0.0.0.0" {
                return Some(version);
            }
        }
    }
    None
}

// 缺就装；装不上就告知并结束进程。返回时保证运行库可用。
pub fn ensure_runtime_or_exit() {
    if installed_version().is_some() {
        return;
    }
    if install_runtime() && installed_version().is_some() {
        return;
    }
    crate::report::fatal_and_exit(MISSING_RUNTIME);
}

/// 下载并执行官方 bootstrapper（它会自己拉起完整的运行库安装）。
fn install_runtime() -> bool {
    let path = match download_bootstrapper() {
        Ok(path) => path,
        Err(reason) => {
            // 没有窗口可以说话，只能把这行留在控制台里：`tauri dev` 与人工排查时看得到。
            eprintln!("万年历：自动安装 WebView2 运行库失败——{reason}");
            return false;
        }
    };
    // 不带 /silent：让用户看见微软自己的安装进度，这比我们的窗口更可信。
    std::process::Command::new(&path)
        .arg("/install")
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn download_bootstrapper() -> Result<PathBuf, String> {
    let dir = std::env::temp_dir().join("tyme-app");
    std::fs::create_dir_all(&dir).map_err(|_| "无法创建临时目录".to_string())?;
    let path = dir.join(BOOTSTRAPPER_NAME);
    let bytes = tauri::async_runtime::block_on(fetch(BOOTSTRAPPER_URL))?;
    std::fs::write(&path, bytes).map_err(|_| "无法写入临时文件".to_string())?;
    Ok(path)
}

async fn fetch(url: &str) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::builder()
        // 这个地址会 302 到微软的 CDN，重定向是预期内的。
        .build()
        .map_err(|_| "无法初始化下载".to_string())?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|_| "下载失败：无法连接微软服务器".to_string())?;
    if !response.status().is_success() {
        return Err("下载失败：微软服务器没有返回文件".to_string());
    }
    response
        .bytes()
        .await
        .map(|bytes| bytes.to_vec())
        .map_err(|_| "下载失败：文件不完整".to_string())
}

/// 运行库装不上时给用户看的话。自动安装可能被离线、代理或权限卡住，所以把手动安装
/// 地址一并写进来——人总还能自己走一步。弹框与退出统一由 `report::fatal_and_exit` 做。
const MISSING_RUNTIME: &str =
    "万年历需要 Microsoft Edge WebView2 运行库才能启动，但这次自动安装没有成功。\
     \n\n请联网后重新运行本程序，或手动安装：\
     \nhttps://developer.microsoft.com/microsoft-edge/webview2/\
     \n\n（Windows 11 通常已内置该运行库。）";
