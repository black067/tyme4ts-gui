/**
 * 设置持久化。
 *
 * 逐字移植自 Electron 时代的 `src/main/settings.ts`：字段逐个校验、缓存、原子写盘
 * 三件事都保持原样，只有两点不同——
 *
 * 1. 文件读写交给 `host.ts`（也就是 plugin-fs），不再直接用 `node:fs`；
 * 2. 于是所有入口都变成异步的。缓存语义没变：同一个 realm 里读到的仍是同一个对象，
 *    今天靠"主进程只有一份设置"保证的事，现在靠"整个应用只有一个 JS 世界"保证。
 *
 * 路径写成相对应用数据目录的 `settings.json`，位置与今天完全一致。
 */
import {
  createDefaultSettings,
  isAppearanceMode,
  isLocale,
  isViewId,
  type AppSettings
} from '@shared/ipc'
import { readText, replace, writeText } from './host'

const SETTINGS_FILE = 'settings.json'

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
        : defaults.lastUpdateCheckAt,
    autoUpdateHolidays:
      typeof input.autoUpdateHolidays === 'boolean'
        ? input.autoUpdateHolidays
        : defaults.autoUpdateHolidays
  }
}

let cached: AppSettings | null = null

export async function readSettings(): Promise<AppSettings> {
  if (cached !== null) return cached
  const raw = await readText(SETTINGS_FILE)
  if (raw === null) {
    // Missing or unreadable file on first run: fall back to defaults.
    cached = createDefaultSettings(localTodayIso())
    return cached
  }
  try {
    cached = normalize(JSON.parse(raw))
  } catch {
    cached = createDefaultSettings(localTodayIso())
  }
  return cached
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  cached = normalize({ ...(await readSettings()), ...patch })
  await persist(cached)
  return cached
}

/** 原子写：临时文件 + 改名，崩溃时不会留下半截设置文件。 */
async function persist(settings: AppSettings): Promise<void> {
  // 应用数据目录本身由宿主在建窗口前建好（`src-tauri/src/splash.rs` 的 `data_dir`），
  // 这里只负责临时文件与改名两步。
  const temp = `${SETTINGS_FILE}.tmp`
  await writeText(temp, `${JSON.stringify(settings, null, 2)}\n`)
  await replace(temp, SETTINGS_FILE)
}
