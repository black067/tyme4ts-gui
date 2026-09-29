import { describe, expect, it } from 'vitest'
import { buildEightChar, type EightCharInput, type EightCharResult } from '../pillars'
import type { DateKey } from '../date-key'

const key = (year: number, month: number, day: number): DateKey => ({ year, month, day })

/** Unwraps a successful chart, failing the test with the engine's message. */
function chart(input: EightCharInput): EightCharResult {
  const outcome = buildEightChar(input)
  if (!outcome.ok) throw new Error(`buildEightChar failed: ${outcome.error}`)
  return outcome.result
}

/** 1990-05-20 14:30, male — reference values verified against tyme4ts directly. */
function reference(): EightCharResult {
  return chart({ key: key(1990, 5, 20), hour: 14, minute: 30, gender: 'male' })
}

describe('buildEightChar', () => {
  it('lays out the four pillars', () => {
    const result = reference()
    expect(result.pillars.year.name).toBe('庚午')
    expect(result.pillars.month.name).toBe('辛巳')
    expect(result.pillars.day.name).toBe('乙酉')
    expect(result.pillars.hour.name).toBe('癸未')
  })

  it('splits each pillar into stem, branch, elements and 纳音', () => {
    const { day } = reference().pillars
    expect(day.stem).toBe('乙')
    expect(day.branch).toBe('酉')
    expect(day.stemElement).toBe('木')
    expect(day.branchElement).toBe('金')
    expect(day.nayin).toBe('泉中水')
    expect(day.hiddenStems).toEqual([{ name: '辛', role: '主' }])
  })

  it('derives 十神 from the day master, with 日主 on the day pillar itself', () => {
    const result = reference()
    expect(result.pillars.day.tenStar).toBe('日主')
    expect(result.pillars.year.tenStar).toBe('正官')
    expect(result.pillars.month.tenStar).toBe('七杀')
    expect(result.pillars.hour.tenStar).toBe('偏印')
    expect(result.dayMaster).toEqual({ stem: '乙', element: '木' })
  })

  it('counts the five elements over the eight characters', () => {
    const result = reference()
    expect(result.elements.map((entry) => entry.name)).toEqual(['木', '火', '土', '金', '水'])
    expect(result.elements.reduce((sum, entry) => sum + entry.count, 0)).toBe(8)
  })

  it('reports 起运 and the 大运 sequence', () => {
    const result = reference()
    expect(result.childLimit).not.toBeNull()
    expect(result.childLimit).toMatchObject({
      years: 5,
      months: 6,
      days: 21,
      forward: true,
      startAge: 1
    })

    expect(result.decades).toHaveLength(10)
    expect(result.decades[0]).toMatchObject({
      index: 0,
      startAge: 6,
      endAge: 15,
      startYear: 1995,
      pillar: '壬午'
    })
    expect(result.decades[1]?.pillar).toBe('癸未')
    for (const decade of result.decades) expect(decade.tenStar.length).toBeGreaterThan(0)
  })

  it('reports 流年 from the 起运 year', () => {
    const result = reference()
    expect(result.fortunes).toHaveLength(10)
    expect(result.fortunes[0]).toEqual({ age: 6, year: 1995, pillar: '己丑', tenStar: '偏财' })
    expect(result.fortunes[1]?.year).toBe(1996)
  })

  it('honours the requested list lengths', () => {
    const result = chart({
      key: key(1990, 5, 20),
      hour: 14,
      minute: 30,
      gender: 'female',
      decadeCount: 3,
      fortuneCount: 4
    })
    expect(result.decades).toHaveLength(3)
    expect(result.fortunes).toHaveLength(4)
  })

  it('rolls the day pillar forward for a 晚子时 birth', () => {
    const afternoon = chart({ key: key(1990, 5, 20), hour: 14, minute: 30, gender: 'male' })
    const late = chart({ key: key(1990, 5, 20), hour: 23, minute: 30, gender: 'male' })
    const nextDay = chart({ key: key(1990, 5, 21), hour: 0, minute: 30, gender: 'male' })

    expect(late.pillars.day.name).toBe(nextDay.pillars.day.name)
    expect(late.pillars.day.name).not.toBe(afternoon.pillars.day.name)
    // Both are in the 子 double-hour, so the hour pillar is the same.
    expect(late.pillars.hour.name).toBe(nextDay.pillars.hour.name)
  })

  it('keeps the day pillar stable across the ordinary double-hours', () => {
    const morning = chart({ key: key(2024, 6, 26), hour: 8, minute: 0, gender: 'male' })
    const evening = chart({ key: key(2024, 6, 26), hour: 20, minute: 0, gender: 'male' })
    expect(morning.pillars.day.name).toBe(evening.pillars.day.name)
    expect(morning.pillars.day.name).toBe('辛酉')
  })

  it('carries the lunar day, gender and time through', () => {
    const result = chart({ key: key(2024, 6, 26), hour: 8, minute: 0, gender: 'female' })
    expect(result.lunar.full).toBe('农历甲辰年五月廿一')
    expect(result.gender).toBe('female')
    expect(result.hour).toBe(8)
    expect(result.minute).toBe(0)
  })
})

describe('buildEightChar failure modes', () => {
  it('reports invalid dates instead of throwing', () => {
    const outcome = buildEightChar({ key: key(2023, 2, 30), hour: 0, minute: 0, gender: 'male' })
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error).toContain('日期无效')
  })

  it('reports an out-of-range hour or minute', () => {
    const hour = buildEightChar({ key: key(2024, 6, 26), hour: 24, minute: 0, gender: 'male' })
    expect(hour.ok).toBe(false)
    if (!hour.ok) expect(hour.error).toContain('小时')

    const minute = buildEightChar({ key: key(2024, 6, 26), hour: 0, minute: 60, gender: 'male' })
    expect(minute.ok).toBe(false)
    if (!minute.ok) expect(minute.error).toContain('分钟')
  })

  it('never throws at the edges of the supported range', () => {
    for (const edge of [key(1, 1, 1), key(2, 1, 1), key(9999, 12, 31), key(1582, 10, 15)]) {
      for (const hour of [0, 12, 23]) {
        expect(
          () => buildEightChar({ key: edge, hour, minute: 0, gender: 'female' }),
          `${edge.year}-${edge.month}-${edge.day} ${hour}:00`
        ).not.toThrow()
      }
    }
  })

  it('reports a friendly message where the engine cannot build a moment', () => {
    // tyme4ts's hour pillar needs a neighbouring day, which year 1 cannot supply.
    const outcome = buildEightChar({ key: key(1, 1, 1), hour: 12, minute: 0, gender: 'male' })
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error).toContain('超出历法可推算范围')
  })

  it('still reads the pillars at the far end of the range', () => {
    const outcome = buildEightChar({ key: key(9999, 12, 31), hour: 12, minute: 0, gender: 'male' })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    for (const pillar of Object.values(outcome.result.pillars)) {
      expect(pillar.name).toHaveLength(2)
      expect(pillar.stem).toHaveLength(1)
      expect(pillar.branch).toHaveLength(1)
    }
    expect(outcome.result.elements.reduce((sum, entry) => sum + entry.count, 0)).toBe(8)
  })
})
