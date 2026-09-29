/**
 * 法定节假日覆盖层 (statutory-holiday overlay).
 *
 * tyme4ts ships a **frozen** copy of the State Council holiday table: it covers
 * 2001-12-29 through 2026-10-10 and then simply stops, so 2030 春节 would render
 * without a 休/班 badge. This module holds the same information as an *overlay*
 * on top of that table, sourced from `NateScarlet/holiday-cn` (MIT, CI-generated
 * from the gov.cn announcements) and refreshed at runtime.
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
import { SOLAR_YEAR_MAX, SOLAR_YEAR_MIN, fromIsoDate } from './date-key'
import type { HolidayRef } from './types'

/** One validated rest/work day, as published by holiday-cn. */
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
 * How far a date may sit from the payload's declared year.
 *
 * holiday-cn keys a file by the *document title year*, not by the dates' year,
 * and its README tells consumers to consult two files because
 * 「12 月份的日期可能会被下一年的文件影响」. Observed for real: `2019.json` carries
 * 2018-12-29/30/31 (the 2019 元旦 arrangement) and `2023.json` carries
 * 2022-12-31. So the tolerated window is the declared year plus its two direct
 * neighbours — wide enough that no genuine December/January date is ever
 * discarded, narrow enough that a date two years out is still treated as
 * corruption. Entries accepted outside the declared year are reported via
 * `spill` so the tolerance stays auditable rather than silent.
 */
const MAX_YEAR_SPILL = 1

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A plausible `year` field: an integer the calendar can actually represent. */
function isSaneYear(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= SOLAR_YEAR_MIN &&
    value <= SOLAR_YEAR_MAX
  )
}

interface ParsedDay {
  entry: HolidayEntry
  /** Calendar year of `entry.iso`, which may differ from the payload's `year`. */
  dateYear: number
}

/**
 * Reads one `days` element, returning `null` for anything malformed.
 *
 * Deliberately total: an untrusted payload must never be able to throw, and an
 * unknown extra field (the source emits `$schema`, `$id`, `papers`) is ignored
 * rather than treated as a reason to reject the entry.
 */
function parseDay(value: unknown, year: number): ParsedDay | null {
  if (!isRecord(value)) return null

  const name = value.name
  if (typeof name !== 'string' || name.trim() === '') return null

  // Strict: `'true'` / `1` are not booleans, and guessing here would silently
  // invert a 休 day into a 班 day.
  if (typeof value.isOffDay !== 'boolean') return null

  const iso = value.date
  if (typeof iso !== 'string') return null
  // `fromIsoDate` owns the format: `YYYY-MM-DD`, a real calendar day and inside
  // the engine's 1–9999 range (1582-10-05 … 10-14 included, which never existed).
  const key = fromIsoDate(iso)
  if (key === null) return null
  if (Math.abs(key.year - year) > MAX_YEAR_SPILL) return null

  return { entry: { iso, name: name.trim(), isOffDay: value.isOffDay }, dateYear: key.year }
}

/**
 * Validates one holiday-cn payload into typed entries.
 *
 * Untrusted input, so nothing throws: a wholly unusable payload (not an object,
 * a bad `year`, a missing `days` array — i.e. a truncated download) yields
 * `{ ok: false, error }` in the style of `convert()`, while individual bad
 * `days` elements are dropped and counted. A payload with an empty `days` array
 * is *usable* and yields zero entries: as of 2026-09-29 the real `2027.json` is
 * exactly that, because the 2027 arrangement has not been announced yet.
 *
 * This function validates *parsed* JSON. Parsing belongs to the caller (so a
 * truncated body is a `JSON.parse` throw there); a raw string handed in here is
 * simply an unusable payload.
 */
export function normalizeHolidayPayload(raw: unknown): HolidayPayloadOutcome {
  if (!isRecord(raw)) return { ok: false, error: '节假日数据必须是 JSON 对象。' }

  const year = raw.year
  if (!isSaneYear(year)) {
    return { ok: false, error: `节假日数据的 year 字段不是合法年份：${String(year)}` }
  }

  const days = raw.days
  if (!Array.isArray(days)) return { ok: false, error: '节假日数据的 days 字段必须是数组。' }

  const byIso = new Map<string, HolidayEntry>()
  let dropped = 0
  let spill = 0

  for (const day of days) {
    const parsed = parseDay(day, year)
    if (parsed === null) {
      dropped += 1
      continue
    }
    if (parsed.dateYear !== year) spill += 1
    // A repeated date means the payload contradicts itself; the later entry is
    // the newer statement, so it wins and the earlier one counts as dropped.
    if (byIso.has(parsed.entry.iso)) dropped += 1
    byIso.set(parsed.entry.iso, parsed.entry)
  }

  const entries = [...byIso.values()].sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0))
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
