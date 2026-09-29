import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type AppInfo, type AppSettings, type AppearanceMode, type TymeApi } from '@shared/ipc'

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
  }
}

contextBridge.exposeInMainWorld('tyme', api)
