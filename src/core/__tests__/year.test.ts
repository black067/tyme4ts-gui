import { describe, expect, it } from 'vitest'
import { buildDayRange, buildYearInfo } from '../year'
import { monthGridShape } from '../month'
import { isValidDateKey } from '../date-key'

describe('monthGridShape', () => {
  it('matches the crate-level grid geometry', () => {
    expect(monthGridShape(2024, 2)).toEqual({
      year: 2024,
      month: 2,
      weekStart: 0,
      leading: 4,
      rows: 5,
      gridStart: { year: 2024, month: 1, day: 28 }
    })
    expect(monthGridShape(2024, 2, true).leading).toBe(3)
  })

  it('rejects out-of-range input', () => {
    expect(() => monthGridShape(0, 1)).toThrow(RangeError)
    expect(() => monthGridShape(2024, 13)).toThrow(RangeError)
  })
})

describe('buildYearInfo', () => {
  it('builds twelve month grids that tile the year', () => {
    const year = buildYearInfo(2024)
    expect(year.months).toHaveLength(12)
    expect(year.dayCount).toBe(366)
    expect(year.months[0]?.cells[0]?.iso).toBe('2023-12-31')
    for (const month of year.months) {
      expect(month.cells).toHaveLength(month.rows * 7)
      expect(month.cells.every((cell) => cell !== null)).toBe(true)
    }
  })

  it('shares one summary object per date across neighbouring months', () => {
    const year = buildYearInfo(2024)
    // 2024-02-01 appears in both January's trailing week and February's grid.
    const fromJanuary = year.months[0]?.cells.find((cell) => cell?.iso === '2024-02-01')
    const fromFebruary = year.months[1]?.cells.find((cell) => cell?.iso === '2024-02-01')
    expect(fromJanuary).toBeDefined()
    expect(fromFebruary).toBe(fromJanuary)
  })

  it('collects all 24 solar terms in calendar order', () => {
    const { terms } = buildYearInfo(2024)
    expect(terms).toHaveLength(24)
    expect(terms[0]).toEqual({ month: 1, day: 6, name: '小寒' })
    expect(terms.at(-1)?.name).toBe('冬至')
    const sorted = [...terms].sort((a, b) => a.month - b.month || a.day - b.day)
    expect(terms).toEqual(sorted)
  })

  it('collects festivals and statutory holidays', () => {
    const year = buildYearInfo(2024)
    const springFestival = year.festivals.find((entry) => entry.names.includes('春节'))
    expect(springFestival).toEqual({ month: 2, day: 10, names: ['春节'] })

    const nationalDay = year.holidays.find((entry) => entry.month === 10 && entry.day === 1)
    expect(nationalDay).toEqual({ month: 10, day: 1, name: '国庆节', isWork: false })

    const makeupDay = year.holidays.find((entry) => entry.isWork)
    expect(makeupDay?.name).toBe('春节')
  })

  it('handles the 355-day year of the Gregorian reform', () => {
    const year = buildYearInfo(1582)
    expect(year.dayCount).toBe(355)
    const isos = year.months.flatMap((month) => month.cells.map((cell) => cell?.iso ?? null))
    expect(isos).toContain('1582-10-04')
    expect(isos).toContain('1582-10-15')
    expect(isos).not.toContain('1582-10-10')
  })

  it('degrades at the range ends instead of throwing', () => {
    const first = buildYearInfo(1)
    expect(first.dayCount).toBe(365)
    expect(first.months[0]?.cells.some((cell) => cell === null)).toBe(true)

    const last = buildYearInfo(9999)
    expect(last.months[11]?.cells.some((cell) => cell === null)).toBe(true)
  })

  it('rejects out-of-range years', () => {
    expect(() => buildYearInfo(0)).toThrow(RangeError)
    expect(() => buildYearInfo(10000)).toThrow(RangeError)
  })
})

describe('buildDayRange', () => {
  it('returns a contiguous run', () => {
    const range = buildDayRange({ year: 2024, month: 2, day: 27 }, 5)
    expect(range.map((key) => key.day)).toEqual([27, 28, 29, 1, 2])
    expect(range[4]).toEqual({ year: 2024, month: 3, day: 2 })
  })

  it('skips the Gregorian reform gap', () => {
    const range = buildDayRange({ year: 1582, month: 10, day: 3 }, 3)
    expect(range).toEqual([
      { year: 1582, month: 10, day: 3 },
      { year: 1582, month: 10, day: 4 },
      { year: 1582, month: 10, day: 15 }
    ])
  })

  it('returns an empty run for zero and rejects negatives', () => {
    expect(buildDayRange({ year: 2024, month: 1, day: 1 }, 0)).toEqual([])
    expect(() => buildDayRange({ year: 2024, month: 1, day: 1 }, -1)).toThrow(RangeError)
  })

  it('stays cheap for a long run', () => {
    const began = performance.now()
    const range = buildDayRange({ year: 2000, month: 1, day: 1 }, 20000)
    const elapsed = performance.now() - began
    expect(range).toHaveLength(20000)
    expect(isValidDateKey(range[0]!)).toBe(true)
    // A quadratic implementation would blow well past this.
    expect(elapsed).toBeLessThan(1500)
  })
})
