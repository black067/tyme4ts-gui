import { describe, expect, it } from 'vitest'
import {
  compareDateKey,
  dateKeyEquals,
  daysInMonth,
  formatSolarDate,
  fromIsoDate,
  isLeapYear,
  isValidDateKey,
  toIsoDate,
  weekDayIndex
} from '../date-key'

describe('isLeapYear', () => {
  it('uses the Julian rule before 1600', () => {
    expect(isLeapYear(1500)).toBe(true)
    expect(isLeapYear(1501)).toBe(false)
  })

  it('uses the Gregorian rule from 1600 on', () => {
    expect(isLeapYear(1600)).toBe(true)
    expect(isLeapYear(1700)).toBe(false)
    expect(isLeapYear(2000)).toBe(true)
    expect(isLeapYear(2024)).toBe(true)
    expect(isLeapYear(2100)).toBe(false)
  })
})

describe('daysInMonth', () => {
  it('handles month lengths and leap Februaries', () => {
    expect(daysInMonth(2024, 2)).toBe(29)
    expect(daysInMonth(2023, 2)).toBe(28)
    expect(daysInMonth(2024, 4)).toBe(30)
    expect(daysInMonth(2024, 12)).toBe(31)
  })

  it('returns 0 for an out-of-range month', () => {
    expect(daysInMonth(2024, 0)).toBe(0)
    expect(daysInMonth(2024, 13)).toBe(0)
  })
})

describe('isValidDateKey', () => {
  it('accepts ordinary dates across the supported range', () => {
    expect(isValidDateKey({ year: 1, month: 1, day: 1 })).toBe(true)
    expect(isValidDateKey({ year: 2024, month: 2, day: 29 })).toBe(true)
    expect(isValidDateKey({ year: 9999, month: 12, day: 31 })).toBe(true)
  })

  it('rejects dates tyme4ts cannot represent', () => {
    expect(isValidDateKey({ year: 10000, month: 1, day: 1 })).toBe(false)
    expect(isValidDateKey({ year: 0, month: 1, day: 1 })).toBe(false)
    expect(isValidDateKey({ year: 2023, month: 2, day: 30 })).toBe(false)
    expect(isValidDateKey({ year: 2023, month: 2, day: 29 })).toBe(false)
    expect(isValidDateKey({ year: 2024, month: 13, day: 1 })).toBe(false)
    expect(isValidDateKey({ year: 2024, month: 1.5, day: 1 })).toBe(false)
  })

  it('rejects the ten days the Gregorian reform skipped', () => {
    expect(isValidDateKey({ year: 1582, month: 10, day: 4 })).toBe(true)
    expect(isValidDateKey({ year: 1582, month: 10, day: 5 })).toBe(false)
    expect(isValidDateKey({ year: 1582, month: 10, day: 14 })).toBe(false)
    expect(isValidDateKey({ year: 1582, month: 10, day: 15 })).toBe(true)
  })
})

describe('toIsoDate / fromIsoDate', () => {
  it('zero-pads to a sortable key', () => {
    expect(toIsoDate({ year: 1, month: 2, day: 3 })).toBe('0001-02-03')
    expect(toIsoDate({ year: 2024, month: 12, day: 31 })).toBe('2024-12-31')
  })

  it('round-trips valid keys', () => {
    const key = { year: 2024, month: 2, day: 10 }
    expect(fromIsoDate(toIsoDate(key))).toEqual(key)
    expect(dateKeyEquals(fromIsoDate('2024-02-10')!, key)).toBe(true)
  })

  it('returns null for malformed or impossible input', () => {
    expect(fromIsoDate('2024-2-10')).toBeNull()
    expect(fromIsoDate('not-a-date')).toBeNull()
    expect(fromIsoDate('2023-02-30')).toBeNull()
    expect(fromIsoDate('1582-10-10')).toBeNull()
  })
})

describe('compareDateKey', () => {
  it('orders by year, then month, then day', () => {
    expect(
      compareDateKey({ year: 2024, month: 2, day: 10 }, { year: 2024, month: 2, day: 10 })
    ).toBe(0)
    expect(
      compareDateKey({ year: 2024, month: 2, day: 9 }, { year: 2024, month: 2, day: 10 })
    ).toBe(-1)
    expect(
      compareDateKey({ year: 2025, month: 1, day: 1 }, { year: 2024, month: 12, day: 31 })
    ).toBe(1)
    expect(
      compareDateKey({ year: 2024, month: 3, day: 1 }, { year: 2024, month: 2, day: 30 })
    ).toBe(1)
  })
})

describe('engine-backed helpers', () => {
  it('formats a solar date through tyme4ts', () => {
    expect(formatSolarDate({ year: 2024, month: 2, day: 10 })).toBe('2024年2月10日')
    expect(formatSolarDate({ year: 1582, month: 10, day: 15 })).toBe('1582年10月15日')
  })

  it('reports week days with 0 = Sunday, matching tyme4ts', () => {
    expect(weekDayIndex({ year: 2024, month: 2, day: 11 })).toBe(0)
    expect(weekDayIndex({ year: 2024, month: 2, day: 10 })).toBe(6)
    expect(weekDayIndex({ year: 2023, month: 10, day: 31 })).toBe(2)
  })
})
