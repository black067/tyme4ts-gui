/**
 * Public facade of the calendar engine.
 *
 * The renderer imports **only** from `@core`. Everything exported here is a
 * plain, JSON-serializable value — tyme4ts class instances never leak out, so
 * the engine can later move into a worker or the main process unchanged.
 */

export type { DateKey } from './date-key'

export {
  SOLAR_YEAR_MAX,
  SOLAR_YEAR_MIN,
  addDays,
  compareDateKey,
  dateKeyEquals,
  daysInMonth,
  formatSolarDate,
  fromIsoDate,
  isLeapYear,
  isValidDateKey,
  nextDay,
  prevDay,
  todayKey,
  toIsoDate,
  weekDayIndex
} from './date-key'

export { createLruCache, type LruCache } from './cache'

export { buildDayInfo, buildDaySummary, clearDayCaches } from './day'

export { buildMonthGrid, monthBounds } from './month'

export {
  WEEKDAY_LABELS,
  dayCellText,
  formatFullDate,
  formatMonthTitle,
  weekDayLabel,
  type DayCellText,
  type DayCellTone
} from './format'

export type {
  DayInfo,
  DaySummary,
  FestivalKind,
  FestivalRef,
  GanzhiInfo,
  GodInfo,
  HolidayRef,
  LunarInfo,
  MonthGrid,
  MonthGridOptions,
  StarInfo,
  TermInfo
} from './types'
