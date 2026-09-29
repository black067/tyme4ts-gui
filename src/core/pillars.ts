import { ChildLimit, Gender, SolarTime, type HeavenStem, type SixtyCycle } from 'tyme4ts'
import { isValidDateKey, type DateKey } from './date-key'
import { buildDaySummary } from './day'
import type { LunarInfo } from './types'

export type PersonGender = 'male' | 'female'

/** A hidden stem inside an earthly branch, with its role (主/中/余). */
export interface HiddenStem {
  name: string
  role: string
}

export interface PillarInfo {
  /** 干支, e.g. 庚午 */
  name: string
  /** 天干 */
  stem: string
  /** 地支 */
  branch: string
  stemElement: string
  branchElement: string
  /** 十神 relative to the day master; `日主` for the day pillar itself. */
  tenStar: string
  hiddenStems: HiddenStem[]
  /** 纳音 */
  nayin: string
}

export interface DecadeEntry {
  index: number
  startAge: number
  endAge: number
  startYear: number
  pillar: string
  tenStar: string
}

export interface FortuneEntry {
  age: number
  year: number
  pillar: string
  tenStar: string
}

export interface ChildLimitInfo {
  years: number
  months: number
  days: number
  /** True when the 大运 run forward from the birth pillar. */
  forward: boolean
  /** Age at which the 大运 begin. */
  startAge: number
  /** 起运时刻, e.g. 1995年12月11日 14:30:00 */
  startText: string
}

export interface EightCharResult {
  key: DateKey
  hour: number
  minute: number
  gender: PersonGender
  lunar: LunarInfo
  pillars: {
    year: PillarInfo
    month: PillarInfo
    day: PillarInfo
    hour: PillarInfo
  }
  /** 日主: the day stem and its element. */
  dayMaster: { stem: string; element: string }
  /** 五行统计 over the eight characters (four stems + four branches). */
  elements: Array<{ name: string; count: number }>
  /** 起运信息; null when the engine cannot derive it for this date. */
  childLimit: ChildLimitInfo | null
  decades: DecadeEntry[]
  /** 流年 starting from the 起运 year. */
  fortunes: FortuneEntry[]
}

export interface EightCharInput {
  key: DateKey
  hour: number
  minute: number
  gender: PersonGender
  /** How many 大运 to list (10 covers a century). */
  decadeCount?: number
  /** How many 流年 to list. */
  fortuneCount?: number
}

export type EightCharOutcome = { ok: true; result: EightCharResult } | { ok: false; error: string }

const ELEMENT_ORDER = ['木', '火', '土', '金', '水'] as const

function hiddenStemsOf(cycle: SixtyCycle): HiddenStem[] {
  return cycle
    .getEarthBranch()
    .getHideHeavenStems()
    .map((hidden) => ({ name: hidden.getName(), role: hiddenRole(String(hidden.getType())) }))
}

/** tyme4ts encodes the role as an enum: 2 主 / 1 中 / 0 余. */
function hiddenRole(type: string): string {
  switch (type) {
    case '2':
      return '主'
    case '1':
      return '中'
    case '0':
      return '余'
    default:
      return ''
  }
}

function pillarOf(cycle: SixtyCycle, dayStem: HeavenStem, isDayPillar: boolean): PillarInfo {
  const stem = cycle.getHeavenStem()
  return {
    name: cycle.getName(),
    stem: stem.getName(),
    branch: cycle.getEarthBranch().getName(),
    stemElement: stem.getElement().getName(),
    branchElement: cycle.getEarthBranch().getElement().getName(),
    // tyme4ts reads `a.getTenStar(b)` as "b, seen from a", so the day master
    // must be the receiver for every other stem's 十神.
    tenStar: isDayPillar ? '日主' : dayStem.getTenStar(stem).getName(),
    hiddenStems: hiddenStemsOf(cycle),
    nayin: cycle.getSound().getName()
  }
}

function countElements(pillars: PillarInfo[]): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>(ELEMENT_ORDER.map((name) => [name, 0]))
  for (const pillar of pillars) {
    for (const element of [pillar.stemElement, pillar.branchElement]) {
      counts.set(element, (counts.get(element) ?? 0) + 1)
    }
  }
  return ELEMENT_ORDER.map((name) => ({ name, count: counts.get(name) ?? 0 }))
}

