/**
 * 法定节假日覆盖层 (statutory-holiday overlay).
 *
 * tyme4ts ships a **frozen** copy of the State Council holiday table: it covers
 * 2001-12-29 through 2026-10-10 and then simply stops, so 2030 春节 would render
 * without a 休/班 badge. This module holds the same information as an *overlay*
 * on top of that table, sourced from `vsme/chinese-days` (MIT, CI-generated from
 * the State Council announcements) and refreshed at runtime.
 *
 * The overlay wins per date; every date it does not mention still falls through
 * to `SolarDay.getLegalHoliday()` unchanged. Consequences worth stating plainly:
 *
 * - The built-in table stays the offline default, so the app keeps working with
 *   no network at all and no overlay installed.
 * - The overlay can also *correct* the engine inside the engine's own range,
 *   which matters if tyme4ts is ever wrong or a 调休 is revised.
 *
 * Everything here is pure data-in/data-out except the small registry at the
 * bottom, which exists only so the memoized day/year builds can be dropped when
 * a new table is installed (see {@link onHolidayOverlayChange}).
 */
import { SOLAR_YEAR_MIN, fromIsoDate } from './date-key'
import type { HolidayErrorCode } from '@shared/holidays'
import type { HolidayRef } from './types'

/** One validated rest/work day, as published by chinese-days. */
export interface HolidayEntry {
  /** Canonical `YYYY-MM-DD`. */
  iso: string
  /** 节日名，如 `春节`。May cover several festivals, e.g. `国庆节、中秋节`. */
  name: string
  /** Source field `isOffDay`: `true` = 休（放假）, `false` = 班（调休上班）. */
  isOffDay: boolean
}

/** `normalizeHolidayPayload` either returns valid entries or a reason it refused the payload. */
export type HolidayPayloadOutcome =
  | {
      ok: true
      /** The payload's own `year`. */
      year: number
      /** Valid, de-duplicated entries, ascending by date. */
      entries: HolidayEntry[]
      /** Entries thrown away as malformed, or superseded by a later duplicate date. */
      dropped: number
      /** Entries whose date sits in the neighbouring calendar year (see the spill rule). */
      spill: number
    }
  | { ok: false; error: string }

/**
 * How far a date may sit from the year whose file it came from.
 *
 * A year's arrangement is published as one document that may reach into the
 * neighbouring December/January — the 元旦 holiday week regularly straddles the
 * year boundary, and the 调休 workdays around it can land on either side. So the
 * tolerated window is the declared year plus its two direct neighbours: wide
 * enough that no genuine straddling date is discarded, narrow enough that a date
 * two years out is still treated as corruption. Entries accepted outside the
 * declared year are reported via `spill` so the tolerance stays auditable rather
 * than silent.
 */
const MAX_YEAR_SPILL = 1

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 节日名的别名归一。
 *
 * 数据源用的名字比引擎短：`中秋` / `端午` / `清明`，而引擎（以及界面此前一直显示的）
 * 是 `中秋节` / `端午节` / `清明节`。覆盖层是**覆盖**关系——同一天只要覆盖层有值就
 * 用覆盖层的名字，所以不归一就会在引擎本来就认识的日子上显示成「中秋」，
 * 等于凭空换了一套说法。
 *
 * 只映射确知是同一天的简称。表里没有的名字原样保留：与其猜，不如让新出现的名字
 * 照原样显示出来，这样也更容易被发现。
 */
const NAME_ALIASES: Readonly<Record<string, string>> = {
  清明: '清明节',
  端午: '端午节',
  中秋: '中秋节'
}

function normalizeName(name: string): string {
  return NAME_ALIASES[name] ?? name
}

/**
 * Reads one `holidays` / `workdays` map value, returning `null` for anything malformed.
 *
 * The source value is `"<英文名>,<中文名>,<薪资倍数>"`, e.g.
 * `"Spring Festival,春节,4"`. Only the Chinese name is used — the engine's table
 * renders Chinese too, so the overlay must speak the same vocabulary — and it is
 * passed through {@link normalizeName} so abbreviations match the engine's names.
 */
function parseDayName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const parts = value.split(',')
  // 中文名在第二段。段数不对就整条丢掉——宁可少一天，也不猜哪个是节日名。
  if (parts.length < 2) return null
  const name = (parts[1] ?? '').trim()
  return name === '' ? null : normalizeName(name)
}

/** 一份要读的日期表，`isOffDay` 表示这些日子是休还是班。 */
interface DayMap {
  value: unknown
  isOffDay: boolean
}

