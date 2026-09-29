import { describe, expect, it } from 'vitest'
import { SEARCH_MAX_DAYS, searchDays, searchSpanDays } from '../search'
import type { DateKey } from '../date-key'

const key = (year: number, month: number, day: number): DateKey => ({ year, month, day })

describe('searchSpanDays', () => {
  it('counts an inclusive range', () => {
    expect(searchSpanDays({ from: key(2024, 1, 1), to: key(2024, 1, 31) })).toEqual({
      days: 31,
      clipped: false
    })
  })

  it('returns zero for an inverted range', () => {
    expect(searchSpanDays({ from: key(2024, 2, 1), to: key(2024, 1, 1) }).days).toBe(0)
  })

  it('clips at the cap and says so', () => {
    const span = searchSpanDays({ from: key(2024, 1, 1), to: key(2030, 1, 1) })
    expect(span.days).toBe(SEARCH_MAX_DAYS)
    expect(span.clipped).toBe(true)
  })

  it('does not report clipping for an exactly-capped range', () => {
    // 2024 is a leap year, so 2024-01-01 .. 2024-12-31 is 366 days.
    const span = searchSpanDays({ from: key(2024, 1, 1), to: key(2024, 12, 31) })
    expect(span.days).toBe(366)
    expect(span.clipped).toBe(false)
  })
})

describe('searchDays on summary criteria', () => {
  it('finds every solar term day in a month', () => {
    const result = searchDays({
      from: key(2024, 2, 1),
      to: key(2024, 2, 29),
      terms: ['立春', '雨水']
    })
    expect(result.hits.map((hit) => hit.iso)).toEqual(['2024-02-04', '2024-02-19'])
  })

  it('finds the statutory rest days of a holiday week', () => {
    const result = searchDays({
      from: key(2024, 2, 1),
      to: key(2024, 2, 29),
      restDaysOnly: true
    })
    const isos = result.hits.map((hit) => hit.iso)
    expect(isos).toContain('2024-02-10')
    expect(isos).toContain('2024-02-17')
    // 2024-02-04 is a makeup workday, so it must not appear.
    expect(isos).not.toContain('2024-02-04')
  })

  it('excludes makeup workdays while keeping ordinary working days', () => {
    const result = searchDays({
      from: key(2024, 2, 1),
      to: key(2024, 2, 12),
      excludeMakeupDays: true
    })
    const isos = result.hits.map((hit) => hit.iso)
    expect(isos).not.toContain('2024-02-04')
    expect(isos).toContain('2024-02-05')
  })

  it('finds weekends', () => {
    const result = searchDays({
      from: key(2024, 3, 1),
      to: key(2024, 3, 10),
      weekendsOnly: true
    })
    expect(result.hits.map((hit) => hit.iso)).toEqual([
      '2024-03-02',
      '2024-03-03',
      '2024-03-09',
      '2024-03-10'
    ])
    expect(result.hits.every((hit) => hit.weekDay === 0 || hit.weekDay === 6)).toBe(true)
  })

  it('finds festivals by name', () => {
    const result = searchDays({
      from: key(2024, 1, 1),
      to: key(2024, 12, 31),
      festivals: ['中秋节', '春节']
    })
    const isos = result.hits.map((hit) => hit.iso)
    expect(isos).toContain('2024-02-10')
    expect(isos).toContain('2024-09-17')
  })
})

describe('searchDays on almanac criteria', () => {
  it('finds days whose 宜 includes every requested item', () => {
    const result = searchDays({
      from: key(2024, 6, 1),
      to: key(2024, 6, 30),
      recommends: ['嫁娶']
    })
    expect(result.hits.length).toBeGreaterThan(0)
    for (const hit of result.hits) {
      expect(hit.recommends).toContain('嫁娶')
    }
    // 2024-06-26 advises 嫁娶 and 祭祀 but not 开市.
    const combined = searchDays({
      from: key(2024, 6, 1),
      to: key(2024, 6, 30),
      recommends: ['嫁娶', '祭祀']
    })
    expect(combined.hits.map((hit) => hit.iso)).toContain('2024-06-26')
    expect(
      combined.hits.every(
        (hit) => hit.recommends?.includes('嫁娶') && hit.recommends?.includes('祭祀')
      )
    ).toBe(true)
  })

  it('finds days whose 忌 includes the requested item', () => {
    const result = searchDays({
      from: key(2024, 6, 1),
      to: key(2024, 6, 30),
      avoids: ['出行']
    })
    expect(result.hits.map((hit) => hit.iso)).toContain('2024-06-26')
    for (const hit of result.hits) expect(hit.avoids).toContain('出行')
  })

  it('finds days by 日干支', () => {
    const result = searchDays({
      from: key(2024, 6, 1),
      to: key(2024, 6, 30),
      ganzhiDays: ['辛酉']
    })
    expect(result.hits.some((hit) => hit.iso === '2024-06-26')).toBe(true)
    for (const hit of result.hits) expect(hit.ganzhiDay).toBe('辛酉')
  })

  it('combines almanac and summary criteria', () => {
    const result = searchDays({
      from: key(2024, 6, 1),
      to: key(2024, 6, 30),
      recommends: ['嫁娶'],
      weekendsOnly: true
    })

    // 必须先断言非空：只对 hits 做循环的话，组合条件一旦退化成「什么都匹配不到」，
    // 循环会空转通过——测试是绿的，却什么都没检查。同文件相邻几条都有这个哨兵。
    expect(result.hits.length).toBeGreaterThan(0)
    for (const hit of result.hits) {
      expect(hit.weekDay === 0 || hit.weekDay === 6).toBe(true)
      expect(hit.recommends).toContain('嫁娶')
    }
  })
})

describe('searchDays edge cases', () => {
  it('returns nothing for an inverted range', () => {
    const result = searchDays({ from: key(2024, 2, 1), to: key(2024, 1, 1) })
    expect(result).toEqual({ hits: [], scannedDays: 0, rangeClipped: false, limitReached: false })
  })

  it('stops at the limit and reports it', () => {
    const result = searchDays({ from: key(2024, 1, 1), to: key(2024, 12, 31) }, 5)
    expect(result.hits).toHaveLength(5)
    expect(result.limitReached).toBe(true)
  })

  it('reports the scanned day count', () => {
    const result = searchDays({ from: key(2024, 3, 1), to: key(2024, 3, 31) })
    expect(result.scannedDays).toBe(31)
    expect(result.hits).toHaveLength(31)
  })

  it('never throws at the edges of the supported range', () => {
    expect(() => searchDays({ from: key(1, 1, 1), to: key(1, 12, 31) })).not.toThrow()
    expect(() => searchDays({ from: key(9999, 1, 1), to: key(9999, 12, 31) })).not.toThrow()
    expect(() =>
      searchDays({ from: key(1582, 9, 1), to: key(1582, 11, 30), recommends: ['祭祀'] })
    ).not.toThrow()
  })

  it('stays fast enough for a full-year almanac scan', () => {
    const began = performance.now()
    const result = searchDays({
      from: key(2024, 1, 1),
      to: key(2024, 12, 31),
      recommends: ['嫁娶']
    })
    const elapsed = performance.now() - began
    expect(result.scannedDays).toBe(366)
    expect(result.hits.length).toBeGreaterThan(20)
    expect(elapsed).toBeLessThan(3000)
  })
})