function tenStarOf(cycle: SixtyCycle, dayStem: HeavenStem): string {
  return dayStem.getTenStar(cycle.getHeavenStem()).getName()
}

/**
 * 八字排盘 for one birth moment.
 *
 * Failure is a value, not an exception: tyme4ts cannot build a `SolarTime` in
 * year 1 or year 9999, and the page renders the message inline.
 *
 * The 时柱 follows tyme4ts's default school: the hour pillar is taken from the
 * double-hour the moment falls in, and a birth at 23:00–23:59 (晚子时) rolls the
 * day pillar forward, so it shares the next day's 日柱.
 */
export function buildEightChar(input: EightCharInput): EightCharOutcome {
  const { key, hour, minute, gender } = input
  if (!isValidDateKey(key)) {
    return {
      ok: false,
      error: `日期无效，或超出 1–9999 年范围：${key.year}-${key.month}-${key.day}`
    }
  }
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return { ok: false, error: `小时必须是 0–23：${hour}` }
  }
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    return { ok: false, error: `分钟必须是 0–59：${minute}` }
  }

  let time: SolarTime
  let eightChar: ReturnType<ReturnType<SolarTime['getLunarHour']>['getEightChar']>
  try {
    time = SolarTime.fromYmdHms(key.year, key.month, key.day, hour, minute, 0)
    eightChar = time.getLunarHour().getEightChar()
  } catch {
    // tyme4ts refuses to build a moment in year 1, year 2 and year 9999.
    return { ok: false, error: '该日期超出历法可推算范围，无法排盘。' }
  }

  const dayStem = eightChar.getDay().getHeavenStem()

  const pillars = {
    year: pillarOf(eightChar.getYear(), dayStem, false),
    month: pillarOf(eightChar.getMonth(), dayStem, false),
    day: pillarOf(eightChar.getDay(), dayStem, true),
    hour: pillarOf(eightChar.getHour(), dayStem, false)
  }

  const all = [pillars.year, pillars.month, pillars.day, pillars.hour]
  const decadeCount = input.decadeCount ?? 10
  const fortuneCount = input.fortuneCount ?? 10

  let childLimitInfo: ChildLimitInfo | null = null
  const decades: DecadeEntry[] = []
  const fortunes: FortuneEntry[] = []

  try {
    const limit = ChildLimit.fromSolarTime(time, gender === 'male' ? Gender.MAN : Gender.WOMAN)
    childLimitInfo = {
      years: limit.getYearCount(),
      months: limit.getMonthCount(),
      days: limit.getDayCount(),
      forward: limit.isForward(),
      startAge: limit.getStartAge(),
      startText: limit.getStartTime().toString()
    }

    let decade = limit.getStartDecadeFortune()
    for (let index = 0; index < decadeCount; index += 1) {
      decades.push({
        index,
        startAge: decade.getStartAge(),
        endAge: decade.getEndAge(),
        startYear: decade.getStartSixtyCycleYear().getYear(),
        pillar: decade.getSixtyCycle().getName(),
        tenStar: tenStarOf(decade.getSixtyCycle(), dayStem)
      })
      decade = decade.next(1)
    }

    let fortune = limit.getStartFortune()
    for (let index = 0; index < fortuneCount; index += 1) {
      fortunes.push({
        age: fortune.getAge(),
        year: fortune.getSixtyCycleYear().getYear(),
        pillar: fortune.getSixtyCycle().getName(),
        tenStar: tenStarOf(fortune.getSixtyCycle(), dayStem)
      })
      fortune = fortune.next(1)
    }
  } catch {
    // 起运 needs the surrounding solar terms, which the range edges lack. The
    // four pillars and the element tally still stand on their own.
    childLimitInfo = null
  }

  return {
    ok: true,
    result: {
      key,
      hour,
      minute,
      gender,
      lunar: buildDaySummary(key).lunar,
      pillars,
      dayMaster: { stem: pillars.day.stem, element: pillars.day.stemElement },
      elements: countElements(all),
      childLimit: childLimitInfo,
      decades,
      fortunes
    }
  }
}
