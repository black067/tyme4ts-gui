import { SolarDay, type LunarDay } from 'tyme4ts'
import { createLruCache } from './cache'
import { isValidDateKey, toIsoDate, type DateKey } from './date-key'
import type {
  DayInfo,
  DaySummary,
  FestivalRef,
  GanzhiInfo,
  GodInfo,
  HolidayRef,
  LunarInfo,
  StarInfo,
  TermInfo
} from './types'

/** Grid navigation re-reads the same days constantly, so summaries are memoized. */
const summaryCache = createLruCache<DaySummary>(4096)
/** The full almanac is heavier and only ever needed for the focused day. */
const infoCache = createLruCache<DayInfo>(64)

function solarDayOf(key: DateKey): SolarDay {
  return SolarDay.fromYmd(key.year, key.month, key.day)
}

function assertValid(key: DateKey): void {
  if (!isValidDateKey(key)) {
    throw new RangeError(
      `date outside tyme4ts's representable range: ${key.year}-${key.month}-${key.day}`
    )
  }
}

/**
 * Runs a tyme4ts accessor that is allowed to be unavailable.
 *
 * tyme4ts throws rather than returning empty for several day-level accessors
 * near the edges of its range (year 1, year 2 and year 9999 — plus the Tibetan
 * calendar's own narrower bounds). A calendar must still render there, so each
 * fragile field degrades to `null` on its own instead of failing the whole day.
 */
function safe<T>(read: () => T): T | null {
  try {
    return read()
  } catch {
    return null
  }
}

function toLunarInfo(lunar: LunarDay): LunarInfo {
  const month = lunar.getLunarMonth()
  // The lunar year cycle rolls over at 春节, unlike `getYearSixtyCycle()` which
  // is the solar-term (立春) based cycle used by the almanac pillars below.
  const yearCycle = month.getLunarYear().getSixtyCycle()
  return {
    monthName: month.getName(),
    dayName: lunar.getName(),
    isLeap: month.isLeap(),
    yearGanZhi: yearCycle.getName(),
    zodiac: yearCycle.getEarthBranch().getZodiac().getName(),
    full: lunar.toString()
  }
}

/**
 * tyme4ts exposes exactly one solar and one lunar festival per day, so a day
 * that is both (e.g. 国庆 + 中秋) yields two entries.
 */
function collectFestivals(solar: SolarDay, lunar: LunarDay): FestivalRef[] {
  const solarFestival = safe(() => solar.getFestival())
  const lunarFestival = safe(() => lunar.getFestival())
  const festivals: FestivalRef[] = []
  if (solarFestival) festivals.push({ kind: 'solar', name: solarFestival.getName() })
  if (lunarFestival && !festivals.some((f) => f.name === lunarFestival.getName())) {
    festivals.push({ kind: 'lunar', name: lunarFestival.getName() })
  }
  return festivals
}

function readHoliday(solar: SolarDay): HolidayRef | null {
  return (
    safe(() => {
      const holiday = solar.getLegalHoliday()
      return holiday ? { name: holiday.getName(), isWork: holiday.isWork() } : null
    }) ?? null
  )
}

function readTerm(solar: SolarDay): TermInfo | null {
  return (
    safe(() => {
      const termDay = solar.getTermDay()
      return termDay.getDayIndex() === 0 ? { name: termDay.getSolarTerm().getName() } : null
    }) ?? null
  )
}

function buildSummary(key: DateKey): DaySummary {
  const solar = solarDayOf(key)
  const lunar = solar.getLunarDay()
  const week = solar.getWeek()
  const weekDay = week.getIndex()

  return {
    key,
    iso: toIsoDate(key),
    weekDay,
    weekName: week.getName(),
    isWeekend: weekDay === 0 || weekDay === 6,
    lunar: toLunarInfo(lunar),
    term: readTerm(solar),
    festivals: collectFestivals(solar, lunar),
    holiday: readHoliday(solar)
  }
}

