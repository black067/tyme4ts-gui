//! 应用装配：注册插件、按设置创建主窗口、把 Rust 侧能力暴露成前端可用的命令。
//!
//! 这里对应 Electron 时代的 `src/main/index.ts`。差别在于：主进程那一侧过去还要负责
//! 转发 IPC、持有更新器与节假日缓存；现在那些判断都搬进了 webview 里的 `src/backend`，
//! 宿主只剩"窗口、进程、字节"三件事。

mod paths;
mod replace;
mod report;
mod splash;
mod update;
#[cfg(windows)]
mod webview;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::utils::config::Color;
use tauri::webview::PageLoadEvent;
use tauri::{Manager, WebviewWindow, WebviewWindowBuilder};

/// 窗口 label：单实例回调、骨架屏注入、看门狗都靠它找到主窗口。
const MAIN_WINDOW: &str = "main";

/// 页面迟迟没有加载完成时也把窗口显形，时限与 Electron 时代的 `ready-to-show` 相当。
const SHOW_BACKSTOP_MS: u64 = 2500;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 等待者模式先于一切：不建窗口、不碰单实例、也不去查 WebView2——它唯一的活是等旧进程结束
    // 然后把已经换好字节的自己拉起来。放在这个位置是必须的：单实例插件的互斥体一注册，
    // 这个进程就会被当成"第二个实例"处理掉（见 `src-tauri/src/replace.rs`）。
    if let Some(request) = replace::parse_wait_request() {
        replace::run_wait(request);
    }
    // 普通启动也要认 `--updated-from`：设置页那句"已从 0.1.4 更新到 0.2.0"靠它。
    replace::record_updated_from_arg();

    // 只发 portable 产物，没有安装器替我们装运行库，所以启动前先确保它可用。
    #[cfg(windows)]
    webview::ensure_runtime_or_exit();

    let shown = Arc::new(AtomicBool::new(false));

    // 数据目录的指向要在任何插件初始化之前定下来：能力清单里 `$APPDATA/**` 那几条是照着配置
    // 解析的，晚一步改就等于"权限范围在一处、文件在另一处"（见 `src-tauri/src/paths.rs`）。
    let mut context = tauri::generate_context!();
    paths::apply_override(context.config_mut());

    let outcome = tauri::Builder::default()
        // 单实例必须最先注册：否则第二次启动会先建出一个窗口再被拦掉。
        // 也正因为它的互斥体只按 `identifier` 命名（不含版本号），"拉起新版"绝不能由本进程
        // 顺手做——那时旧进程还握着锁，新实例会在自己的 setup 里静默退出。
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 与今天 second-instance 一致：取消最小化、显示、聚焦。
            if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        // 只用来选文件夹（改数据目录）。它不授予任何文件读写权限：能读哪里仍由
        // `$APPDATA/**` 那几条说了算，而 `$APPDATA` 跟着数据目录的 override 走。
        .plugin(tauri_plugin_dialog::init())
        .manage(update::UpdaterState::default())
        .invoke_handler(tauri::generate_handler![
            update::download_update,
            update::cancel_update,
            update::delete_update,
            update::install_update,
            update::update_context,
            paths::reveal_data_dir,
            paths::inspect_data_dir,
            paths::set_data_dir
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            // 上一次更新留下的 `.old.exe` / `.part` / 过期暂存资产，由这个真正活下来的实例清扫。
            // 不放在安装成功之后：那一段代码属于正在退出的旧进程，而等待者未必跑完。
            // 也正因为清扫可能碰到写盘慢的目录（网络盘、U 盘），它不放主线程。
            let cleaner = handle.clone();
            tauri::async_runtime::spawn_blocking(move || {
                replace::cleanup_exe_dir();
                update::sweep_updates_dir(&cleaner);
            });

            // 骨架屏的参数要在页面加载前定下来：这是"窗口一出现就有反馈"的全部前提。
            let bootstrap = splash::build(&handle);
            let config = handle
                .config()
                .app
                .windows
                .first()
                .cloned()
                .ok_or("tauri.conf.json 必须声明一个窗口")?;

            let on_load_shown = Arc::clone(&shown);
            let window = WebviewWindowBuilder::from_config(&handle, &config)?
                // 底色必须等于该主题在 tokens.css 里的 --color-bg，否则首帧会闪一下错的灰。
                .background_color(Color::from(bootstrap.rgb))
                .theme(bootstrap.window_theme)
                .initialization_script(bootstrap.script)
                .on_page_load(move |window, payload| {
                    if !matches!(payload.event(), PageLoadEvent::Finished) {
                        return;
                    }
                    show(&window, &on_load_shown);
                })
                // document.title 里带着版本号（App.tsx），原生标题要跟上。
                .on_document_title_changed(|window, title| {
                    let _ = window.set_title(&title);
                })
                .build()
                // 裸的"拒绝访问。(os error 5)"或"请求的资源在使用中"对用户毫无信息量，
                // 对排查的人也一样：WebView2 要在缓存目录下建 EBWebView 并拉起浏览器进程，
                // 权限问题、残留实例占用、杀软拦截都长这一个样子。把目录名报出来，
                // 一眼就知道该清哪个文件夹、该关哪个进程。
                .map_err(|error| {
                    let cache = handle
                        .path()
                        .app_cache_dir()
                        .map(|dir| dir.display().to_string())
                        .unwrap_or_else(|_| "<未知>".to_string());
                    format!("{error}（WebView2 缓存目录：{cache}）")
                })?;

            // 兜底：页面加载失败时 on_page_load 可能永远不来，但窗口不该因此隐身。
            let backstop = Arc::clone(&shown);
            let watchdog = window.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(SHOW_BACKSTOP_MS)).await;
                show(&watchdog, &backstop);
            });

            Ok(())
        })
        .run(context);

    if let Err(error) = outcome {
        // setup 里任何一步失败（最常见的是 WebView2 起不来）都不能只留一行 panic：
        // 双击图标的人需要看得懂的对话框，终端里的人需要 stderr 那一行。
        report::fatal_and_exit(&format!("启动失败：{error}"));
    }
}

/// 显示主窗口并打一行就绪日志；只生效一次，重复调用是无害的。
///
/// 这行日志是 `.vscode/tasks.json` 里 dev 后台任务的结束标志，也是手动冒烟时
/// 判断"窗口为什么没出现"的第一个线索。
fn show(window: &WebviewWindow, shown: &AtomicBool) {
    if shown.swap(true, Ordering::SeqCst) {
        return;
    }
    if window.is_visible().unwrap_or(false) {
        return;
    }
    let _ = window.show();
    let _ = window.set_focus();
    println!("[tyme-app] main window ready");
}
