import type { DateKey } from './date-key'

/**
 * Serializable data contracts of the calendar engine.
 *
 * Everything here is plain JSON-safe data: no tyme4ts classes, no class
 * instances, no functions. That keeps the engine swappable, snapshot-testable
 * and movable into a worker or the main process later without touching callers.
 * Treat every value the engine returns as immutable.
 */

export type FestivalKind = 'solar' | 'lunar'

export interface FestivalRef {
  kind: FestivalKind
  name: string
}

/** A statutory holiday entry. `isWork` true means 调休上班 (班), false means 休息 (休). */
export interface HolidayRef {
  name: string
  isWork: boolean
}

export interface LunarInfo {
  /** 正月 / 五月 / 闰四月 */
  monthName: string
  /** 初一 / 廿一 */
  dayName: string
  isLeap: boolean
  /** 春节换年口径的干支纪年，如 甲辰 */
  yearGanZhi: string
  zodiac: string
  /** 完整农历描述，如 农历甲辰年正月初一 */
  full: string
}

export interface TermInfo {
  /** 当日节气名，如 立春 */
  name: string
}

/** Cheap per-day projection used by the month grid and the year overview. */
export interface DaySummary {
  key: DateKey
  /** `YYYY-MM-DD`, suitable as a React key or cache key. */
  iso: string
  /** 0 = Sunday … 6 = Saturday */
  weekDay: number
  /** 一 / 二 / … / 日 */
  weekName: string
  isWeekend: boolean
  lunar: LunarInfo
  /** Present only when this very day is a solar term day. */
  term: TermInfo | null
  festivals: FestivalRef[]
  holiday: HolidayRef | null
}

export interface StarInfo {
  name: string
  /** 吉 / 凶 */
  luck: string
  zone: string
  beast: string
  sevenStar: string
  animal: string
  land: string
  direction: string
}

/**
 * 吉神 / 凶煞。
 *
 * `luck` 是**结构化**的取值而非引擎里的「吉/凶」字面量：界面要按吉凶分组，
 * 而按渲染文本分组会在文案本地化后静默失效。显示用哪个字由界面决定。
 */
export interface GodInfo {
  name: string
  luck: 'good' | 'bad'
}

export interface GanzhiInfo {
  /** 节气月柱口径的四柱干支 */
  year: string
  month: string
  day: string
  /** 日柱纳音，如 覆灯火 */
  daySound: string
  /** 日天干五行，如 木 */
  dayElement: string
  /** 彭祖百忌 */
  pengZu: string
}

/**
 * Full almanac projection for a single day. Built on demand, not per grid cell.
 *
 * tyme4ts throws for several of these accessors near the edges of its range
 * (year 1, year 2, year 9999) and for the whole Tibetan calendar outside its
 * own bounds. Each field therefore degrades to `null` independently, and the UI
 * renders only what is available. `null` means "not derivable", while an empty
 * array means "derived, and there is none".
 */
export interface DayInfo extends DaySummary {
  ganzhi: GanzhiInfo | null
  constellation: string | null
  /** 月相：新月 / 上弦月 … */
  phase: string | null
  /** 建除十二神 */
  duty: string | null
  twelveStar: string | null
  sixStar: string | null
  minorRen: string | null
  nineStar: string | null
  fetus: string | null
  twentyEightStar: StarInfo | null
  gods: GodInfo[] | null
  recommends: string[] | null
  avoids: string[] | null
  /** 当前节气及其天数（节气当日为 0），如 { name: '立春', dayIndex: 3 } */
  currentTerm: { name: string; dayIndex: number } | null
  phenology: string | null
  dogDay: string | null
  nineDay: string | null
  plumRainDay: string | null
}

export interface MonthGrid {
  year: number
  month: number
  /** 0 = Sunday first, 1 = Monday first */
  weekStart: number
  rows: number
  /**
   * Row-major cells, seven per row. A `null` cell marks a date outside
   * tyme4ts's representable range (before year 1 or after year 9999).
   */
  cells: Array<DaySummary | null>
}

export interface MonthGridOptions {
  /** Monday-first grid (default: Sunday first). */
  weekStartsOnMonday?: boolean
}
