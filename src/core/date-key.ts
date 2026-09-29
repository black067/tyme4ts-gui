import { SolarDay } from 'tyme4ts'

/** A calendar day addressed by the proleptic Gregorian fields tyme4ts expects. */
export interface DateKey {
  year: number
  month: number
  day: number
}

/** tyme4ts rejects solar years outside `[1, 9999]`. */
export const SOLAR_YEAR_MIN = 1
export const SOLAR_YEAR_MAX = 9999

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Leap-year rule used by tyme4ts: Julian up to 1600, Gregorian from then on.
 * Mirrored here so our validation agrees with the engine's.
 */
export function isLeapYear(year: number): boolean {
  if (year < 1600) return year % 4 === 0
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12) return 0
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return lengths[month - 1] ?? 0
}

/**
 * True when `key` is a real date inside tyme4ts's supported range. `SolarDay`
 * throws for illegal dates, so every entry point validates before converting.
 */
export function isValidDateKey(key: DateKey): boolean {
  const { year, month, day } = key
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false
  if (year < SOLAR_YEAR_MIN || year > SOLAR_YEAR_MAX) return false
  if (!Number.isInteger(month) || month < 1 || month > 12) return false
  if (!Number.isInteger(day) || day < 1 || day > daysInMonth(year, month)) return false
  // 1582-10-05 .. 1582-10-14 never happened: the Gregorian calendar skipped them.
  return !(year === 1582 && month === 10 && day >= 5 && day <= 14)
}

/** Canonical `YYYY-MM-DD`, usable as a map key and as the persisted date form. */
export function toIsoDate(key: DateKey): string {
  return `${String(key.year).padStart(4, '0')}-${String(key.month).padStart(2, '0')}-${String(
    key.day
  ).padStart(2, '0')}`
}

/** Parses `YYYY-MM-DD`, returning `null` for anything invalid or out of range. */
export function fromIsoDate(iso: string): DateKey | null {
  const match = ISO_DATE.exec(iso)
  if (!match) return null
  const key: DateKey = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  }
  return isValidDateKey(key) ? key : null
}

export function compareDateKey(a: DateKey, b: DateKey): number {
  if (a.year !== b.year) return a.year < b.year ? -1 : 1
  if (a.month !== b.month) return a.month < b.month ? -1 : 1
  if (a.day !== b.day) return a.day < b.day ? -1 : 1
  return 0
}

export function dateKeyEquals(a: DateKey, b: DateKey): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day
}

/**
 * The day after `key`, mirroring tyme4ts's own stepping.
 *
 * The 1582-10-04 → 1582-10-15 jump is deliberate: the Gregorian reform removed
 * those ten days, so they are never produced. No range validation happens here
 * — callers use `isValidDateKey` to decide whether the result is representable.
 */
export function nextDay(key: DateKey): DateKey {
  if (key.year === 1582 && key.month === 10 && key.day === 4) {
    return { year: 1582, month: 10, day: 15 }
  }
  if (key.day < daysInMonth(key.year, key.month)) {
    return { year: key.year, month: key.month, day: key.day + 1 }
  }
  if (key.month < 12) {
    return { year: key.year, month: key.month + 1, day: 1 }
  }
  return { year: key.year + 1, month: 1, day: 1 }
}

/** The day before `key`; the inverse of {@link nextDay}, reform gap included. */
export function prevDay(key: DateKey): DateKey {
  if (key.year === 1582 && key.month === 10 && key.day === 15) {
    return { year: 1582, month: 10, day: 4 }
  }
  if (key.day > 1) {
    return { year: key.year, month: key.month, day: key.day - 1 }
  }
  if (key.month > 1) {
    const month = key.month - 1
    return { year: key.year, month, day: daysInMonth(key.year, month) }
  }
  return { year: key.year - 1, month: 12, day: 31 }
}

/** Steps `delta` days from `key` (negative steps backwards). */
export function addDays(key: DateKey, delta: number): DateKey {
  let cursor = key
  for (let i = 0; i < Math.abs(delta); i += 1) {
    cursor = delta < 0 ? prevDay(cursor) : nextDay(cursor)
  }
  return cursor
}

/** The local calendar day of the machine clock. */
export function todayKey(now: Date = new Date()): DateKey {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }
}

/**
 * Canonical Chinese rendering, e.g. `2024年2月10日`.
 * Throws only if `key` was not validated first — callers must use `isValidDateKey`.
 */
export function formatSolarDate(key: DateKey): string {
  return SolarDay.fromYmd(key.year, key.month, key.day).toString()
}

/** 1 = Sunday … 6 = Saturday, matching tyme4ts's `Week.getIndex()`. */
export function weekDayIndex(key: DateKey): number {
  return SolarDay.fromYmd(key.year, key.month, key.day).getWeek().getIndex()
}
