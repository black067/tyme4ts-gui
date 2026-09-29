/**
 * Golden tests ported from the reference suite shipped with tyme4ts
 * (`vendor/tyme4ts/test/**`). They are the safety net for the engine boundary:
 * if a DTO field is ever mapped from the wrong tyme4ts accessor, these fail.
 */
import { describe, expect, it } from 'vitest'
import { buildDayInfo, buildDaySummary } from '..'
import type { DateKey } from '../date-key'

const key = (year: number, month: number, day: number): DateKey => ({ year, month, day })

describe('SolarDay assertions (vendor/tyme4ts/test/SolarDayTest.ts)', () => {
  it('formats solar dates', () => {
    expect(buildDaySummary(key(2023, 1, 1)).iso).toBe('2023-01-01')
    expect(buildDaySummary(key(2000, 2, 29)).iso).toBe('2000-02-29')
  })

  it('maps the lunar day', () => {
    expect(buildDaySummary(key(2020, 5, 24)).lunar.full).toBe('农历庚子年闰四月初二')
    expect(buildDaySummary(key(16, 11, 30)).lunar.full).toBe('农历丙子年十一月十二')
  })

  it('only reports a solar term on the term day itself', () => {
    // 2023-10-27 is 霜降 + 4 days (term-day indices are 0-based), not the term day.
    expect(buildDayInfo(key(2023, 10, 27)).currentTerm).toEqual({ name: '霜降', dayIndex: 3 })
    expect(buildDaySummary(key(2023, 10, 27)).term).toBeNull()
    // 2024-02-04 is 立春 itself.
    expect(buildDaySummary(key(2024, 2, 4)).term).toEqual({ name: '立春' })
    expect(buildDayInfo(key(2024, 2, 4)).currentTerm).toEqual({ name: '立春', dayIndex: 0 })
  })

  it('maps phenology', () => {
    expect(buildDayInfo(key(2023, 10, 27)).phenology).toBe('豺乃祭兽第4天')
  })

  it('maps the lunar year cycle at the 春节 boundary', () => {
    expect(buildDaySummary(key(2024, 2, 10)).lunar.yearGanZhi).toBe('甲辰')
    expect(buildDaySummary(key(2024, 2, 9)).lunar.yearGanZhi).toBe('癸卯')
    expect(buildDaySummary(key(2024, 2, 9)).lunar.zodiac).toBe('兔')
    expect(buildDaySummary(key(2024, 2, 10)).lunar.zodiac).toBe('龙')
    expect(buildDaySummary(key(2024, 2, 10)).lunar.monthName).toBe('正月')
    expect(buildDaySummary(key(2024, 2, 10)).lunar.dayName).toBe('初一')
  })
})

describe('LunarDay assertions (vendor/tyme4ts/test/LunarDayTest.ts)', () => {
  it('flips between the lunar and solar calendars', () => {
    // 农历 2020-04-01 == 2020-04-23, 农历 1905-01-01 == 1905-02-04
    expect(buildDaySummary(key(2020, 4, 23)).lunar.full).toBe('农历庚子年四月初一')
    expect(buildDaySummary(key(1905, 2, 4)).lunar.monthName).toBe('正月')
    expect(buildDaySummary(key(1905, 2, 4)).lunar.dayName).toBe('初一')
  })

  it('maps 闰月 months', () => {
    expect(buildDaySummary(key(2020, 5, 24)).lunar.isLeap).toBe(true)
    expect(buildDaySummary(key(2020, 5, 24)).lunar.monthName).toBe('闰四月')
    // 农历五月初一 follows the leap month.
    expect(buildDaySummary(key(2020, 6, 21)).lunar.monthName).toBe('五月')
    expect(buildDaySummary(key(2020, 6, 21)).lunar.isLeap).toBe(false)
  })

  it('maps 二十八宿 completely (test24: 农历 2020-04-13 = 2020-05-05)', () => {
    expect(buildDayInfo(key(2020, 5, 5)).twentyEightStar).toEqual({
      name: '翼',
      luck: '凶',
      zone: '南',
      beast: '朱雀',
      sevenStar: '火',
      animal: '蛇',
      land: '阳天',
      direction: '东南'
    })
  })

  it('maps 二十八宿 for a second reference day (test25: 农历 2023-09-28 = 2023-11-11)', () => {
    expect(buildDayInfo(key(2023, 11, 11)).twentyEightStar).toEqual({
      name: '柳',
      luck: '凶',
      zone: '南',
      beast: '朱雀',
      sevenStar: '土',
      animal: '獐',
      land: '炎天',
      direction: '南'
    })
  })

  it('maps 小六壬', () => {
    expect(buildDayInfo(key(2024, 3, 5)).minorRen).toBe('大安')
  })

  it('maps the year zodiac at the lunar new year boundary', () => {
    expect(buildDaySummary(key(2026, 2, 17)).lunar.zodiac).toBe('马')
    expect(buildDaySummary(key(2026, 2, 16)).lunar.zodiac).toBe('蛇')
  })
})

