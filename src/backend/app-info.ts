/**
 * 宿主给"关于"面板的那几个事实。
 *
 * 旧版这些值来自 Electron：`app.getName()` / `app.getVersion()` / 读
 * `app.getAppPath()/package.json` 拿作者 / `process.versions` 拿三个运行时版本 /
 * `app.getPath('userData')` 拿目录。现在：
 *
 * - 名字、版本走宿主的 app 命令（`productName` 仍是 package.json 里那个 `万年历`）；
 * - 作者不再读盘——产物里没有 `package.json` 可读，构建时由 `vite.config.ts` 注成常量；
 * - 运行时只剩两个数：Tauri 版本与 WebView2 版本（后者从用户代理的 `Edg/` 里取），
 *   Node 那一档随主进程一起消失了；
 * - 数据目录是 `appDataDir()`，被 `appDirectoriesOverride` 指到 `%APPDATA%\万年历`，
 *   与旧版的 `userData` 同一个路径。
 */
import type { AppInfo } from '@shared/ipc'
import { appName, appVersion, runtimeLabel, userDataPath } from './host'
import { readSettings } from './settings'

/** 构建期常量：`vite.config.ts` 从 package.json 的 author 格式化后注入。 */
declare const __APP_AUTHOR__: string

export async function getAppInfo(): Promise<AppInfo> {
  const settings = await readSettings()
  return {
    name: await appName(),
    version: await appVersion(),
    author: __APP_AUTHOR__,
    runtime: await runtimeLabel(),
    userDataPath: await userDataPath(),
    locale: settings.locale
  }
}
