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
  addMonths,
  compareDateKey,
  dateKeyEquals,
  daysInMonth,
  daysInYear,
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

export {
  buildHolidayOverlay,
  emptyHolidayOverlay,
  getHolidayOverlay,
  getHolidayOverlayVersion,
  installHolidayPayloads,
  normalizeHolidayPayload,
  onHolidayOverlayChange,
  resetHolidayOverlay,
  resolveHoliday,
  setHolidayOverlay,
  type HolidayEntry,
  type HolidayOverlay,
  type HolidayOverlayBuild,
  type HolidayPayloadOutcome
} from './holiday-overlay'

export { buildMonthGrid, monthBounds, monthGridShape, type MonthGridShape } from './month'

export {
  RAB_BYUNG_MAX_YEAR,
  RAB_BYUNG_MIN_YEAR,
  convert,
  type CalendarInput,
  type CalendarKind,
  type ConversionOutcome,
  type ConversionResult
} from './convert'

export {
  PORTABLE_ASSET_PATTERN,
  compareVersions,
  isNewerVersion,
  parseReleases,
  selectLatestPortableRelease,
  selectPortableAsset,
  type GitHubAsset,
  type GitHubRelease,
  type PortableAssetOptions,
  type PortableAssetSelection,
  type ReleasesOutcome,
  type SelectionOutcome
} from './update'

export {
  SEARCH_DEFAULT_LIMIT,
  SEARCH_MAX_DAYS,
  searchDays,
  searchSpanDays,
  type SearchFilter,
  type SearchHit,
  type SearchResult
} from './search'

export {
  ALL_TABOO_ITEMS,
  COMMON_AVOID_ITEMS,
  COMMON_TABOO_ITEMS,
  SOLAR_TERM_NAMES
} from './vocabulary'

export {
  GLOSSARY,
  GLOSSARY_FAMILIES,
  lookupTerm,
  type GlossaryBasis,
  type GlossaryEntry,
  type GlossaryFamily,
  type GlossaryFamilyData,
  type GlossaryGapNote,
  type TermLookup
} from './glossary'

export {
  buildEightChar,
  type ChildLimitInfo,
  type DecadeEntry,
  type EightCharInput,
  type EightCharResult,
  type FortuneEntry,
  type HiddenStem,
  type PersonGender,
  type PillarInfo
} from './pillars'

export {
  buildDayRange,
  buildYearInfo,
  clearYearCache,
  type YearFestivalEntry,
  type YearHolidayEntry,
  type YearInfo,
  type YearMonth,
  type YearTermEntry
} from './year'

export {
  WEEKDAY_LABELS,
  dayCellText,
  describeDay,
  formatFullDate,
  formatMonthTitle,
  weekDayLabel,
  weekdayOrder,
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
