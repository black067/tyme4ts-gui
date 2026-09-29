import { describe, expect, it } from 'vitest'
import { SolarDay } from 'tyme4ts'
import {
  addDays,
  formatSolarDate,
  isValidDateKey,
  nextDay,
  prevDay,
  type DateKey
} from '../date-key'

/** Collects every disagreement instead of failing on the first one. */
function collectMismatches(start: DateKey, steps: number, direction: 1 | -1): string[] {
  const mismatches: string[] = []
  let key = start
  let cursor = SolarDay.fromYmd(start.year, start.month, start.day)
  for (let i = 0; i < steps; i += 1) {
    const mine = formatSolarDate(key)
    const theirs = cursor.toString()
    if (mine !== theirs) mismatches.push(`step ${i}: ours=${mine} tyme4ts=${theirs}`)
    key = direction === 1 ? nextDay(key) : prevDay(key)
    cursor = cursor.next(direction)
  }
  return mismatches
}

describe('pure day stepping', () => {
  it('agrees with tyme4ts going forward over four decades', () => {
    expect(collectMismatches({ year: 1990, month: 1, day: 1 }, 2000, 1)).toEqual([])
  })

  it('agrees with tyme4ts going backward', () => {
    expect(collectMismatches({ year: 2030, month: 12, day: 31 }, 1200, -1)).toEqual([])
  })

  it('crosses the 1582 Gregorian reform gap in both directions', () => {
    expect(nextDay({ year: 1582, month: 10, day: 4 })).toEqual({
      year: 1582,
      month: 10,
      day: 15
    })
    expect(prevDay({ year: 1582, month: 10, day: 15 })).toEqual({
      year: 1582,
      month: 10,
      day: 4
    })
    // The ten skipped days are unreachable and never produced.
    expect(isValidDateKey({ year: 1582, month: 10, day: 10 })).toBe(false)
    expect(collectMismatches({ year: 1582, month: 9, day: 1 }, 90, 1)).toEqual([])
  })

  it('rolls over month, year and leap-day boundaries', () => {
    expect(nextDay({ year: 2024, month: 2, day: 28 })).toEqual({ year: 2024, month: 2, day: 29 })
    expect(nextDay({ year: 2024, month: 2, day: 29 })).toEqual({ year: 2024, month: 3, day: 1 })
    expect(nextDay({ year: 2023, month: 2, day: 28 })).toEqual({ year: 2023, month: 3, day: 1 })
    expect(nextDay({ year: 2024, month: 12, day: 31 })).toEqual({ year: 2025, month: 1, day: 1 })
    expect(prevDay({ year: 2024, month: 3, day: 1 })).toEqual({ year: 2024, month: 2, day: 29 })
    expect(prevDay({ year: 2024, month: 1, day: 1 })).toEqual({ year: 2023, month: 12, day: 31 })
  })

  it('steps by arbitrary deltas and is reversible', () => {
    const start: DateKey = { year: 2024, month: 2, day: 10 }
    expect(addDays(start, 0)).toEqual(start)
    expect(addDays(start, 31)).toEqual({ year: 2024, month: 3, day: 12 })
    expect(addDays(addDays(start, 400), -400)).toEqual(start)
    expect(addDays(addDays(start, -400), 400)).toEqual(start)
  })

  it('produces unrepresentable keys past the range ends rather than throwing', () => {
    // Callers decide what to do; the grid renders these as empty cells.
    expect(isValidDateKey(prevDay({ year: 1, month: 1, day: 1 }))).toBe(false)
    expect(isValidDateKey(nextDay({ year: 9999, month: 12, day: 31 }))).toBe(false)
  })
})
