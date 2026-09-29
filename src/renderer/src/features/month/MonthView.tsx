import { useMemo, type ReactElement } from 'react'
import {
  addMonths,
  buildMonthGrid,
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

  const rows = useMemo(() => {
    const chunks: Array<Array<DaySummary | null>> = []
    for (let index = 0; index < grid.cells.length; index += 7) {
      chunks.push(grid.cells.slice(index, index + 7))
    }
    return chunks
  }, [grid.cells])

  const columns = weekdayOrder(weekStartsOnMonday)
  const monthPrefix = `${String(selected.year).padStart(4, '0')}-${String(selected.month).padStart(2, '0')}`

  const handleSelect = (summary: DaySummary): void => onSelect(summary.key)

  return (
    <section className="month-view" aria-label="月视图">
      <header className="month-view__toolbar">
        <div className="month-view__nav">
          <button
            type="button"
            className="icon-button"
            onClick={() => onSelect(addMonths(selected, -1))}
            aria-label="上一个月"
          >
            ‹
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => onSelect(addMonths(selected, 1))}
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

      <div className="month-view__weekdays" aria-hidden="true">
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
        role="grid"
        aria-label={`${grid.year}年${grid.month}月，共 ${rows.length} 周`}
      >
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="month-view__row" role="row">
            {row.map((cell, columnIndex) =>
              cell === null ? (
                // A date outside tyme4ts's representable range (before year 1
                // or after 9999). Kept as a placeholder so the grid stays
                // rectangular, but not rendered as a grid cell.
                <span
                  key={`empty-${rowIndex}-${columnIndex}`}
                  className="day-cell day-cell--empty"
                  aria-hidden="true"
                />
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
        ))}
      </div>
    </section>
  )
}
