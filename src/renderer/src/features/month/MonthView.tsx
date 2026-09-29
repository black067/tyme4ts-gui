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
import { useMessages } from '@renderer/i18n'
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
  const t = useMessages()
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

  // Weekend shading keys off the weekday index, not the rendered label: the
  // labels come from the engine and would silently stop matching if they ever
  // changed. `weekdayOrder` yields columns in display order, so a column's
  // weekday index depends on which day the week starts on — Sunday is 0 when
  // the week starts on Sunday, and 6 when it starts on Monday.
  const columns = weekdayOrder(weekStartsOnMonday).map((label, columnIndex) => {
    const weekdayIndex = weekStartsOnMonday ? (columnIndex + 1) % 7 : columnIndex
    return { label, isWeekend: weekdayIndex === 0 || weekdayIndex === 6 }
  })
  const monthPrefix = `${String(selected.year).padStart(4, '0')}-${String(selected.month).padStart(2, '0')}`

  const handleSelect = (summary: DaySummary): void => onSelect(summary.key)

  return (
    <section className="month-view" aria-label={t.month.title}>
      <header className="month-view__toolbar">
        <div className="month-view__nav">
          <button
            type="button"
            className="icon-button"
            onClick={() => onSelect(addMonths(selected, -1))}
            aria-label={t.month.prevMonth}
          >
            ‹
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => onSelect(addMonths(selected, 1))}
            aria-label={t.month.nextMonth}
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
          {t.month.goToday}
        </button>
      </header>

      <div className="month-view__weekdays" aria-hidden="true">
        {columns.map((column) => (
          <span
            key={column.label}
            className={column.isWeekend ? 'month-view__weekday is-weekend' : 'month-view__weekday'}
          >
            {column.label}
          </span>
        ))}
      </div>

      <div
        className="month-view__grid"
        role="grid"
        aria-label={t.month.gridLabel({
          year: grid.year,
          month: grid.month,
          weeks: rows.length
        })}
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
