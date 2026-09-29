import { describe, expect, it } from 'vitest'
import { RAB_BYUNG_MAX_YEAR, RAB_BYUNG_MIN_YEAR, convert } from '../convert'

describe('convert from the solar calendar', () => {
  it('reports every representation of a day', () => {
    const outcome = convert({ kind: 'solar', year: 2024, month: 6, day: 26 })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    const { result } = outcome
    expect(result.iso).toBe('2024-06-26')
    expect(result.solarText).toBe('2024年6月26日')
    expect(result.weekName).toBe('三')
    expect(result.lunar.full).toBe('农历甲辰年五月廿一')
    expect(result.ganzhi?.day).toBe('辛酉')
    expect(result.constellation).toBe('巨蟹')
    expect(result.hijriText).toMatch(/^1445年/)
    expect(result.rabByungText).toBeTruthy()
    expect(result.julianDay).toBeGreaterThan(2_460_000)
    expect(result.notes).toEqual([])
  })

  it('rejects impossible and out-of-range dates', () => {
    for (const input of [
      { kind: 'solar', year: 2023, month: 2, day: 30 },
      { kind: 'solar', year: 1582, month: 10, day: 10 },
      { kind: 'solar', year: 0, month: 1, day: 1 },
      { kind: 'solar', year: 10000, month: 1, day: 1 }
    ] as const) {
      const outcome = convert(input)
      expect(outcome.ok).toBe(false)
      if (!outcome.ok) expect(outcome.error).toContain('公历日期无效')
    }
  })

  it('degrades outside the Tibetan calendar range instead of failing', () => {
    const outcome = convert({ kind: 'solar', year: 1900, month: 1, day: 1 })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.result.rabByungText).toBeNull()
    expect(outcome.result.notes.join(' ')).toContain(String(RAB_BYUNG_MIN_YEAR))
    // Everything else still resolves.
    expect(outcome.result.lunar.full.length).toBeGreaterThan(0)
    expect(outcome.result.hijriText).toBeTruthy()
  })
})

describe('convert from the lunar calendar', () => {
  it('resolves a regular lunar date', () => {
    const outcome = convert({ kind: 'lunar', year: 2024, month: 5, day: 21, leap: false })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.result.iso).toBe('2024-06-26')
  })

  it('resolves a leap lunar month', () => {
    const outcome = convert({ kind: 'lunar', year: 2020, month: 4, day: 2, leap: true })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.result.iso).toBe('2020-05-24')
    expect(outcome.result.lunar.isLeap).toBe(true)
    expect(outcome.result.lunar.monthName).toBe('闰四月')
  })

  it('rejects an impossible lunar date', () => {
    const outcome = convert({ kind: 'lunar', year: 2024, month: 13, day: 1, leap: false })
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error).toContain('无法换算')
  })
})

describe('convert from the other calendars', () => {
  it('resolves a Hijri date', () => {
    const outcome = convert({ kind: 'hijri', year: 1445, month: 9, day: 1 })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.result.iso).toBe('2024-03-11')
  })

  // 名字原先写的是「inside its range」，但喂进去的 2150 已经超过 RAB_BYUNG_MAX_YEAR，
  // 断言的是**拒绝**——名不副实，而且掩盖了「范围内其实没有用例」这个缺口。
  it('rejects a Rab-byung year past the supported range, naming both bounds', () => {
    const outcome = convert({ kind: 'rabByung', year: RAB_BYUNG_MAX_YEAR + 100, month: 1, day: 1 })
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.error).toContain(String(RAB_BYUNG_MIN_YEAR))
      expect(outcome.error).toContain(String(RAB_BYUNG_MAX_YEAR))
    }
  })

  it('resolves a Rab-byung date inside its range', () => {
    const outcome = convert({ kind: 'rabByung', year: 2024, month: 5, day: 21 })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.result.iso).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // 藏历日期本身也要能反查出来，否则这条只证明了「没报错」。
    expect(outcome.result.rabByungText).toBeTruthy()
  })

  it('resolves a Julian day number', () => {
    const outcome = convert({ kind: 'julianDay', julianDay: 2460000 })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.result.iso).toBe('2023-02-24')
    // tyme4ts reports the Julian day at the start of the day, hence the .5.
    expect(outcome.result.julianDay).toBe(2459999.5)
  })

  it('round-trips a solar date through its Julian day', () => {
    const first = convert({ kind: 'solar', year: 2024, month: 3, day: 11 })
    expect(first.ok).toBe(true)
    if (!first.ok || first.result.julianDay === null) return

    const second = convert({ kind: 'julianDay', julianDay: first.result.julianDay })
    expect(second.ok).toBe(true)
    if (second.ok) expect(second.result.iso).toBe('2024-03-11')
  })
})