describe('Taboo assertions (vendor/tyme4ts/test/TabooTest.ts)', () => {
  it('maps 宜 lists', () => {
    expect(buildDayInfo(key(2024, 6, 26)).recommends).toEqual([
      '嫁娶',
      '祭祀',
      '理发',
      '作灶',
      '修饰垣墙',
      '平治道涂',
      '整手足甲',
      '沐浴',
      '冠笄'
    ])
  })

  it('maps 忌 lists', () => {
    expect(buildDayInfo(key(2024, 6, 26)).avoids).toEqual(['破土', '出行', '栽种'])
  })
})

describe('LegalHoliday assertions (vendor/tyme4ts/test/LegalHolidayTest.ts)', () => {
  it('maps 休 days', () => {
    expect(buildDaySummary(key(2011, 5, 1)).holiday).toEqual({ name: '劳动节', isWork: false })
    expect(buildDaySummary(key(2022, 10, 5)).holiday).toEqual({ name: '国庆节', isWork: false })
  })

  it('maps 班 (调休上班) days', () => {
    expect(buildDaySummary(key(2001, 12, 29)).holiday).toEqual({ name: '元旦', isWork: true })
    expect(buildDaySummary(key(2024, 2, 4)).holiday).toEqual({ name: '春节', isWork: true })
  })

  it('degrades to null outside the embedded data range instead of throwing', () => {
    expect(buildDaySummary(key(1999, 10, 1)).holiday).toBeNull()
    expect(buildDaySummary(key(2050, 2, 1)).holiday).toBeNull()
  })
})

describe('Week assertions (vendor/tyme4ts/test/WeekTest.ts)', () => {
  it('maps the week index with 0 = Sunday', () => {
    expect(buildDaySummary(key(2023, 10, 31)).weekDay).toBe(2)
    expect(buildDaySummary(key(1582, 10, 1)).weekDay).toBe(1)
    expect(buildDaySummary(key(1582, 10, 15)).weekDay).toBe(5)
    expect(buildDaySummary(key(1129, 11, 17)).weekDay).toBe(0)
    expect(buildDaySummary(key(1500, 2, 29)).weekDay).toBe(6)
    expect(buildDaySummary(key(9865, 7, 26)).weekDay).toBe(3)
  })

  it('derives weekend flags from the week index', () => {
    expect(buildDaySummary(key(2024, 2, 10)).isWeekend).toBe(true)
    expect(buildDaySummary(key(2024, 2, 11)).isWeekend).toBe(true)
    expect(buildDaySummary(key(2024, 2, 12)).isWeekend).toBe(false)
  })
})

