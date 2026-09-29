import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type AppInfo,
  type AppSettings,
  type AppearanceMode,
  type HolidayStatus,
  type TymeApi,
  type UpdateState
} from '@shared/ipc'

/**
 * Subscribes to a main → renderer push channel.
 *
 * The payload is passed through as-is and the raw Electron event never reaches
 * the renderer, so the renderer only ever sees plain serializable snapshots.
 */
function subscribeTo<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: unknown, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

/**
 * The only bridge between the sandboxed renderer and the main process. Every
 * channel is an explicit, typed `invoke` — the renderer never receives raw
 * `ipcRenderer` access.
 */
const api: TymeApi = {
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet) as Promise<AppSettings>,
    set: (patch) => ipcRenderer.invoke(IPC.settingsSet, patch) as Promise<AppSettings>
  },
  theme: {
    setNative: (mode: AppearanceMode) =>
      ipcRenderer.invoke(IPC.themeSetNative, mode) as Promise<void>
  },
  app: {
    getInfo: () => ipcRenderer.invoke(IPC.appGetInfo) as Promise<AppInfo>
  },
  updates: {
    getState: () => ipcRenderer.invoke(IPC.updatesGetState) as Promise<UpdateState>,
    check: () => ipcRenderer.invoke(IPC.updatesCheck) as Promise<UpdateState>,
    download: () => ipcRenderer.invoke(IPC.updatesDownload) as Promise<UpdateState>,
    cancel: () => ipcRenderer.invoke(IPC.updatesCancel) as Promise<UpdateState>,
    install: () => ipcRenderer.invoke(IPC.updatesInstall) as Promise<UpdateState>,
    subscribe: (listener) => subscribeTo(IPC.updatesStateChanged, listener)
  },
  holidays: {
    getStatus: () => ipcRenderer.invoke(IPC.holidaysGetStatus) as Promise<HolidayStatus>,
    refresh: () => ipcRenderer.invoke(IPC.holidaysRefresh) as Promise<HolidayStatus>,
    subscribe: (listener) => subscribeTo(IPC.holidaysStatusChanged, listener)
  }
}

contextBridge.exposeInMainWorld('tyme', api)
