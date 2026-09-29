/**
 * IPC contract shared by the Electron main process, the preload bridge and the
 * renderer. Everything in this file must stay free of Electron, React and DOM
 * imports so that all three sides can depend on it.
 */

/** Channel names for the renderer <-> main bridge. */
export const IPC = {
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  themeSetNative: 'theme:set-native',
  appGetInfo: 'app:get-info'
} as const

/** Top-level views of the application shell. */
export type ViewId = 'month' | 'day' | 'year' | 'timeline' | 'tools'

/** `system` follows the OS appearance; `light` / `dark` pin the app to one variant. */
export type AppearanceMode = 'system' | 'light' | 'dark'

/** Persisted user preferences. Kept intentionally small and JSON-serializable. */
export interface AppSettings {
  /** Theme definition id, e.g. `minimal-light`. */
  themeId: string
  /** Whether the app follows the OS appearance. */
  appearance: AppearanceMode
  /** View restored on launch. */
  defaultView: ViewId
  /** `YYYY-MM-DD` of the last browsed day. */
  lastViewedDate: string
  /** Render the almanac sections (宜忌 / 神煞 / 胎神 …) in the day panel. */
  showAlmanac: boolean
  /** Treat Monday as the first column of the week grid. */
  weekStartsOnMonday: boolean
}

/** Runtime facts about the host, surfaced in the about panel. */
export interface AppInfo {
  version: string
  electron: string
  chrome: string
  node: string
  userDataPath: string
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
}

export const VIEW_IDS: readonly ViewId[] = ['month', 'day', 'year', 'timeline', 'tools']

export const APPEARANCE_MODES: readonly AppearanceMode[] = ['system', 'light', 'dark']

export const DEFAULT_THEME_ID = 'minimal-light'

/** Builds the settings used on a first run (or when the stored file is unusable). */
export function createDefaultSettings(todayIso: string): AppSettings {
  return {
    themeId: DEFAULT_THEME_ID,
    appearance: 'system',
    defaultView: 'month',
    lastViewedDate: todayIso,
    showAlmanac: true,
    weekStartsOnMonday: false
  }
}

export function isViewId(value: unknown): value is ViewId {
  return typeof value === 'string' && (VIEW_IDS as readonly string[]).includes(value)
}

export function isAppearanceMode(value: unknown): value is AppearanceMode {
  return typeof value === 'string' && (APPEARANCE_MODES as readonly string[]).includes(value)
}
