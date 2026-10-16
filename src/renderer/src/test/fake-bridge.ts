import {
  createDefaultSettings,
  type AppInfo,
  type AppSettings,
  type AppearanceMode,
  type DataDirChooseOutcome,
  type DataDirDeleteOutcome,
  type DataDirMoveOutcome,
  type DataDirRelaunchOutcome,
  type HolidayStatus,
  type HolidaysApi,
  type SetupPlanView,
  type TymeApi,
  type UpdateState,
  type UpdatesApi
} from '@shared/ipc'

export interface FakeBridge {
  /** The settings this stand-in currently holds. */
  settings: AppSettings
  /** Every patch the renderer sent, in order. */
  patches: Array<Partial<AppSettings>>
  /** Drives the updater from a test: change the snapshot and notify subscribers. */
  setUpdates(next: Partial<UpdateState>): void
  /** Drives the holiday status from a test. */
  setHolidayStatus(next: Partial<HolidayStatus>): void
  /**
   * 决定下一次 `dataDir.move()` 的结果。搬运与删除都要弹系统对话框、都会真的动盘，
   * 测试里只能由测试来当那个用户与那块盘。
   */
  setDataDirMove(next: DataDirMoveOutcome): void
  /** 决定下一次 `dataDir.plan()` / `choose()` / `remove()` / `pick()` / `relaunch()` 的答复。 */
  setDataDir(next: Partial<FakeDataDir>): void
  /** Every update action the renderer asked for, in order. */
  updateActions: string[]
  /** Every holiday action the renderer asked for, in order. */
  holidayActions: string[]
  /** Every data-directory action the renderer asked for, in order（带路径的记成 `choose:<path>`）。 */
  dataDirActions: string[]
  /** 渲染层读了几次设置。首启那一屏必须是 0：那儿还没有能读的目录，读它就是去建一个。 */
  settingsReads(): number
  /** Restores the previous `window.tyme`, if any. */
  restore(): void
}

/** 测试可控的那几个数据目录答复。 */
export interface FakeDataDir {
  plan: SetupPlanView
  choose: DataDirChooseOutcome
  remove: DataDirDeleteOutcome
  pick: string | null
  relaunch: DataDirRelaunchOutcome
}

/**
 * 一台机器上什么都没有的状态：两个位置都空、都可写，理由是第一次启动。
 *
 * 这是唯一不需要为某个测试编造的状态——它就是"没有用户目录"这件事本身，所以默认值就该是它，
 * 想让某一屏失败的那些测试再各自改。
 */
function emptyPlan(): SetupPlanView {
  return {
    user: {
      id: 'user',
      path: 'C:/Users/Tester/AppData/Roaming/万年历',
      exists: false,
      writable: true
    },
    exe: {
      id: 'exe',
      path: 'D:/tools/万年历/.chinese-calendar',
      exists: false,
      writable: true
    },
    reason: 'first-run',
    recorded: null
  }
}

/** A fresh, never-refreshed holiday status. */
function emptyHolidayStatus(): HolidayStatus {
  return {
    years: [],
    lastUpdatedAt: '',
    spill: 0,
    refreshing: false,
    errorCode: null
  }
}

/**
 * A plain `idle` snapshot. The updater is not under test in the shell tests, so
 * this stands in for `src/backend` rather than exercising it.
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
    canInstall: false,
    installPath: '/tmp/tyme-app/chinese-calendar-0.0.0-test-portable.exe',
    updatedFrom: null
  }
}

const APP_INFO: AppInfo = {
  name: '万年历',
  version: '0.0.0-test',
  author: 'Tester <tester@example.com>',
  runtime: 'Tauri 0.0.0-test · WebView2 0.0.0-test',
  userDataPath: '/tmp/tyme-app-test',
  locale: 'zh-Hans'
}

/**
 * Installs a controllable stand-in for the `window.tyme` facade.
 *
 * The renderer is exercised in jsdom, where `src/backend` never runs — it needs a
 * real host for files, network and events. So the tests hand the renderer the same
 * `window.tyme` surface the shipped app sees, and record what it was asked to do.
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
  const dataDirActions: string[] = []
  let settingsReads = 0
  let dataDirMove: DataDirMoveOutcome = { kind: 'cancelled' }
  // 数据目录那一屏与首启那一屏的答复都由测试给：路径、能不能写、按下去算不算成。
  // 默认值是一套"什么都没发生过、按什么都成"的答复，只有要测某个结局的测试才改它。
  let fakeDataDir: FakeDataDir = {
    plan: emptyPlan(),
    choose: { kind: 'chosen', path: '' },
    remove: { kind: 'deleted', path: emptyPlan().user.path },
    pick: null,
    relaunch: { kind: 'restarting' }
  }
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
      get: async () => {
        // 计数用：首启那一屏一次都不该读设置（那儿还没有能读的目录），而那件事只能这样查。
        settingsReads += 1
        return { ...settings }
      },
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
    dataDir: {
      reveal: async () => {
        dataDirActions.push('reveal')
      },
      move: async () => {
        dataDirActions.push('move')
        return dataDirMove
      },
      remove: async () => {
        dataDirActions.push('remove')
        return fakeDataDir.remove
      },
      pick: async () => {
        dataDirActions.push('pick')
        return fakeDataDir.pick
      },
      plan: async () => {
        dataDirActions.push('plan')
        return fakeDataDir.plan
      },
      choose: async (path) => {
        // 带上路径：首启那一屏要断言的正是"按下去交出去的是哪一个位置"。
        dataDirActions.push(`choose:${path}`)
        // `chosen` 里那个路径本来就是宿主定下来的（可能就是用户填的那个），照着请求回。
        return fakeDataDir.choose.kind === 'chosen' ? { kind: 'chosen', path } : fakeDataDir.choose
      },
      relaunch: async () => {
        dataDirActions.push('relaunch')
        return fakeDataDir.relaunch
      }
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
    dataDirActions,
    settingsReads: () => settingsReads,
    setUpdates: (next) => {
      updateState = { ...updateState, ...next }
      emitUpdate()
    },
    setHolidayStatus: (next) => {
      holidayStatus = { ...holidayStatus, ...next }
      emitHoliday()
    },
    setDataDirMove: (next) => {
      dataDirMove = next
    },
    setDataDir: (next) => {
      fakeDataDir = { ...fakeDataDir, ...next }
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
