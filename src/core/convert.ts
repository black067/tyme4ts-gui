import { HijriDay, JulianDay, LunarDay, RabByungDay, SolarDay } from 'tyme4ts'
import { isValidDateKey, type DateKey } from './date-key'
import { buildDayInfo } from './day'
import { formatFullDate } from './format'
import type { GanzhiInfo, LunarInfo } from './types'

/** The calendars the converter accepts as input. */
export type CalendarKind = 'solar' | 'lunar' | 'hijri' | 'rabByung' | 'julianDay'

export interface SolarInput {
  kind: 'solar'
  year: number
  month: number
  day: number
}

export interface LunarInput {
  kind: 'lunar'
  year: number
  month: number
  /** True when the month is the leap one (tyme4ts encodes it as a negative month). */
  leap: boolean
  day: number
}

export interface HijriInput {
  kind: 'hijri'
  year: number
  month: number
  day: number
}

export interface RabByungInput {
  kind: 'rabByung'
  year: number
  month: number
  day: number
}

export interface JulianDayInput {
  kind: 'julianDay'
  julianDay: number
}

export type CalendarInput = SolarInput | LunarInput | HijriInput | RabByungInput | JulianDayInput

/**
 * The numeric components of a resolved day in each calendar.
 *
 * The tool pages edit these fields directly, so they must come from the engine
 * rather than being parsed back out of display strings.
 */
export interface CalendarFields {
  solar: { year: number; month: number; day: number }
  lunar: { year: number; month: number; day: number; leap: boolean }
  hijri: { year: number; month: number; day: number } | null
  rabByung: { year: number; month: number; day: number } | null
  julianDay: number | null
}

export interface ConversionResult {
  key: DateKey
  iso: string
  solarText: string
  weekName: string
  lunar: LunarInfo
  hijriText: string | null
  rabByungText: string | null
  julianDay: number | null
  ganzhi: GanzhiInfo | null
  constellation: string | null
  /** Editable numeric form of every calendar representation. */
  fields: CalendarFields
  /** Non-fatal notes, e.g. a calendar that cannot represent the resolved date. */
  notes: string[]
}

export type ConversionOutcome =
  { ok: true; result: ConversionResult } | { ok: false; error: string }

/** tyme4ts only models the Tibetan calendar between these Rab-byung years. */
export const RAB_BYUNG_MIN_YEAR = 1950
export const RAB_BYUNG_MAX_YEAR = 2050

function solarKeyOf(solar: SolarDay): DateKey {
  const key = { year: solar.getYear(), month: solar.getMonth(), day: solar.getDay() }
  if (!isValidDateKey(key)) {
    throw new RangeError('换算结果落在 tyme4ts 可表示范围之外（1–9999 年）')
  }
  return key
}

function resolveKey(input: CalendarInput): DateKey {
  switch (input.kind) {
    case 'solar': {
      const key: DateKey = { year: input.year, month: input.month, day: input.day }
      if (!isValidDateKey(key)) {
        throw new RangeError('公历日期无效，或超出 1–9999 年范围（1582-10-05 至 10-14 不存在）')
      }
      return key
    }
    case 'lunar': {
      const month = input.leap ? -input.month : input.month
      return solarKeyOf(LunarDay.fromYmd(input.year, month, input.day).getSolarDay())
    }
    case 'hijri':
      return solarKeyOf(HijriDay.fromYmd(input.year, input.month, input.day).getSolarDay())
    case 'rabByung':
      return solarKeyOf(RabByungDay.fromYmd(input.year, input.month, input.day).getSolarDay())
    case 'julianDay': {
      if (!Number.isFinite(input.julianDay)) throw new RangeError('儒略日必须是数字')
      return solarKeyOf(JulianDay.fromJulianDay(input.julianDay).getSolarDay())
    }
  }
}

function messageFor(input: CalendarInput, cause: unknown): string {
  const detail = cause instanceof Error ? cause.message : String(cause)
  if (input.kind === 'rabByung') {
    return `藏历仅支持 ${RAB_BYUNG_MIN_YEAR}–${RAB_BYUNG_MAX_YEAR} 饶迥年（${detail}）`
  }
  return `无法换算：${detail}`
}

/**
 * Resolves any supported calendar input to a solar day and reports every other
 * representation of that day.
 *
 * Failure is a value, not an exception: the tool pages render the message
 * inline while the user is still typing.
 */
export function convert(input: CalendarInput): ConversionOutcome {
  let key: DateKey
  try {
    key = resolveKey(input)
  } catch (cause) {
    return { ok: false, error: messageFor(input, cause) }
  }

  const info = buildDayInfo(key)
  const solar = SolarDay.fromYmd(key.year, key.month, key.day)
  const lunarDay = solar.getLunarDay()
  const notes: string[] = []

  let hijriText: string | null = null
  let hijriFields: CalendarFields['hijri'] = null
  try {
    const hijri = solar.getHijriDay()
    hijriText = hijri.toString()
    hijriFields = { year: hijri.getYear(), month: hijri.getMonth(), day: hijri.getDay() }
  } catch {
    notes.push('回历无法表示该日期。')
  }

  let rabByungText: string | null = null
  let rabByungFields: CalendarFields['rabByung'] = null
  try {
    const rabByung = solar.getRabByungDay()
    rabByungText = rabByung.toString()
    rabByungFields = {
      year: rabByung.getYear(),
      month: rabByung.getMonth(),
      day: rabByung.getDay()
    }
  } catch {
    notes.push(`藏历仅覆盖 ${RAB_BYUNG_MIN_YEAR}–${RAB_BYUNG_MAX_YEAR} 饶迥年。`)
  }

  let julianDay: number | null = null
  try {
    julianDay = solar.getJulianDay().getDay()
  } catch {
    notes.push('儒略日无法计算。')
  }

  return {
    ok: true,
    result: {
      key,
      iso: info.iso,
      solarText: formatFullDate(key.year, key.month, key.day),
      weekName: solar.getWeek().getName(),
      lunar: info.lunar,
      hijriText,
      rabByungText,
      julianDay,
      ganzhi: info.ganzhi,
      constellation: info.constellation,
      fields: {
        solar: { year: key.year, month: key.month, day: key.day },
        lunar: {
          year: lunarDay.getYear(),
          month: lunarDay.getMonth(),
          day: lunarDay.getDay(),
          leap: lunarDay.getLunarMonth().isLeap()
        },
        hijri: hijriFields,
        rabByung: rabByungFields,
        julianDay
      },
      notes
    }
  }
}
