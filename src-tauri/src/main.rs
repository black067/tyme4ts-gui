// Windows 发布版不挂控制台：portable 双击启动时不该闪出一个黑框。
// 调试版保留控制台，`[tyme-app] main window ready` 那行日志要能被 VS Code 的任务抓到。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    chinese_calendar_lib::run();
}