/**
 * Validates one chinese-days year payload into typed entries.
 *
 * 载荷形状（`chinese-days` 的 `years/<年>.json`）：
 *
 * ```json
 * {
 *   "holidays":  { "2026-01-01": "New Year's Day,元旦,1" },
 *   "workdays":  { "2026-01-04": "New Year's Day,元旦,1" },
 *   "inLieuDays":{ "2026-01-02": "New Year's Day,元旦,1" }
 * }
 * ```
 *
 * `holidays` 是放假的日子，`workdays` 是调休上班的日子（班）。`inLieuDays` 是
 * `holidays` 里属于「调休」的那部分——对当前界面没有增量信息（休/班角标只看
 * 是不是工作日），所以不读它，但上面的形状说明保留它，免得以后有人以为漏了。
 *
 * Untrusted input, so nothing throws: a payload that is not an object, or that has
 * neither a `holidays` nor a `workdays` map, yields `{ ok: false, error }` in the
 * style of `convert()`, while individual bad dates are dropped and counted.
 * A year whose two maps are both empty is *usable* and yields zero entries: the
 * arrangement may simply not be published yet (this is the real state of a year
 * before the State Council announces it).
 *
 * This function validates *parsed* JSON. Parsing belongs to the caller, so a
 * truncated body is a `JSON.parse` throw there.
 */
export function normalizeHolidayPayload(
  raw: unknown,
  expectedYear?: number
): HolidayPayloadOutcome {
  if (!isRecord(raw)) return { ok: false, error: '节假日数据必须是 JSON 对象。' }

  const maps: DayMap[] = [
    { value: raw.holidays, isOffDay: true },
    { value: raw.workdays, isOffDay: false }
  ]
  const present = maps.filter((map) => map.value !== undefined)
  if (present.length === 0) {
    return { ok: false, error: '节假日数据既没有 holidays 也没有 workdays。' }
  }
  for (const map of present) {
    if (!isRecord(map.value)) {
      return { ok: false, error: '节假日数据的 holidays / workdays 必须是对象。' }
    }
  }

  const byIso = new Map<string, HolidayEntry>()
  let dropped = 0
  let spill = 0
  /** 由日期反推的实际年份；调用方给了期望年份时以它为准（见下）。 */
  let inferredYear: number | null = null

  for (const map of present) {
    for (const [iso, rawName] of Object.entries(map.value as Record<string, unknown>)) {
      const name = parseDayName(rawName)
      const key = fromIsoDate(iso)
      if (name === null || key === null) {
        dropped += 1
        continue
      }
      // 年份由**日期**决定，不读载荷的自身声明：`chinese-days` 的按年文件里
      // 日期都落在该年，若出现别的年份那是数据有问题，按跨度规则丢掉。
      const year = expectedYear ?? key.year
      if (Math.abs(key.year - year) > MAX_YEAR_SPILL) {
        dropped += 1
        continue
      }
      if (key.year !== year) spill += 1
      inferredYear = inferredYear === null ? key.year : Math.max(inferredYear, key.year)

      const entry: HolidayEntry = { iso, name, isOffDay: map.isOffDay }
      // A repeated date means the payload contradicts itself; the later entry is
      // the newer statement, so it wins and the earlier one counts as dropped.
      if (byIso.has(iso)) dropped += 1
      byIso.set(iso, entry)
    }
  }

  const entries = [...byIso.values()].sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0))
  const year = expectedYear ?? inferredYear ?? SOLAR_YEAR_MIN
  return { ok: true, year, entries, dropped, spill }
}

/** Zero or more years' worth of overlay entries, addressed by ISO date. */
export interface HolidayOverlay {
  /** `YYYY-MM-DD` → entry. Owned by this module; treat as immutable. */
  readonly byIso: ReadonlyMap<string, HolidayEntry>
  /** Calendar years that actually contributed at least one entry, ascending. */
  readonly years: readonly number[]
  /** Entries discarded while assembling (malformed or superseded). */
  readonly dropped: number
  /** Entries accepted outside their payload's declared year. */
  readonly spill: number
}

/** An empty overlay: every date falls through to the built-in table. */
export function emptyHolidayOverlay(): HolidayOverlay {
  return { byIso: new Map(), years: [], dropped: 0, spill: 0 }
}

export interface HolidayOverlayBuild {
  overlay: HolidayOverlay
  /** One message per payload that was wholly unusable, in input order. */
  errors: string[]
}

/**
 * Merges any number of raw payloads into a single overlay.
 *
 * Callers pass one file per year (for calendar year Y that is `Y.json` and
 * `Y+1.json`, per the source's own advice). Later payloads win on a shared
 * date, because the newer announcement is the one that corrects an older one.
 * Unusable payloads are reported instead of thrown or fatal: one corrupt file
 * must not cost the user the rest of the table.
 */
