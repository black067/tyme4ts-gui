/**
 * Public facade of the calendar engine.
 *
 * The renderer imports **only** from `@core`. Everything exported here is a
 * plain, JSON-serializable value — tyme4ts class instances never leak out, so
 * the engine can later move into a worker or the main process unchanged.
 */
export type { DateKey } from './date-key'

export {
  SOLAR_YEAR_MIN,
  SOLAR_YEAR_MAX,
  compareDateKey,
  dateKeyEquals,
  daysInMonth,
  formatSolarDate,
  fromIsoDate,
  isLeapYear,
  isValidDateKey,
  todayKey,
  toIsoDate,
  weekDayIndex
} from './date-key'
