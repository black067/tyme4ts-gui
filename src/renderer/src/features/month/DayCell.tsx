import { memo, type ReactElement } from 'react'
import { dayCellText, describeDay, type DaySummary } from '@core'
import { cx } from '@renderer/components/cx'
import { useMessages } from '@renderer/i18n'

interface DayCellProps {
  summary: DaySummary
  /** False for the leading/trailing days borrowed from the neighbouring months. */
  inMonth: boolean
  isToday: boolean
  isSelected: boolean
  onSelect: (summary: DaySummary) => void
}

/**
 * One calendar cell.
 *
 * Memoized because a selection change re-renders the grid: without this, all
 * 42 cells would rebuild their `dayCellText` on every arrow-key press.
 */
function DayCellImpl({
  summary,
  inMonth,
  isToday,
  isSelected,
  onSelect
}: DayCellProps): ReactElement {
  const t = useMessages()
  const text = dayCellText(summary)
  const holidayBadge = summary.holiday
    ? summary.holiday.isWork
      ? t.dayCell.workBadge
      : t.dayCell.restBadge
    : null

  return (
    <button
      type="button"
      role="gridcell"
      className={cx(
        'day-cell',
        `day-cell--${text.tone}`,
        !inMonth && 'day-cell--outside',
        summary.isWeekend && 'day-cell--weekend',
        isToday && 'day-cell--today',
        isSelected && 'day-cell--selected'
      )}
      onClick={() => onSelect(summary)}
      aria-label={describeDay(summary)}
      aria-selected={isSelected}
      aria-current={isToday ? 'date' : undefined}
      tabIndex={isSelected ? 0 : -1}
    >
      <span className="day-cell__corner">{holidayBadge}</span>
      <span className="day-cell__solar">{summary.key.day}</span>
      <span className="day-cell__lunar">{text.primary}</span>
      <span className="day-cell__note">{text.secondary}</span>
    </button>
  )
}

export const DayCell = memo(DayCellImpl)
