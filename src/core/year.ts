import { createLruCache } from './cache'
import {
  addDays,
  daysInMonth,
  daysInYear,
  isValidDateKey,
  toIsoDate,
  type DateKey
} from './date-key'
import { buildDaySummary } from './day'
import { onHolidayOverlayChange } from './holiday-overlay'
import { monthGridShape } from './month'
import type { DaySummary, MonthGridOptions } from './types'

/** A year view costs ~370 summaries; caching the result keeps paging smooth. */
const yearCache = createLruCache<YearInfo>(8)

export interface YearTermEntry {
  month: number
  day: number
  name: string
}

export interface YearFestivalEntry {
  month: number
  day: number
  names: string[]
}

export interface YearHolidayEntry {
  month: number
  day: number
  name: string
  isWork: boolean
}

export interface YearMonth {
  month: number
  rows: number
  /** Row-major cells, seven per row; `null` outside the representable range. */
  cells: Array<DaySummary | null>
}

export interface YearInfo {
  year: number
  /** 0 = Sunday first, 1 = Monday first */
  weekStart: number
  /** Days actually in the year — 355 for 1582, because of the Gregorian reform. */
  dayCount: number
  months: YearMonth[]
  terms: YearTermEntry[]
  festivals: YearFestivalEntry[]
  holidays: YearHolidayEntry[]
}

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const

/**
 * Builds a whole year: twelve month grids plus the year's terms, festivals and
 * statutory holidays.
 *
 * The twelve grids overlap their neighbours, so instead of resolving days month
 * by month (which would repeat work) this walks the covered span once and hands
 * each month a slice of the shared map. That also means the same date is one
 * shared object in every month it appears in.
 */
export function buildYearInfo(year: number, options: MonthGridOptions = {}): YearInfo {
  const weekStartsOnMonday = options.weekStartsOnMonday === true
  const cacheKey = `${year}:${weekStartsOnMonday ? 1 : 0}`
  const cached = yearCache.get(cacheKey)
  if (cached !== undefined) return cached

  const built = buildYearInfoUncached(year, weekStartsOnMonday)
  yearCache.set(cacheKey, built)
  return built
}

function buildYearInfoUncached(year: number, weekStartsOnMonday: boolean): YearInfo {
  const shapes = MONTHS.map((month) => monthGridShape(year, month, weekStartsOnMonday))

  const first = shapes[0]
  const last = shapes[11]
  if (!first || !last) throw new RangeError(`solar year out of range: ${year}`)

  // Cells from the first cell of January's grid through the last cell of
  // December's grid. 1582 is short by ten days, hence `daysInYear`.
  const trailing = last.rows * 7 - last.leading - daysInMonth(year, 12)
  const totalCells = first.leading + daysInYear(year) + trailing

  const byIso = new Map<string, DaySummary>()
  const terms: YearTermEntry[] = []
  const festivals: YearFestivalEntry[] = []
  const holidays: YearHolidayEntry[] = []
  let dayCount = 0

  for (let index = 0; index < totalCells; index += 1) {
    const key = addDays(first.gridStart, index)
    if (!isValidDateKey(key)) continue
    const summary = buildDaySummary(key)
    byIso.set(summary.iso, summary)

    if (key.year !== year) continue
    dayCount += 1

    if (summary.term) terms.push({ month: key.month, day: key.day, name: summary.term.name })
    if (summary.festivals.length > 0) {
      festivals.push({
        month: key.month,
        day: key.day,
        names: summary.festivals.map((festival) => festival.name)
      })
    }
    if (summary.holiday) {
      holidays.push({
        month: key.month,
        day: key.day,
        name: summary.holiday.name,
        isWork: summary.holiday.isWork
      })
    }
  }

  const months: YearMonth[] = shapes.map((shape) => {
    const cells: Array<DaySummary | null> = []
    for (let index = 0; index < shape.rows * 7; index += 1) {
      const key = addDays(shape.gridStart, index)
      cells.push(isValidDateKey(key) ? (byIso.get(toIsoDate(key)) ?? null) : null)
    }
    return { month: shape.month, rows: shape.rows, cells }
  })

  return {
    year,
    weekStart: weekStartsOnMonday ? 1 : 0,
    dayCount,
    months,
    terms,
    festivals,
    holidays
  }
}

/**
 * A contiguous run of dates, built in one walk.
 *
 * The timeline needs tens of thousands of day keys; stepping each one from the
 * anchor independently would be quadratic, so the run is materialized once.
 */
export function buildDayRange(start: DateKey, count: number): DateKey[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`day range count must be a non-negative integer, received ${count}`)
  }
  const keys: DateKey[] = []
  let cursor = start
  for (let index = 0; index < count; index += 1) {
    keys.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return keys
}

/** Drops memoized years; used by tests that want a cold path. */
export function clearYearCache(): void {
  yearCache.clear()
}

// A year's `holidays` list is a projection of the day summaries it cached, so a
// new holiday overlay must drop it too (see `holiday-overlay.ts`).
onHolidayOverlayChange(clearYearCache)
