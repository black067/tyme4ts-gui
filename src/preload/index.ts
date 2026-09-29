import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type AppInfo,
  type AppSettings,
  type AppearanceMode,
  type TymeApi,
  type UpdateState
} from '@shared/ipc'

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
    subscribe: (listener) => {
      // The listener is wrapped so the raw Electron event never reaches the
      // renderer — only the plain snapshot does.
      const handler = (_event: unknown, state: UpdateState): void => listener(state)
      ipcRenderer.on(IPC.updatesStateChanged, handler)
      return () => {
        ipcRenderer.removeListener(IPC.updatesStateChanged, handler)
      }
    }
  }
}

contextBridge.exposeInMainWorld('tyme', api)