function buildGanzhi(solar: SolarDay): GanzhiInfo | null {
  return safe(() => {
    // The almanac pillar convention is solar-term based, which is what
    // SixtyCycleDay models (unlike LunarDay's 春节-based month pillar).
    const cycleDay = solar.getSixtyCycleDay()
    const dayCycle = cycleDay.getSixtyCycle()
    return {
      year: cycleDay.getYear().getName(),
      month: cycleDay.getMonth().getName(),
      day: dayCycle.getName(),
      daySound: dayCycle.getSound().getName(),
      dayElement: dayCycle.getHeavenStem().getElement().getName(),
      pengZu: dayCycle.getPengZu().getName()
    }
  })
}

function buildStar(solar: SolarDay): StarInfo | null {
  return safe(() => {
    const star = solar.getLunarDay().getTwentyEightStar()
    return {
      name: star.getName(),
      luck: star.getLuck().getName(),
      zone: star.getZone().getName(),
      beast: star.getZone().getBeast().getName(),
      sevenStar: star.getSevenStar().getName(),
      animal: star.getAnimal().getName(),
      land: star.getLand().getName(),
      direction: star.getLand().getDirection().getName()
    }
  })
}

function buildInfo(key: DateKey): DayInfo {
  const summary = buildSummary(key)
  const solar = solarDayOf(key)
  const lunar = solar.getLunarDay()

  const gods: GodInfo[] | null =
    safe(() =>
      lunar.getGods().map((god) => ({
        name: god.getName(),
        luck: god.getLuck().getName()
      }))
    ) ?? null

  const names = (read: (day: LunarDay) => Array<{ getName(): string }>): string[] | null =>
    safe(() => read(lunar).map((item) => item.getName())) ?? null

  return {
    ...summary,
    ganzhi: buildGanzhi(solar),
    constellation: safe(() => solar.getConstellation().getName()) ?? null,
    phase: safe(() => solar.getPhase().getName()) ?? null,
    duty: safe(() => lunar.getDuty().getName()) ?? null,
    twelveStar: safe(() => lunar.getTwelveStar().getName()) ?? null,
    sixStar: safe(() => lunar.getSixStar().getName()) ?? null,
    minorRen: safe(() => lunar.getMinorRen().getName()) ?? null,
    nineStar: safe(() => lunar.getNineStar().toString()) ?? null,
    fetus: safe(() => lunar.getFetusDay().toString()) ?? null,
    twentyEightStar: buildStar(solar),
    gods,
    recommends: names((day) => day.getRecommends()),
    avoids: names((day) => day.getAvoids()),
    currentTerm: safe(() => {
      const termDay = solar.getTermDay()
      return { name: termDay.getSolarTerm().getName(), dayIndex: termDay.getDayIndex() }
    }),
    phenology: safe(() => solar.getPhenologyDay().toString()) ?? null,
    dogDay: safe(() => solar.getDogDay()?.toString() ?? null) ?? null,
    nineDay: safe(() => solar.getNineDay()?.toString() ?? null) ?? null,
    plumRainDay: safe(() => solar.getPlumRainDay()?.toString() ?? null) ?? null
  }
}

/** Cheap day projection for grid cells. Throws on dates outside tyme4ts's range. */
export function buildDaySummary(key: DateKey): DaySummary {
  assertValid(key)
  const iso = toIsoDate(key)
  const cached = summaryCache.get(iso)
  if (cached !== undefined) return cached
  const summary = buildSummary(key)
  summaryCache.set(iso, summary)
  return summary
}

/** Full almanac for one day, built on demand. Throws on out-of-range dates. */
export function buildDayInfo(key: DateKey): DayInfo {
  assertValid(key)
  const iso = toIsoDate(key)
  const cached = infoCache.get(iso)
  if (cached !== undefined) return cached
  const info = buildInfo(key)
  infoCache.set(iso, info)
  return info
}

/** Drops memoized days; used by tests that want a cold path. */
export function clearDayCaches(): void {
  summaryCache.clear()
  infoCache.clear()
}
