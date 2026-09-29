import type { DaySummary } from './types'

/** 0 = Sunday … 6 = Saturday, matching tyme4ts's `Week.getIndex()`. */
export const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'] as const

export type DayCellTone = 'plain' | 'term' | 'festival' | 'holiday'

export interface DayCellText {
  /** 初一 shows the month name (`正月`, `闰四月`), every other day its own name. */
  primary: string
  /** Solar term, then festival, then statutory holiday — whichever comes first. */
  secondary: string | null
  tone: DayCellTone
}

/**
 * Chooses what a calendar cell prints. Kept in the engine so the priority rules
 * are unit-testable instead of buried in JSX.
 */
export function dayCellText(summary: DaySummary): DayCellText {
  const primary = summary.lunar.dayName === '初一' ? summary.lunar.monthName : summary.lunar.dayName

  if (summary.term) return { primary, secondary: summary.term.name, tone: 'term' }

  const festival = summary.festivals[0]
  if (festival) return { primary, secondary: festival.name, tone: 'festival' }

  if (summary.holiday) return { primary, secondary: summary.holiday.name, tone: 'holiday' }

  return { primary, secondary: null, tone: 'plain' }
}

export function weekDayLabel(weekDay: number): string {
  return WEEKDAY_LABELS[weekDay] ?? ''
}

const MONDAY_FIRST_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const

/** Weekday column headers in the same order the grid lays its columns out. */
export function weekdayOrder(weekStartsOnMonday: boolean): readonly string[] {
  return weekStartsOnMonday ? MONDAY_FIRST_LABELS : WEEKDAY_LABELS
}

export function formatMonthTitle(year: number, month: number): string {
  return `${year}年${month}月`
}

export function formatFullDate(year: number, month: number, day: number): string {
  return `${year}年${month}月${day}日`
}

/** Screen-reader label for a calendar cell, suitable for `aria-label`. */
export function describeDay(summary: DaySummary): string {
  const parts = [
    formatFullDate(summary.key.year, summary.key.month, summary.key.day),
    `星期${summary.weekName}`,
    summary.lunar.full
  ]
  if (summary.term) parts.push(summary.term.name)
  for (const festival of summary.festivals) parts.push(festival.name)
  if (summary.holiday) {
    parts.push(`${summary.holiday.name}${summary.holiday.isWork ? '调休上班' : '放假'}`)
  }
  return parts.join(' ')
}
