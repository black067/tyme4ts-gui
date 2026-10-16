/**
 * `window.tyme` 的实现。
 *
 * 旧版这块代码在 `src/preload/index.ts`：`ipcRenderer.invoke` 转发 + `contextBridge` 挂到
 * window 上。现在只有 JS 世界，门面直接由 TS 实现——**接口的形状一个字节没动**
 * （`TymeApi` 仍是 `src/shared/ipc.ts` 里那个），所以渲染层的几百行代码不用改一行调用。
 *
 * 少掉的一层是订阅转发：旧版主进程要 `broadcast()` 给每个窗口，现在
 * `subscribeUpdates` / `subscribeHolidays` 就是 `src/backend` 里那两个本地监听器。
 */
import type { AppSettings, AppearanceMode, TymeApi, UpdateState } from '@shared/ipc'
import { openExternal, setWindowTheme } from './host'
import { readSettings, updateSettings } from './settings'
import { getAppInfo } from './app-info'
import {
  cancelUpdate,
  checkForUpdates,
  downloadUpdate,
  getUpdateState,
  installUpdate,
  subscribeUpdates
} from './updater'
import { getHolidayStatus, refreshHolidays, subscribeHolidays } from './holidays'
import {
  chooseDataDir,
  deleteDataDir,
  moveDataDir,
  pickDataDir,
  relaunchDataDir,
  revealDataDir,
  setupPlan
} from './data-dir'

/**
 * 每次检查完都记一笔时间。
 *
 * 设置界面靠它显示"上次检查 …"，也让一次失败的检查不至于每次挂载都重试一次。
 * 旧版这条规则写在 `ipcMain.handle(IPC.updatesCheck)` 里，现在写在被调用的那个函数上，
 * 于是"启动时的自动检查"和"用户手点的检查"记录的是同一件事。
 */
export async function checkAndRecord(): Promise<UpdateState> {
  const next = await checkForUpdates()
  await updateSettings({ lastUpdateCheckAt: new Date().toISOString() })
  return next
}

const api: TymeApi = {
  settings: {
    get: () => readSettings(),
    set: async (patch: Partial<AppSettings>) => {
      const next = await updateSettings(patch)
      // 深浅色一改，窗口与 webview 立刻跟上：等价于旧版那句 nativeTheme.themeSource = mode。
      if (patch.appearance !== undefined) await setWindowTheme(next.appearance)
      return next
    }
  },
  theme: {
    setNative: (mode: AppearanceMode) => setWindowTheme(mode)
  },
  app: {
    getInfo: () => getAppInfo()
  },
  dataDir: {
    reveal: () => revealDataDir(),
    move: () => moveDataDir(),
    remove: () => deleteDataDir(),
    // 对话框只回一个路径字符串：它不授予任何读写权限，能读哪里仍由 `$APPDATA/**` 那几条说了算。
    pick: () => pickDataDir(),
    plan: () => setupPlan(),
    choose: (path: string) => chooseDataDir(path),
    relaunch: () => relaunchDataDir()
  },
  updates: {
    getState: () => Promise.resolve(getUpdateState()),
    check: () => checkAndRecord(),
    download: () => downloadUpdate(),
    cancel: () => Promise.resolve(cancelUpdate()),
    install: () => installUpdate(),
    subscribe: (listener) => subscribeUpdates(listener)
  },
  holidays: {
    getStatus: () => Promise.resolve(getHolidayStatus()),
    refresh: () => refreshHolidays(),
    subscribe: (listener) => subscribeHolidays(listener)
  }
}

/**
 * 外链交给系统浏览器。
 *
 * 旧版是主进程的 `setWindowOpenHandler`：任何"开新窗口"的请求一律 deny，然后
 * `shell.openExternal`。Tauri 默认更严——没有 `on_new_window` 处理器时，
 * `window.open` 与 `target="_blank"` 会被直接吞掉（wry 把请求标记为已处理），
 * 于是设置页里那几个许可证链接会点不动。这里补上等价行为。
 */
export function interceptExternalLinks(): void {
  document.addEventListener(
    'click',
    (event) => {
      if (event.defaultPrevented) return
      const anchor = (event.target as Element | null)?.closest?.('a[target="_blank"]') ?? null
      const href = anchor?.getAttribute('href')
      if (!anchor || !href) return
      event.preventDefault()
      void openExternal(new URL(href, document.baseURI).href)
    },
    true
  )

  // `window.open` 同理：默认被吞，这里显式转成"用系统浏览器打开"。应用里没有这种调用，
  // 但旧版的 setWindowOpenHandler 覆盖它，行为上不该有差别。
  window.open = (url?: string | URL): Window | null => {
    if (url !== undefined && String(url) !== '') {
      void openExternal(new URL(String(url), document.baseURI).href)
    }
    return null
  }
}

export function installBridge(): void {
  interceptExternalLinks()
  window.tyme = api
}
