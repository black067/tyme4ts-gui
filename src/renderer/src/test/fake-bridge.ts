import {
  createDefaultSettings,
  IPC,
  type AppInfo,
  type AppSettings,
  type AppearanceMode,
  type HolidayStatus,
  type HolidaysApi,
  type TymeApi,
  type UpdateState,
  type UpdatesApi
} from '@shared/ipc'

export interface FakeBridge {
  /** The settings the fake main process currently holds. */
  settings: AppSettings
  /** Every patch the renderer sent, in order. */
  patches: Array<Partial<AppSettings>>
  /** Drives the updater from a test: change the snapshot and notify subscribers. */
  setUpdates(next: Partial<UpdateState>): void
  /** Drives the holiday status from a test. */
  setHolidayStatus(next: Partial<HolidayStatus>): void
  /** Every update action the renderer asked for, in order. */
  updateActions: string[]
  /** Every holiday action the renderer asked for, in order. */
  holidayActions: string[]
  /** Restores the previous `window.tyme`, if any. */
  restore(): void
}

/** A fresh, never-refreshed holiday status. */
function emptyHolidayStatus(): HolidayStatus {
  return {
    years: [],
    lastUpdatedAt: '',
    papers: [],
    spill: 0,
    refreshing: false,
    errorCode: null
  }
}

/**
 * A plain `idle` snapshot. The updater is not under test in the shell tests, so
 * this stands in for the main process rather than exercising it.
 */
function idleUpdateState(version: string): UpdateState {
  return {
    phase: 'idle',
    currentVersion: version,
    latestVersion: null,
    releaseNotes: null,
    releaseUrl: null,
    progress: null,
    errorCode: null,
    canInstall: false
  }
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
  const updateActions: string[] = []
  const updateListeners = new Set<(state: UpdateState) => void>()
  let updateState = idleUpdateState(APP_INFO.version)
  const holidayActions: string[] = []
  const holidayListeners = new Set<(status: HolidayStatus) => void>()
  let holidayStatus = emptyHolidayStatus()
  const previous = window.tyme

  const emitUpdate = (): void => {
    for (const listener of updateListeners) listener(updateState)
  }

  const emitHoliday = (): void => {
    for (const listener of holidayListeners) listener(holidayStatus)
  }

  const holidays: HolidaysApi = {
    getStatus: async () => holidayStatus,
    refresh: async () => {
      holidayActions.push('refresh')
      return holidayStatus
    },
    subscribe: (listener) => {
      holidayListeners.add(listener)
      return () => holidayListeners.delete(listener)
    }
  }

  const updates: UpdatesApi = {
    getState: async () => updateState,
    check: async () => {
      updateActions.push('check')
      return updateState
    },
    download: async () => {
      updateActions.push('download')
      return updateState
    },
    cancel: async () => {
      updateActions.push('cancel')
      return updateState
    },
    install: async () => {
      updateActions.push('install')
      return updateState
    },
    subscribe: (listener) => {
      updateListeners.add(listener)
      return () => updateListeners.delete(listener)
    }
  }

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
    },
    updates,
    holidays
  }

  Object.defineProperty(window, 'tyme', {
    value: api,
    configurable: true,
    writable: true
  })

  return {
    settings,
    patches,
    updateActions,
    holidayActions,
    setUpdates: (next) => {
      updateState = { ...updateState, ...next }
      emitUpdate()
    },
    setHolidayStatus: (next) => {
      holidayStatus = { ...holidayStatus, ...next }
      emitHoliday()
    },
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
