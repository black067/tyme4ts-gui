import {
  SOLAR_YEAR_MAX,
  SOLAR_YEAR_MIN,
  addDays,
  daysInMonth,
  isValidDateKey,
  weekDayIndex,
  type DateKey
} from './date-key'
import { buildDaySummary } from './day'
import type { DaySummary, MonthGrid, MonthGridOptions } from './types'

/** The week layout of a month, independent of the data inside its cells. */
export interface MonthGridShape {
  year: number
  month: number
  /** 0 = Sunday first, 1 = Monday first */
  weekStart: number
  /** Cells before the 1st of the month, borrowed from the previous month. */
  leading: number
  rows: number
  /** Key of the very first cell, which may belong to the previous month. */
  gridStart: DateKey
}

function assertYear(year: number): void {
  if (!Number.isInteger(year) || year < SOLAR_YEAR_MIN || year > SOLAR_YEAR_MAX) {
    throw new RangeError(`solar year out of range: ${year}`)
  }
}

function assertMonth(month: number): void {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`month out of range: ${month}`)
  }
}

/**
 * Computes where a month's weeks start and how many there are.
 *
 * This uses our own pure day arithmetic rather than tyme4ts's
 * `SolarMonth.getWeeks`, because that helper throws for months whose
 * surrounding week spills past year 1 or year 9999.
 */
export function monthGridShape(
  year: number,
  month: number,
  weekStartsOnMonday = false
): MonthGridShape {
  assertYear(year)
  assertMonth(month)

  const weekStart = weekStartsOnMonday ? 1 : 0
  const firstKey: DateKey = { year, month, day: 1 }
  const leading = (weekDayIndex(firstKey) - weekStart + 7) % 7

  return {
    year,
    month,
    weekStart,
    leading,
    rows: Math.ceil((leading + daysInMonth(year, month)) / 7),
    gridStart: addDays(firstKey, -leading)
  }
}

/**
 * Builds a month grid of whole weeks.
 *
 * Cells whose date falls outside tyme4ts's representable range (before year 1
 * or after year 9999) become `null`, so the far ends of the calendar degrade
 * instead of crashing.
 */
export function buildMonthGrid(
  year: number,
  month: number,
  options: MonthGridOptions = {}
): MonthGrid {
  const shape = monthGridShape(year, month, options.weekStartsOnMonday === true)

  const cells: Array<DaySummary | null> = []
  for (let index = 0; index < shape.rows * 7; index += 1) {
    const key = addDays(shape.gridStart, index)
    cells.push(isValidDateKey(key) ? buildDaySummary(key) : null)
  }

  return { year, month, weekStart: shape.weekStart, rows: shape.rows, cells }
}

/** The first and last day of the month, for range queries and labels. */
export function monthBounds(year: number, month: number): { first: DateKey; last: DateKey } {
  assertMonth(month)
  return {
    first: { year, month, day: 1 },
    last: { year, month, day: daysInMonth(year, month) }
  }
}