export function buildHolidayOverlay(payloads: readonly unknown[]): HolidayOverlayBuild {
  const byIso = new Map<string, HolidayEntry>()
  const errors: string[] = []
  let dropped = 0
  let spill = 0

  for (const payload of payloads) {
    const outcome = normalizeHolidayPayload(payload)
    if (!outcome.ok) {
      errors.push(outcome.error)
      continue
    }
    dropped += outcome.dropped
    spill += outcome.spill
    for (const entry of outcome.entries) {
      if (byIso.has(entry.iso)) dropped += 1
      byIso.set(entry.iso, entry)
    }
  }

  // Derived from the entries, not from the declared years, so a file that only
  // spills into its neighbour still reports the year it really covers.
  const years = [...new Set([...byIso.keys()].map((iso) => Number(iso.slice(0, 4))))].sort(
    (a, b) => a - b
  )

  return { overlay: { byIso, years, dropped, spill }, errors }
}

/**
 * The one function the engine calls: overlay first, built-in table second.
 *
 * `engineHoliday` is whatever `SolarDay.getLegalHoliday()` said, which is `null`
 * past 2026-10-10. `isWork` is the **inverse** of the source's `isOffDay`,
 * because `HolidayRef` speaks in terms of workdays (真 = 班) while gov.cn speaks
 * in terms of rest days (真 = 休). The engine value is returned by reference and
 * unchanged when the overlay has nothing to say about `iso`.
 */
export function resolveHoliday(
  engineHoliday: HolidayRef | null,
  overlay: HolidayOverlay,
  iso: string
): HolidayRef | null {
  const entry = overlay.byIso.get(iso)
  if (entry === undefined) return engineHoliday
  return { name: entry.name, isWork: !entry.isOffDay }
}

/**
 * Cache invalidation.
 *
 * `buildDaySummary` / `buildDayInfo` / `buildYearInfo` memoize aggressively, so
 * a freshly installed holiday table would stay invisible until the app
 * restarted. Dropping those caches is not this module's job: importing
 * `clearDayCaches` from `day.ts` would be circular, since `day.ts` imports this
 * module. The dependency is therefore inverted — caches *subscribe* here and
 * this module knows nothing about them beyond `() => void`. A push (rather than
 * a version check on every cache read) keeps the hot path untouched and drops
 * each cache exactly once per change; `getHolidayOverlayVersion` is exposed for
 * consumers that would rather sample than subscribe.
 */
type OverlayListener = () => void

const listeners = new Set<OverlayListener>()
let activeOverlay: HolidayOverlay = emptyHolidayOverlay()
let overlayVersion = 0

/** The overlay the engine resolves against right now. */
export function getHolidayOverlay(): HolidayOverlay {
  return activeOverlay
}

/** Monotonic counter, bumped on every installed overlay. */
export function getHolidayOverlayVersion(): number {
  return overlayVersion
}

/** Installs `next` and tells every subscriber to drop its memoized results. */
export function setHolidayOverlay(next: HolidayOverlay): void {
  activeOverlay = next
  overlayVersion += 1
  for (const listener of listeners) listener()
}

/** Validates `payloads`, installs the merged overlay and returns the payload errors. */
export function installHolidayPayloads(payloads: readonly unknown[]): string[] {
  const { overlay, errors } = buildHolidayOverlay(payloads)
  setHolidayOverlay(overlay)
  return errors
}

/** Forgets every installed entry; used on a data reset and between tests. */
export function resetHolidayOverlay(): void {
  setHolidayOverlay(emptyHolidayOverlay())
}

/**
 * Decides whether a refresh deserves an error code, and which one.
 *
 * Lives here rather than in `src/main/holidays.ts` because it is pure policy with
 * no IO, and because getting it wrong produced a user-visible bug: the source has
 * no file for a year whose arrangement is not announced yet (2027 answers 404),
 * and treating *any* unreachable year as failure made the settings screen claim
 * permanently that the data could not be fetched.
 *
 * The rule: an error is worth showing only when a refresh was **materially worse
 * than doing nothing** — nothing usable came back and nothing usable was already
 * cached. One 404 among four years is normal and silent.
 *
 * `received` = years that answered with a document. `failed` = years where a
 * source genuinely errored, as opposed to simply not having the file.
 * `covered` = calendar years the assembled overlay actually has.
 * `usableCached` = whether the on-disk cache already holds something.
 */
export function decideHolidayError(input: {
  received: number
  failed: number
  covered: number
  usableCached: boolean
}): HolidayErrorCode | null {
  // We have data: a missing, unpublished or broken year among several is not
  // something to warn the user about.
  if (input.covered > 0 || input.usableCached) return null
  // Nothing to show at all. "Sources are broken" is actionable; "nothing is
  // published yet" is normal for a new year and must stay silent.
  if (input.failed > 0) return 'network'
  if (input.received > 0) return 'invalid-data'
  return null
}

/**
 * Registers a cache invalidation listener, returning its unsubscribe function.
 *
 * Listeners must not throw; they run inside `setHolidayOverlay`.
 */
export function onHolidayOverlayChange(listener: OverlayListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
