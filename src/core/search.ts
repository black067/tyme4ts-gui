import { addDays, compareDateKey, isValidDateKey, type DateKey } from './date-key'
import { buildDayInfo, buildDaySummary } from './day'
import type { DayInfo, DaySummary, FestivalRef, HolidayRef, LunarInfo, TermInfo } from './types'

/**
 * Criteria for 择日 / range search.
 *
 * The list criteria differ deliberately:
 * - `recommends` / `avoids` use AND — choosing 嫁娶 + 祭祀 means "both are advised".
 * - `terms` / `festivals` / `ganzhiDays` use OR — choosing 立春 + 春分 means
 *   "either of these days".
 * An empty or omitted list means "do not filter on this".
 */
export interface SearchFilter {
  from: DateKey
  to: DateKey
  recommends?: readonly string[]
  avoids?: readonly string[]
  terms?: readonly string[]
  festivals?: readonly string[]
  ganzhiDays?: readonly string[]
  /** Only statutory rest days (休). */
  restDaysOnly?: boolean
  /** Drop statutory makeup workdays (班). */
  excludeMakeupDays?: boolean
  weekendsOnly?: boolean
}

export interface SearchHit {
  key: DateKey
  iso: string
  weekDay: number
  lunar: LunarInfo
  term: TermInfo | null
  festivals: FestivalRef[]
  holiday: HolidayRef | null
  recommends: string[] | null
  avoids: string[] | null
  ganzhiDay: string | null
}

export interface SearchResult {
  hits: SearchHit[]
  scannedDays: number
  /** True when the requested range was longer than the cap and got clipped. */
  rangeClipped: boolean
  /** True when the scan stopped because it collected `limit` hits. */
  limitReached: boolean
}

/** A range scan resolves a full almanac per day, so the span is bounded. */
export const SEARCH_MAX_DAYS = 366
export const SEARCH_DEFAULT_LIMIT = 200

function includesAll(haystack: readonly string[], needles: readonly string[]): boolean {
  return needles.every((needle) => haystack.includes(needle))
}

function includesAny(haystack: readonly string[], needles: readonly string[]): boolean {
  return needles.some((needle) => haystack.includes(needle))
}

/** How many days the range covers, clipped to the cap. */
export function searchSpanDays(filter: SearchFilter): { days: number; clipped: boolean } {
  if (compareDateKey(filter.from, filter.to) > 0) return { days: 0, clipped: false }
  let days = 0
  let cursor = filter.from
  while (compareDateKey(cursor, filter.to) <= 0 && days < SEARCH_MAX_DAYS) {
    days += 1
    cursor = addDays(cursor, 1)
  }
  const clipped = days >= SEARCH_MAX_DAYS && compareDateKey(cursor, filter.to) <= 0
  return { days, clipped }
}

/** True when the filter needs the full almanac rather than just a summary. */
function needsAlmanac(filter: SearchFilter): boolean {
  return (
    (filter.recommends?.length ?? 0) > 0 ||
    (filter.avoids?.length ?? 0) > 0 ||
    (filter.ganzhiDays?.length ?? 0) > 0
  )
}

function matchesSummary(summary: DaySummary, filter: SearchFilter): boolean {
  if (filter.terms && filter.terms.length > 0) {
    if (!summary.term || !filter.terms.includes(summary.term.name)) return false
  }
  if (filter.festivals && filter.festivals.length > 0) {
    const names = summary.festivals.map((festival) => festival.name)
    if (!includesAny(names, filter.festivals)) return false
  }
  if (filter.weekendsOnly === true && !summary.isWeekend) return false
  if (filter.restDaysOnly === true && summary.holiday?.isWork !== false) return false
  if (filter.excludeMakeupDays === true && summary.holiday?.isWork === true) return false
  return true
}

function matchesAlmanac(info: DayInfo, filter: SearchFilter, summaryOk: boolean): boolean {
  if (!summaryOk) return false
  if (filter.recommends && filter.recommends.length > 0) {
    if (info.recommends === null || !includesAll(info.recommends, filter.recommends)) return false
  }
  if (filter.avoids && filter.avoids.length > 0) {
    if (info.avoids === null || !includesAll(info.avoids, filter.avoids)) return false
  }
  if (filter.ganzhiDays && filter.ganzhiDays.length > 0) {
    if (info.ganzhi === null || !filter.ganzhiDays.includes(info.ganzhi.day)) return false
  }
  return true
}

function toHit(summary: DaySummary, info: DayInfo | null): SearchHit {
  return {
    key: summary.key,
    iso: summary.iso,
    weekDay: summary.weekDay,
    lunar: summary.lunar,
    term: summary.term,
    festivals: summary.festivals,
    holiday: summary.holiday,
    recommends: info?.recommends ?? null,
    avoids: info?.avoids ?? null,
    ganzhiDay: info?.ganzhi?.day ?? null
  }
}

/**
 * Scans a date range for days matching the filter.
 *
 * Synchronous by design: the caller decides how to schedule it (the tool page
 * defers it by a tick so the loading state can paint). The span is capped at
 * {@link SEARCH_MAX_DAYS} because each day resolves a full almanac.
 */
export function searchDays(
  filter: SearchFilter,
  limit: number = SEARCH_DEFAULT_LIMIT
): SearchResult {
  if (compareDateKey(filter.from, filter.to) > 0) {
    return { hits: [], scannedDays: 0, rangeClipped: false, limitReached: false }
  }

  const { days, clipped } = searchSpanDays(filter)
  const wantAlmanac = needsAlmanac(filter)
  const hits: SearchHit[] = []
  let scannedDays = 0
  let cursor = filter.from

  for (let index = 0; index < days; index += 1) {
    if (!isValidDateKey(cursor)) {
      cursor = addDays(cursor, 1)
      continue
    }

    const summary = buildDaySummary(cursor)
    scannedDays += 1

    if (matchesSummary(summary, filter)) {
      if (wantAlmanac) {
        const info = buildDayInfo(cursor)
        if (matchesAlmanac(info, filter, true)) hits.push(toHit(summary, info))
      } else {
        hits.push(toHit(summary, null))
      }
    }

    if (hits.length >= limit) {
      return { hits, scannedDays, rangeClipped: clipped, limitReached: true }
    }

    cursor = addDays(cursor, 1)
  }

  return { hits, scannedDays, rangeClipped: clipped, limitReached: false }
}
