/**
 * 宿主的窄接口：整个仓库里只有这个目录可以 import `@tauri-apps/*`。
 *
 * 这一层存在的意义是把"Tauri 怎么说"和"这个应用怎么说"分开。除它以外的代码——
 * 日历推算（`src/core`）、界面（`src/renderer`）、契约（`src/shared`）——都不知道
 * 自己跑在 Tauri 里，只知道文件读写、HTTP、事件、开窗这些动作可以交给外面做。
 * 换宿主时改的就是这一个目录，`tests/host-boundary.test.ts` 会替你盯着别漏。
 *
 * 路径一律写成相对应用数据目录的形式（`settings.json`、`holidays/2026.json`），
 * 由 `BaseDirectory.AppData` 解析。tauri.conf.json 里的 `appDirectoriesOverride`
 * 把这个目录指到 `%APPDATA%\万年历`，与 Electron 时代的 `userData` 是同一个地方，
 * 老用户的设置与节假日缓存因此原地可用。
 */
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { appDataDir, BaseDirectory } from '@tauri-apps/api/path'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getName, getTauriVersion, getVersion } from '@tauri-apps/api/app'
import { exists, mkdir, readTextFile, rename, writeTextFile } from '@tauri-apps/plugin-fs'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { open } from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'
import type { AppearanceMode } from '@shared/ipc'

const APP_DATA = BaseDirectory.AppData

/** 应用数据目录的绝对路径，只用于展示与当作对话框的起点。 */
export function userDataPath(): Promise<string> {
  return appDataDir()
}

/**
 * 系统原生的"选择文件夹"对话框。
 *
 * 只把用户选中的绝对路径交出去，**不**因此获得任何读写权限：能读哪里仍由能力清单里
 * `$APPDATA/**` 那几条决定，而那几条跟着数据目录的 override 走（见 `src-tauri/src/paths.rs`）。
 * 按取消返回 `null`——那是一次正常结束的操作，不是错误。
 */
export async function pickDirectory(defaultPath: string): Promise<string | null> {
  // 空串不是"从根开始"，而是"这里没有答案"：那种情况干脆不给起点，让系统停在它自己认为
  // 合适的位置，也不要传一个空路径过去让对话框报错。
  const picked = await open({
    directory: true,
    multiple: false,
    ...(defaultPath === '' ? {} : { defaultPath })
  })
  return typeof picked === 'string' && picked !== '' ? picked : null
}

export function appName(): Promise<string> {
  return getName()
}

export function appVersion(): Promise<string> {
  return getVersion()
}

/**
 * 版本号缓存。
 *
 * 更新器的 `setState()` 每次都把 `currentVersion` 重新盖一遍（旧版靠同步的
 * `app.getVersion()`），而 `getVersion()` 在这里是异步的。所以启动时先 `prime` 一次，
 * 之后同步读。没准备好时返回空串而不是猜一个——空串只可能出现在启动早期。
 */
let primedVersion: string | null = null

export async function primeAppVersion(): Promise<string> {
  primedVersion = await getVersion()
  return primedVersion
}

export function appVersionCached(): string {
  return primedVersion ?? ''
}

/**
 * 运行时那一行展示文字。
 *
 * WebView2 的版本藏在用户代理的 `Edg/` 里——这是没有 Node 版本可报之后唯一还算有用的
 * 运行时事实；拿不到（自定义 UA）时只报 Tauri 版本，不编造数字。
 */
export async function runtimeLabel(): Promise<string> {
  const tauri = await getTauriVersion()
  const webview = /Edg\/([\d.]+)/.exec(navigator.userAgent)?.[1]
  return webview === undefined ? `Tauri ${tauri}` : `Tauri ${tauri} · WebView2 ${webview}`
}

/** 设置里没有的键按不存在处理，与今天 `readFileSync` 失败后回落到默认值一致。 */
export async function readText(name: string): Promise<string | null> {
  try {
    return await readTextFile(name, { baseDir: APP_DATA })
  } catch {
    return null
  }
}

export async function writeText(name: string, contents: string): Promise<void> {
  await writeTextFile(name, contents, { baseDir: APP_DATA })
}

export async function pathExists(name: string): Promise<boolean> {
  return exists(name, { baseDir: APP_DATA })
}

export async function ensureDir(name: string): Promise<void> {
  await mkdir(name, { baseDir: APP_DATA, recursive: true })
}

/** 原子替换：先写 `.tmp` 再改名，和今天 `persist()` / `writeCache()` 的写法一致。 */
export async function replace(from: string, to: string): Promise<void> {
  await rename(from, to, { oldPathBaseDir: APP_DATA, newPathBaseDir: APP_DATA })
}

/**
 * 走 Rust 的 HTTP 请求。
 *
 * 用 `@tauri-apps/plugin-http` 而不是全局 `fetch`：请求由宿主发出，没有 CORS 这一层，
 * `User-Agent` 与 `Accept` 也能如实带上（今天主进程发的那些头，就是为了这个）。
 * 能力文件把域名限死在 api.github.com / cdn.jsdelivr.net / unpkg.com 三处。
 */
export function httpFetch(input: string, init?: RequestInit): Promise<Response> {
  return tauriFetch(input, init)
}

/** 调 Rust 侧命令。命令名与参数名要和 `src-tauri/src/*.rs` 对得上。 */
export function hostInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(command, args)
}

/** 订阅 Rust 侧推来的事件，返回退订函数。 */
export function hostListen<T>(event: string, handler: (payload: T) => void): () => void {
  let unlisten: (() => void) | null = null
  let disposed = false
  void listen<T>(event, ({ payload }) => handler(payload)).then((release) => {
    unlisten = release
    if (disposed) {
      release()
    }
  })
  return () => {
    disposed = true
    unlisten?.()
  }
}

/** 把深浅色钉到窗口与 webview 上：等价于今天的 `nativeTheme.themeSource`。 */
export async function setWindowTheme(mode: AppearanceMode): Promise<void> {
  await getCurrentWindow().setTheme(mode === 'system' ? null : mode)
}

/**
 * 交给系统默认程序打开。
 *
 * 与今天 `setWindowOpenHandler` 的策略一致：只放 https 出去，其余一律拦下。
 */
export async function openExternal(url: string): Promise<void> {
  if (!/^https:\/\//i.test(url)) {
    return
  }
  await openUrl(url)
}
