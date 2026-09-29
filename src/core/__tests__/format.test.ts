import { describe, expect, it } from 'vitest'
import { buildDaySummary } from '../day'
import type { DateKey } from '../date-key'
import {
  describeDay,
  formatFullDate,
  formatMonthTitle,
  weekDayLabel,
  weekdayOrder
} from '../format'

const key = (year: number, month: number, day: number): DateKey => ({ year, month, day })

describe('weekdayOrder', () => {
  it('starts with Sunday by default', () => {
    expect(weekdayOrder(false)).toEqual(['日', '一', '二', '三', '四', '五', '六'])
  })

  it('rotates to Monday-first when asked', () => {
    expect(weekdayOrder(true)).toEqual(['一', '二', '三', '四', '五', '六', '日'])
  })
})

describe('weekDayLabel', () => {
  it('maps the tyme4ts week index', () => {
    expect(weekDayLabel(0)).toBe('日')
    expect(weekDayLabel(6)).toBe('六')
  })

  it('returns an empty string for an out-of-range index', () => {
    expect(weekDayLabel(9)).toBe('')
    expect(weekDayLabel(-1)).toBe('')
  })
})

describe('titles', () => {
  it('formats month and full dates', () => {
    expect(formatMonthTitle(2026, 9)).toBe('2026年9月')
    expect(formatFullDate(2026, 9, 29)).toBe('2026年9月29日')
  })
})

describe('describeDay', () => {
  it('combines date, week and lunar information', () => {
    expect(describeDay(buildDaySummary(key(2024, 2, 12)))).toBe(
      '2024年2月12日 星期一 农历甲辰年正月初三 春节放假'
    )
  })

  it('includes the solar term on a term day', () => {
    expect(describeDay(buildDaySummary(key(2024, 2, 4)))).toContain('立春')
    expect(describeDay(buildDaySummary(key(2024, 2, 4)))).toContain('调休上班')
  })

  it('stays minimal on an ordinary day', () => {
    expect(describeDay(buildDaySummary(key(2024, 3, 6)))).toBe(
      '2024年3月6日 星期三 农历甲辰年正月廿六'
    )
  })
})
