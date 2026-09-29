/**
 * IPC contract shared by the Electron main process, the preload bridge and the
 * renderer. Everything in this file must stay free of Electron, React and DOM
 * imports so that all three sides can depend on it.
 */
import type { UpdatesApi } from './update'
import type { HolidaysApi } from './holidays'

export type {
  UpdateErrorCode,
  UpdatePhase,
  UpdateProgress,
  UpdateState,
  UpdatesApi
} from './update'

export type { HolidayErrorCode, HolidayStatus, HolidaysApi } from './holidays'

/** Channel names for the renderer <-> main bridge. */
export const IPC = {
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  themeSetNative: 'theme:set-native',
  appGetInfo: 'app:get-info',
  updatesGetState: 'updates:get-state',
  updatesCheck: 'updates:check',
  updatesDownload: 'updates:download',
  updatesCancel: 'updates:cancel',
  updatesInstall: 'updates:install',
  /** Main -> renderer push of an `UpdateState` snapshot. */
  updatesStateChanged: 'updates:state-changed',
  holidaysGetStatus: 'holidays:get-status',
  holidaysRefresh: 'holidays:refresh',
  /** Main -> renderer push of a `HolidayStatus`. */
  holidaysStatusChanged: 'holidays:status-changed'
} as const

/** Top-level views of the application shell. */
export type ViewId = 'month' | 'day' | 'year' | 'timeline' | 'tools'

/** `system` follows the OS appearance; `light` / `dark` pin the app to one variant. */
export type AppearanceMode = 'system' | 'light' | 'dark'

/**
 * UI language.
 *
 * Only the chrome is translated through this: the calendar engine (`tyme4ts`)
 * has no locale API and always yields Simplified Chinese names, so almanac
 * vocabulary is handled by an explicit mapping layer rather than by this union.
 * Adding a language means adding a catalog under `renderer/src/i18n/messages/`
 * and a member here — nothing else.
 */
export type Locale = 'zh-Hans'

/** Persisted user preferences. Kept intentionally small and JSON-serializable. */
export interface AppSettings {
  /** Theme family id, e.g. `minimal`. The light/dark variant follows `appearance`. */
  themeId: string
  /** Whether the app follows the OS appearance. */
  appearance: AppearanceMode
  /** UI language of the app chrome. */
  locale: Locale
  /** View restored on launch. */
  defaultView: ViewId
  /** `YYYY-MM-DD` of the last browsed day. */
  lastViewedDate: string
  /** Render the almanac sections (宜忌 / 神煞 / 胎神 …) in the day panel. */
  showAlmanac: boolean
  /** Treat Monday as the first column of the week grid. */
  weekStartsOnMonday: boolean
  /** Show the term glossary (hover a term for its meaning, click for the source). */
  showGlossary: boolean
  /** Ask GitHub for a newer release shortly after launch. */
  checkForUpdatesOnStart: boolean
  /**
   * ISO timestamp of the last completed check attempt, or `''` when never.
   *
   * Recorded so the settings screen can show when it last looked, and so a
   * failed check is not retried on every navigation.
   */
  lastUpdateCheckAt: string
  /**
   * Refresh the statutory-holiday table from the public source at launch.
   *
   * The engine's built-in table stops at 2026-10-10, so this is what keeps the
   * 休/班 badges working past it.
   */
  autoUpdateHolidays: boolean
}

/** Runtime facts about the host, surfaced in the settings screen's About panel. */
export interface AppInfo {
  /** The application name Electron resolved, i.e. `productName`. */
  name: string
  version: string
  /** Author as recorded in the shipped `package.json`, e.g. `name <email>`. */
  author: string
  electron: string
  chrome: string
  node: string
  userDataPath: string
  /**
   * Language of the app chrome, from the persisted settings.
   *
   * The renderer needs it to set `document.title`: Electron derives the window
   * title from the page title, so this is how the localized name reaches the
   * native title bar.
   */
  locale: Locale
}

/** The API surface exposed on `window.tyme` by the preload script. */
export interface TymeApi {
  settings: {
    get(): Promise<AppSettings>
    set(patch: Partial<AppSettings>): Promise<AppSettings>
  }
  theme: {
    /** Mirrors the renderer's appearance choice onto Electron's `nativeTheme`. */
    setNative(mode: AppearanceMode): Promise<void>
  }
  app: {
    getInfo(): Promise<AppInfo>
  }
  updates: UpdatesApi
  holidays: HolidaysApi
}

export const VIEW_IDS: readonly ViewId[] = ['month', 'day', 'year', 'timeline', 'tools']

export const APPEARANCE_MODES: readonly AppearanceMode[] = ['system', 'light', 'dark']

export const LOCALES: readonly Locale[] = ['zh-Hans']

export const DEFAULT_LOCALE: Locale = 'zh-Hans'

export const DEFAULT_THEME_ID = 'minimal'

/** Builds the settings used on a first run (or when the stored file is unusable). */
export function createDefaultSettings(todayIso: string): AppSettings {
  return {
    themeId: DEFAULT_THEME_ID,
    appearance: 'system',
    locale: DEFAULT_LOCALE,
    defaultView: 'month',
    lastViewedDate: todayIso,
    showAlmanac: true,
    weekStartsOnMonday: false,
    showGlossary: true,
    checkForUpdatesOnStart: true,
    lastUpdateCheckAt: '',
    autoUpdateHolidays: true
  }
}

export function isViewId(value: unknown): value is ViewId {
  return typeof value === 'string' && (VIEW_IDS as readonly string[]).includes(value)
}

export function isAppearanceMode(value: unknown): value is AppearanceMode {
  return typeof value === 'string' && (APPEARANCE_MODES as readonly string[]).includes(value)
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}
