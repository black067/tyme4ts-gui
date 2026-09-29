import {
  createDefaultSettings,
  IPC,
  type AppInfo,
  type AppSettings,
  type AppearanceMode,
  type TymeApi
} from '@shared/ipc'

export interface FakeBridge {
  /** The settings the fake main process currently holds. */
  settings: AppSettings
  /** Every patch the renderer sent, in order. */
  patches: Array<Partial<AppSettings>>
  /** Restores the previous `window.tyme`, if any. */
  restore(): void
}

const APP_INFO: AppInfo = {
  name: '万年历',
  version: '0.0.0-test',
  author: 'Tester <tester@example.com>',
  electron: 'test',
  chrome: 'test',
  node: 'test',
  userDataPath: '/tmp/tyme-app-test',
  locale: 'zh-Hans'
}

/**
 * Installs a controllable stand-in for the preload bridge.
 *
 * The renderer is exercised in jsdom, where no preload script runs, so the
 * tests provide the same `window.tyme` surface the real app sees.
 */
export function installFakeBridge(overrides: Partial<AppSettings> = {}): FakeBridge {
  const settings: AppSettings = { ...createDefaultSettings('2024-06-26'), ...overrides }
  const patches: Array<Partial<AppSettings>> = []
  const previous = window.tyme

  const api: TymeApi = {
    settings: {
      get: async () => ({ ...settings }),
      set: async (patch) => {
        patches.push(patch)
        Object.assign(settings, patch)
        return { ...settings }
      }
    },
    theme: {
      setNative: async (_mode: AppearanceMode) => undefined
    },
    app: {
      getInfo: async () => APP_INFO
    }
  }

  Object.defineProperty(window, 'tyme', {
    value: api,
    configurable: true,
    writable: true
  })

  return {
    settings,
    patches,
    restore: () => {
      Object.defineProperty(window, 'tyme', {
        value: previous,
        configurable: true,
        writable: true
      })
    }
  }
}

/** The IPC channel names, re-exported so tests can assert against them. */
export { IPC }
