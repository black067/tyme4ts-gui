import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { IPC, type AppInfo, type AppSettings, type AppearanceMode } from '@shared/ipc'
import { readSettings, updateSettings } from './settings'

function applyNativeAppearance(mode: AppearanceMode): void {
  nativeTheme.themeSource = mode
}

/**
 * The shipped `package.json`, read at runtime so the About panel can never
 * disagree with the executable's own metadata.
 */
function readManifest(): { name?: string; author?: string | { name?: string; email?: string } } {
  try {
    return JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')) as {
      name?: string
      author?: string | { name?: string; email?: string }
    }
  } catch {
    return {}
  }
}

function formatAuthor(author: { name?: string; email?: string } | string | undefined): string {
  if (typeof author === 'string') return author
  if (!author?.name) return ''
  return author.email ? `${author.name} <${author.email}>` : author.name
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC.settingsGet, (): AppSettings => readSettings())

  ipcMain.handle(IPC.settingsSet, (_event, patch: Partial<AppSettings>): AppSettings => {
    const next = updateSettings(patch)
    // Keep Electron's own theme source in step so native chrome follows the app.
    if (patch.appearance !== undefined) applyNativeAppearance(next.appearance)
    return next
  })

  ipcMain.handle(IPC.themeSetNative, (_event, mode: AppearanceMode): void => {
    applyNativeAppearance(mode)
  })

  ipcMain.handle(IPC.appGetInfo, (): AppInfo => {
    const manifest = readManifest()
    return {
      name: app.getName(),
      version: app.getVersion(),
      author: formatAuthor(manifest.author),
      electron: process.versions.electron ?? '',
      chrome: process.versions.chrome ?? '',
      node: process.versions.node,
      userDataPath: app.getPath('userData'),
      locale: readSettings().locale
    }
  })
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1240,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: '万年历',
    backgroundColor: '#f6f6f4',
    // No `icon` here on purpose: Electron's nativeImage cannot decode SVG, and
    // that is the only icon source in the repo. A packaged build carries the
    // icon inside the executable via electron-builder's `win.icon`, so only the
    // dev window (the stock electron.exe) shows the default Electron icon.
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    console.log('[tyme-app] main window ready')
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.tyme.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  applyNativeAppearance(readSettings().appearance)
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
