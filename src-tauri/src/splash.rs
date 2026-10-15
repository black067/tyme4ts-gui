//! 首帧骨架屏的宿主侧输入。
//!
//! Electron 时代这件事在主进程做：读 `settings.json`、问 `nativeTheme` 当前是不是深色，
//! 把 `?dt=&locale=&first=` 拼进要加载的 URL。Tauri 这边窗口在 Rust 里创建，于是同样的
//! 三个值改由一段初始化脚本递给页面——它在任何前端代码之前执行，开发模式（devUrl）与
//! 生产模式（内嵌资源）走同一条路，不必改动 URL。
//!
//! `src/shared/splash.ts` 仍是这套规则的唯一规范来源，这里是它的受契约副本：主题串格式
//! `{theme_id}-{variant}`、四个底色字面量、首次启动的判据，三样都由
//! `tests/splash-contract.test.ts` 钉住，改一边不改另一边就是测试失败。

use serde::Deserialize;
use serde_json::json;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, Theme};

/// 与 `src/shared/ipc.ts` 的默认值一致：读不到设置文件时按这些走。
const DEFAULT_THEME_ID: &str = "minimal";
const DEFAULT_LOCALE: &str = "zh-Hans";

/// 只取骨架屏需要的三个字段，其余一律忽略：设置文件可能来自更早或更新的版本，
/// 首帧不该因为陌生字段而失败——这与 TS 侧 `normalize()` 的宽容策略相同。
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSettings {
    #[serde(default)]
    theme_id: String,
    #[serde(default)]
    appearance: String,
    #[serde(default)]
    locale: String,
}

/// 创建窗口时要用的三样东西。
pub struct Bootstrap {
    /// 注入页面的脚本：`window.__TAYME_SPLASH__`。
    pub script: String,
    /// 窗口底色，必须等于该主题在 tokens.css 里的 `--color-bg`，否则首帧会闪一下错的灰。
    pub rgb: [u8; 4],
    /// 钉住窗口的浅色/深色；`None` 表示跟随系统（对应设置里的 `appearance: 'system'`）。
    pub window_theme: Option<Theme>,
}

pub fn build(app: &AppHandle) -> Bootstrap {
    let dir = data_dir(app);
    // "首次启动"的判据与旧版一致：盘上没有设置文件才算第一次。
    // 文件在但读不出（格式坏了）不算——旧版的 `hasStoredSettings()` 只看存在性。
    let first = dir.as_ref().map(|path| !has_settings(path)).unwrap_or(true);
    let settings = dir.as_ref().and_then(|path| read_settings(path));

    let StoredSettings {
        theme_id,
        appearance,
        locale,
    } = settings.unwrap_or_default();

    // 与旧版 createWindow() 里同一行逻辑：pinned 模式直接决定，system 才去问注册表。
    let dark = match appearance.as_str() {
        "dark" => true,
        "light" => false,
        _ => system_prefers_dark(),
    };
    let theme_id = if theme_id.trim().is_empty() {
        DEFAULT_THEME_ID.to_string()
    } else {
        theme_id
    };
    // 目前只注册了 zh-Hans；不是它就当默认语言，同 isLocale() 的判定。
    let locale = if locale == DEFAULT_LOCALE {
        locale
    } else {
        DEFAULT_LOCALE.to_string()
    };
    let variant = if dark { "dark" } else { "light" };

    Bootstrap {
        // 值由 serde_json 序列化：themeId 是用户可写的自由字符串，交给 JSON 转义，
        // 不自己拼引号。splash.js 读到时仍会用它的字面量白名单再过一遍。
        script: format!(
            "window.__TAYME_SPLASH__ = {};",
            json!({
              "dt": format!("{theme_id}-{variant}"),
              "locale": locale,
              "first": first
            })
        ),
        rgb: background_rgb(&theme_id, dark),
        // 设置里钉了浅色/深色就跟着钉住；跟随系统时不碰，交给 WebView2 的默认行为。
        window_theme: match appearance.as_str() {
            "dark" => Some(Theme::Dark),
            "light" => Some(Theme::Light),
            _ => None,
        },
    }
}

/// `src/shared/splash.ts` 里 `splashBackground()` 的副本：classic 用暖纸色，其余主题用中性色。
///
/// 这四个字面量必须与 `index.html` 骨架样式、`tokens.css` 的 `--color-bg` 三处一致，
/// 由 `tests/splash-contract.test.ts` 逐色核对。alpha 固定 255：底色不需要透明，
/// 透明只会让窗口在出现的那一瞬透出桌面。
fn background_rgb(theme_id: &str, dark: bool) -> [u8; 4] {
    match (theme_id, dark) {
        ("classic", true) => [0x19, 0x15, 0x12, 0xff], // #191512
        ("classic", false) => [0xf3, 0xec, 0xdd, 0xff], // #f3ecdd
        (_, true) => [0x15, 0x17, 0x1b, 0xff],         // #15171b
        (_, false) => [0xf6, 0xf6, 0xf4, 0xff],        // #f6f6f4
    }
}

/// 应用数据目录，顺手建出来：设置文件的原子写只负责"临时文件 + 改名"两步。
///
/// 这个目录默认由 tauri.conf.json 的 `appDirectoriesOverride` 指到 `%APPDATA%\万年历`，
/// 与 Electron 时代的 `userData` 是同一个地方，老用户的设置与缓存因此原地可用；用户在设置里
/// 把它搬到别处之后，`paths::apply_override()` 已在建窗之前改过指向，这里读到的就是新位置
/// ——骨架屏的颜色才会与用户实际的设置一致。
fn data_dir(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_data_dir().ok()?;
    let _ = std::fs::create_dir_all(&dir);
    Some(dir)
}

fn has_settings(dir: &Path) -> bool {
    dir.join("settings.json").is_file()
}

fn read_settings(dir: &Path) -> Option<StoredSettings> {
    let raw = std::fs::read_to_string(dir.join("settings.json")).ok()?;
    serde_json::from_str(&raw).ok()
}

/// 读 HKCU 的 `AppsUseLightTheme`——`nativeTheme.shouldUseDarkColors` 在 Windows 上问的就是它。
/// 读不到（键不存在、受限环境）时按浅色，与 Chromium 的默认一致。
#[cfg(windows)]
fn system_prefers_dark() -> bool {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize")
        .and_then(|key| key.get_value::<u32, _>("AppsUseLightTheme"))
        .map(|value| value == 0)
        .unwrap_or(false)
}

#[cfg(not(windows))]
fn system_prefers_dark() -> bool {
    false
}