describe('almanac fields for a reference day (2024-06-26)', () => {
  const info = buildDayInfo(key(2024, 6, 26))

  it('maps the 节气-based pillars', () => {
    expect(info.ganzhi).toEqual({
      year: '甲辰',
      month: '庚午',
      day: '辛酉',
      daySound: '石榴木',
      dayElement: '金',
      pengZu: '辛不合酱主人不尝 酉不会客醉坐颠狂'
    })
  })

  it('maps the remaining almanac labels', () => {
    expect(info.duty).toBe('平')
    expect(info.twelveStar).toBe('明堂')
    expect(info.sixStar).toBe('先胜')
    expect(info.nineStar).toBe('七赤金')
    expect(info.fetus).toBe('厨灶门 外东南')
    expect(info.constellation).toBe('巨蟹')
    expect(info.phase).toBe('亏凸月')
    expect(info.currentTerm).toEqual({ name: '夏至', dayIndex: 5 })
    expect(info.plumRainDay).toBe('入梅第16天')
    expect(info.dogDay).toBeNull()
    expect(info.nineDay).toBeNull()
  })

  it('maps 吉神凶煞 with their luck', () => {
    expect(info.gods).toContainEqual({ name: '月德合', luck: '吉' })
    expect(info.gods).toContainEqual({ name: '天贼', luck: '凶' })
  })

  it('maps 数九 when in season', () => {
    expect(buildDayInfo(key(2024, 1, 1)).nineDay).toBe('二九第2天')
  })

  it('maps 三伏 when in season', () => {
    expect(buildDayInfo(key(2024, 7, 15)).dogDay).toBe('初伏第1天')
  })
})

describe('graceful degradation at the edges of the supported range', () => {
  // tyme4ts throws rather than returning empty for several accessors in year 1,
  // year 2 and year 9999. Rendering must never surface that as a crash.
  const edges: DateKey[] = [
    key(1, 1, 1),
    key(1, 1, 2),
    key(1, 1, 15),
    key(1, 6, 1),
    key(2, 1, 1),
    key(9998, 12, 31),
    key(9999, 6, 1),
    key(9999, 12, 31)
  ]

  it('never throws while building a summary or a full almanac', () => {
    for (const edge of edges) {
      expect(() => buildDaySummary(edge), `summary ${edge.year}`).not.toThrow()
      expect(() => buildDayInfo(edge), `info ${edge.year}-${edge.month}-${edge.day}`).not.toThrow()
    }
  })

  it('still produces a usable summary when almanac fields are unavailable', () => {
    const summary = buildDaySummary(key(1, 1, 1))
    expect(summary.iso).toBe('0001-01-01')
    expect(summary.weekDay).toBe(6)
    expect(summary.lunar.dayName.length).toBeGreaterThan(0)
    expect(summary.term).toBeNull()
  })

  it('reports unavailable almanac fields as null rather than empty', () => {
    const info = buildDayInfo(key(1, 1, 1))
    expect(info.currentTerm).toBeNull()
    expect(info.nineStar).toBeNull()
    expect(info.ganzhi).toBeNull()
    expect(info.recommends).toBeNull()
  })

  it('keeps ordinary days fully populated', () => {
    const info = buildDayInfo(key(2024, 6, 26))
    expect(info.ganzhi).not.toBeNull()
    expect(info.recommends).not.toBeNull()
    expect(info.twentyEightStar).not.toBeNull()
  })

  it('rejects dates outside the range outright', () => {
    expect(() => buildDaySummary({ year: 0, month: 1, day: 1 })).toThrow(RangeError)
    expect(() => buildDayInfo({ year: 10000, month: 1, day: 1 })).toThrow(RangeError)
    expect(() => buildDayInfo({ year: 1582, month: 10, day: 10 })).toThrow(RangeError)
  })
})

describe('festivals', () => {
  it('separates solar and lunar festivals', () => {
    expect(buildDaySummary(key(2024, 10, 1)).festivals).toEqual([{ kind: 'solar', name: '国庆节' }])
    expect(buildDaySummary(key(2024, 2, 10)).festivals).toEqual([{ kind: 'lunar', name: '春节' }])
  })

  it('collects both kinds when they collide', () => {
    // 2025-10-06 is 国庆节假期 during 中秋.
    const names = buildDaySummary(key(2025, 10, 6)).festivals.map((f) => f.name)
    expect(names).toContain('中秋节')
  })

  it('is empty on an ordinary day', () => {
    expect(buildDaySummary(key(2024, 6, 26)).festivals).toEqual([])
  })
})
