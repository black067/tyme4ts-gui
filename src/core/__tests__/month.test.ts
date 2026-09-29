import { describe, expect, it } from 'vitest'
import { buildMonthGrid, monthBounds } from '../month'
import { dayCellText } from '../format'

describe('buildMonthGrid', () => {
  it('lays February 2024 out as five Sunday-first weeks', () => {
    const grid = buildMonthGrid(2024, 2)
    expect(grid.rows).toBe(5)
    expect(grid.cells).toHaveLength(35)
    expect(grid.weekStart).toBe(0)
    // Sunday-first: the first cell is Sunday 2024-01-28.
    expect(grid.cells[0]?.iso).toBe('2024-01-28')
    expect(grid.cells[0]?.weekDay).toBe(0)
    expect(grid.cells[34]?.iso).toBe('2024-03-02')
  })

  it('shifts to Monday-first when asked', () => {
    const grid = buildMonthGrid(2024, 2, { weekStartsOnMonday: true })
    expect(grid.weekStart).toBe(1)
    expect(grid.cells[0]?.iso).toBe('2024-01-29')
    expect(grid.cells[0]?.weekDay).toBe(1)
    expect(grid.cells[6]?.weekDay).toBe(0)
  })

  it('reports six weeks when the month needs them', () => {
    // 2023-07-01 is a Saturday, so a 31-day month spans 6 rows (6 + 31 = 37 cells).
    const grid = buildMonthGrid(2023, 7)
    expect(grid.rows).toBe(6)
    expect(grid.cells).toHaveLength(42)
    expect(grid.cells[0]?.iso).toBe('2023-06-25')
    expect(grid.cells[0]?.weekDay).toBe(0)
  })

  it('keeps every cell inside a single 7-column row ordering', () => {
    const grid = buildMonthGrid(2024, 6)
    for (let index = 0; index < grid.cells.length; index += 1) {
      const cell = grid.cells[index]
      if (!cell) continue
      expect(cell.weekDay).toBe((grid.weekStart + index) % 7)
    }
  })

  it('skips the ten days of the 1582 Gregorian reform', () => {
    const grid = buildMonthGrid(1582, 10)
    const isos = grid.cells.map((cell) => cell?.iso ?? null)
    expect(isos).toContain('1582-10-04')
    expect(isos).toContain('1582-10-15')
    for (const skipped of ['1582-10-05', '1582-10-10', '1582-10-14']) {
      expect(isos).not.toContain(skipped)
    }
  })

  it('renders empty cells instead of throwing past the range ends', () => {
    // 0001-01-01 is a Saturday, so a Sunday-first grid reaches back into year 0.
    const low = buildMonthGrid(1, 1)
    expect(low.rows).toBe(6)
    expect(low.cells).toHaveLength(42)
    expect(low.cells.slice(0, 6).every((cell) => cell === null)).toBe(true)
    expect(low.cells[6]?.iso).toBe('0001-01-01')
    // 36 representable cells: all of January plus the first five days of February.
    expect(low.cells.filter((cell) => cell !== null)).toHaveLength(36)

    // 9999-12-31 is a Friday, so a Sunday-first grid spills into year 10000.
    const high = buildMonthGrid(9999, 12)
    expect(high.cells.at(-1)).toBeNull()
    expect(high.cells.filter((cell) => cell !== null)).toHaveLength(34)
  })

  it('renders empty cells for a Monday-first year 1 January as well', () => {
    const grid = buildMonthGrid(1, 1, { weekStartsOnMonday: true })
    expect(grid.cells).toHaveLength(42)
    expect(grid.cells.slice(0, 5).every((cell) => cell === null)).toBe(true)
    expect(grid.cells[5]?.iso).toBe('0001-01-01')
    expect(grid.cells.filter((cell) => cell !== null)).toHaveLength(37)
  })

  it('rejects out-of-range input', () => {
    expect(() => buildMonthGrid(0, 1)).toThrow(RangeError)
    expect(() => buildMonthGrid(10000, 1)).toThrow(RangeError)
    expect(() => buildMonthGrid(2024, 0)).toThrow(RangeError)
    expect(() => buildMonthGrid(2024, 13)).toThrow(RangeError)
    expect(() => buildMonthGrid(2024.5, 6)).toThrow(RangeError)
  })
})

describe('monthBounds', () => {
  it('returns the first and last day', () => {
    expect(monthBounds(2024, 2)).toEqual({
      first: { year: 2024, month: 2, day: 1 },
      last: { year: 2024, month: 2, day: 29 }
    })
    expect(monthBounds(2023, 2).last.day).toBe(28)
  })
})

describe('dayCellText', () => {
  const find = (year: number, month: number, day: number) => {
    const grid = buildMonthGrid(year, month)
    const cell = grid.cells.find(
      (candidate) =>
        candidate?.key.day === day &&
        candidate.iso.startsWith(`${year}-${String(month).padStart(2, '0')}`)
    )
    if (!cell) throw new Error(`cell ${year}-${month}-${day} not found`)
    return cell
  }

  it('prints the month name on the first day of a lunar month', () => {
    expect(dayCellText(find(2024, 2, 10))).toEqual({
      primary: '正月',
      secondary: '春节',
      tone: 'festival'
    })
  })

  it('prints the term name on a term day, ahead of the holiday badge', () => {
    // 2024-02-04 is both 立春 and a 春节 调休 workday; the term wins the line.
    expect(dayCellText(find(2024, 2, 4))).toEqual({
      primary: '廿五',
      secondary: '立春',
      tone: 'term'
    })
  })

  it('prints the lunar day name on an ordinary day', () => {
    const text = dayCellText(find(2024, 3, 6))
    expect(text.primary).toBe('廿六')
    expect(text).toEqual({ primary: '廿六', secondary: null, tone: 'plain' })
  })

  it('falls back to the statutory holiday name', () => {
    const text = dayCellText(find(2024, 2, 13))
    expect(text.secondary).toBe('春节')
    expect(text.tone).toBe('holiday')
  })
})
