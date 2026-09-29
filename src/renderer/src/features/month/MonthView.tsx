import { useMemo, type ReactElement } from 'react'
import {
  SOLAR_YEAR_MAX,
  SOLAR_YEAR_MIN,
  buildMonthGrid,
  daysInMonth,
  dateKeyEquals,
  formatMonthTitle,
  weekdayOrder,
  type DateKey,
  type DaySummary
} from '@core'
import { DayCell } from './DayCell'
import './month-view.css'

interface MonthViewProps {
  selected: DateKey
  today: DateKey
  weekStartsOnMonday: boolean
  onSelect: (key: DateKey) => void
}

/**
 * The landing view: a whole-month grid of weeks.
 *
 * The visible month always follows the selection, so month paging and day
 * picking share a single source of truth.
 */
export function MonthView({
  selected,
  today,
  weekStartsOnMonday,
  onSelect
}: MonthViewProps): ReactElement {
  const grid = useMemo(
    () => buildMonthGrid(selected.year, selected.month, { weekStartsOnMonday }),
    [selected.year, selected.month, weekStartsOnMonday]
  )

  const columns = weekdayOrder(weekStartsOnMonday)
  const monthPrefix = `${String(selected.year).padStart(4, '0')}-${String(selected.month).padStart(2, '0')}`

  const shiftMonth = (delta: number): void => {
    const total = selected.year * 12 + (selected.month - 1) + delta
    const year = Math.floor(total / 12)
    const month = (total % 12) + 1
    if (year < SOLAR_YEAR_MIN || year > SOLAR_YEAR_MAX) return
    onSelect({ year, month, day: Math.min(selected.day, daysInMonth(year, month)) })
  }

  const handleSelect = (summary: DaySummary): void => onSelect(summary.key)

  return (
    <section className="month-view" aria-label="月视图">
      <header className="month-view__toolbar">
        <div className="month-view__nav">
          <button
            type="button"
            className="icon-button"
            onClick={() => shiftMonth(-1)}
            aria-label="上一个月"
          >
            ‹
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => shiftMonth(1)}
            aria-label="下一个月"
          >
            ›
          </button>
        </div>

        <h2 className="month-view__title">{formatMonthTitle(grid.year, grid.month)}</h2>

        <button
          type="button"
          className="text-button"
          onClick={() => onSelect(today)}
          disabled={dateKeyEquals(selected, today)}
        >
          回到今天
        </button>
      </header>

      <div className="month-view__weekdays">
        {columns.map((label) => (
          <span
            key={label}
            className={
              label === '日' || label === '六'
                ? 'month-view__weekday is-weekend'
                : 'month-view__weekday'
            }
          >
            {label}
          </span>
        ))}
      </div>

      <div
        className="month-view__grid"
        style={{ gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))` }}
      >
        {grid.cells.map((cell, index) =>
          cell === null ? (
            // A date outside tyme4ts's representable range (before year 1 or
            // after 9999). Kept as a placeholder so the grid stays rectangular.
            <div key={`empty-${index}`} className="day-cell day-cell--empty" aria-hidden="true" />
          ) : (
            <DayCell
              key={cell.iso}
              summary={cell}
              inMonth={cell.iso.startsWith(monthPrefix)}
              isToday={dateKeyEquals(cell.key, today)}
              isSelected={dateKeyEquals(cell.key, selected)}
              onSelect={handleSelect}
            />
          )
        )}
      </div>
    </section>
  )
}
