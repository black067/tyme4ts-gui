/**
 * 后端的启动序列——旧版 `src/main/index.ts` 里 `boot()` 的那一段。
 *
 * 窗口创建、首帧底色、单实例、深浅色都已经交给 Rust 与 `src-tauri`，这里只剩
 * "把门面装好、把缓存喂饱、把两个定时器排上"。定时器延后到 React 挂载之后再装，
 * 于是骨架屏不会和一个后台请求抢同一段时间线；两个延后时长（1.5 秒与 3 秒）与旧版一致。
 */
import { checkAndRecord, installBridge } from './bridge'
import { primeAppVersion } from './host'
import { loadCachedHolidays, refreshHolidays } from './holidays'
import { readSettings } from './settings'
import { primeUpdaterContext } from './updater'

/** 与旧版 `boot()` 里的两个 `setTimeout` 一致的延后时长。 */
const HOLIDAY_REFRESH_DELAY_MS = 1500
const UPDATE_CHECK_DELAY_MS = 3000

/**
 * 在 React 挂载之前把应用跑起来。
 *
 * 返回时 `window.tyme` 已经可用、节假日缓存已经读进引擎，界面第一次渲染就能看见数据。
 * 定时器不等它们完成——离线时读缓存失败、拉取超时，都不该让窗口里一直是骨架屏。
 */
export async function startBackend(): Promise<void> {
  await primeAppVersion()
  // 不等它：安装路径与"刚从哪个版本更新来"只影响更新那一栏的措辞，晚一帧到也没人看得见。
  // 启动路径上多挡一次 IPC，挡的是骨架屏变内容的那段时间。
  void primeUpdaterContext()
  const settings = await readSettings()

  installBridge()

  // 旧版在创建窗口前做这一件事，好让第一帧就有 休/班 角标；现在还是"渲染前"，
  // 只是这一次真的落到了同一个引擎实例里（旧版落到的是主进程那份，界面看不见）。
  await loadCachedHolidays()

  // 深浅色不在这里管：Rust 创建窗口时已按同一份设置钉过一次（`src-tauri/src/splash.rs`），
  // 挂载后 ThemeProvider 的 effect 又会调 `theme.setNative` 把它接进 webview。
  // 启动路径上多一次 IPC 只是重复设置同一个值。

  if (settings.autoUpdateHolidays) {
    setTimeout(() => {
      void refreshHolidays()
    }, HOLIDAY_REFRESH_DELAY_MS)
  }

  if (settings.checkForUpdatesOnStart) {
    setTimeout(() => {
      // 与用户手点"检查更新"走的是同一个函数，因此也会记下检查时间。
      void checkAndRecord()
    }, UPDATE_CHECK_DELAY_MS)
  }
}
