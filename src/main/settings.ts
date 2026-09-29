import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import {
  createDefaultSettings,
  isAppearanceMode,
  isLocale,
  isViewId,
  type AppSettings
} from '@shared/ipc'

/** `YYYY-MM-DD` for the local calendar day, matching `DateKey`'s ISO form. */
function localTodayIso(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${String(now.getFullYear()).padStart(4, '0')}-${month}-${day}`
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Coerces arbitrary JSON from disk into a valid `AppSettings`. Every field is
 * validated independently so a single corrupt value cannot poison the rest.
 */
function normalize(raw: unknown): AppSettings {
  const defaults = createDefaultSettings(localTodayIso())
  if (typeof raw !== 'object' || raw === null) return defaults
  const input = raw as Record<string, unknown>
  return {
    themeId:
      typeof input.themeId === 'string' && input.themeId.length > 0
        ? input.themeId
        : defaults.themeId,
    appearance: isAppearanceMode(input.appearance) ? input.appearance : defaults.appearance,
    // Absent in files written before the setting existed, hence the default.
    locale: isLocale(input.locale) ? input.locale : defaults.locale,
    defaultView: isViewId(input.defaultView) ? input.defaultView : defaults.defaultView,
    lastViewedDate:
      typeof input.lastViewedDate === 'string' && ISO_DATE.test(input.lastViewedDate)
        ? input.lastViewedDate
        : defaults.lastViewedDate,
    showAlmanac: typeof input.showAlmanac === 'boolean' ? input.showAlmanac : defaults.showAlmanac,
    weekStartsOnMonday:
      typeof input.weekStartsOnMonday === 'boolean'
        ? input.weekStartsOnMonday
        : defaults.weekStartsOnMonday,
    showGlossary:
      typeof input.showGlossary === 'boolean' ? input.showGlossary : defaults.showGlossary,
    checkForUpdatesOnStart:
      typeof input.checkForUpdatesOnStart === 'boolean'
        ? input.checkForUpdatesOnStart
        : defaults.checkForUpdatesOnStart,
    lastUpdateCheckAt:
      typeof input.lastUpdateCheckAt === 'string'
        ? input.lastUpdateCheckAt
        : defaults.lastUpdateCheckAt
  }
}

let cached: AppSettings | null = null

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function readSettings(): AppSettings {
  if (cached !== null) return cached
  try {
    cached = normalize(JSON.parse(readFileSync(settingsPath(), 'utf8')))
  } catch {
    // Missing or unreadable file on first run: fall back to defaults.
    cached = createDefaultSettings(localTodayIso())
  }
  return cached
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  cached = normalize({ ...readSettings(), ...patch })
  persist(cached)
  return cached
}

/** Writes atomically so a crash mid-write cannot leave a truncated settings file. */
function persist(settings: AppSettings): void {
  const target = settingsPath()
  mkdirSync(dirname(target), { recursive: true })
  const temp = `${target}.tmp`
  writeFileSync(temp, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
  renameSync(temp, target)
}
