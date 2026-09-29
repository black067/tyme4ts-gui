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

/**
 * Builds a month grid of whole weeks.
 *
 * The cell layout is computed with our own pure day arithmetic rather than
 * tyme4ts's `SolarMonth.getWeeks`, because that helper throws for months whose
 * surrounding week spills past year 1 or year 9999. Here those cells simply
 * become `null`, so the far ends of the calendar degrade instead of crashing.
 */
export function buildMonthGrid(
  year: number,
  month: number,
  options: MonthGridOptions = {}
): MonthGrid {
  if (!Number.isInteger(year) || year < SOLAR_YEAR_MIN || year > SOLAR_YEAR_MAX) {
    throw new RangeError(`solar year out of range: ${year}`)
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`month out of range: ${month}`)
  }

  const weekStart = options.weekStartsOnMonday === true ? 1 : 0
  const firstKey: DateKey = { year, month, day: 1 }
  const leading = (weekDayIndex(firstKey) - weekStart + 7) % 7
  const rows = Math.ceil((leading + daysInMonth(year, month)) / 7)
  const gridStart = addDays(firstKey, -leading)

  const cells: Array<DaySummary | null> = []
  for (let index = 0; index < rows * 7; index += 1) {
    const key = addDays(gridStart, index)
    cells.push(isValidDateKey(key) ? buildDaySummary(key) : null)
  }

  return { year, month, weekStart, rows, cells }
}

/** The first and last day of the month, for range queries and labels. */
export function monthBounds(year: number, month: number): { first: DateKey; last: DateKey } {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`month out of range: ${month}`)
  }
  return {
    first: { year, month, day: 1 },
    last: { year, month, day: daysInMonth(year, month) }
  }
}
