import { useMemo, type ReactElement } from 'react'
import {
  SOLAR_YEAR_MAX,
  SOLAR_YEAR_MIN,
  buildYearInfo,
  dateKeyEquals,
  dayCellText,
  weekdayOrder,
  type DateKey,
  type DaySummary,
  type YearInfo
} from '@core'
import { cx } from '@renderer/components/cx'
import { TermTip } from '@renderer/components/TermTip'
import './year-view.css'

interface YearViewProps {
  selected: DateKey
  today: DateKey
  weekStartsOnMonday: boolean
  onSelect: (key: DateKey) => void
  onOpenMonth: (year: number, month: number) => void
}

/** A single day inside a mini month: just the number plus a state tint. */
function MiniDay({
  summary,
  inMonth,
  isToday,
  isSelected,
  onSelect
}: {
  summary: DaySummary
  inMonth: boolean
  isToday: boolean
  isSelected: boolean
  onSelect: (key: DateKey) => void
}): ReactElement {
  const text = dayCellText(summary)
  return (
    <button
      type="button"
      className={cx(
        'mini-day',
        `mini-day--${text.tone}`,
        !inMonth && 'is-outside',
        summary.isWeekend && 'is-weekend',
        summary.holiday && 'is-holiday',
        isToday && 'is-today',
        isSelected && 'is-selected'
      )}
      title={`${summary.iso} ${summary.lunar.full}${text.secondary ? ` ${text.secondary}` : ''}`}
      aria-label={`${summary.iso} ${summary.lunar.full}`}
      onClick={() => onSelect(summary.key)}
    >
      {summary.key.day}
    </button>
  )
}

function MiniMonth({
  year,
  month,
  rows,
  cells,
  weekStartsOnMonday,
  today,
  selected,
  onSelect,
  onOpenMonth
}: {
  year: number
  month: number
  rows: number
  cells: Array<DaySummary | null>
  weekStartsOnMonday: boolean
  today: DateKey
  selected: DateKey
  onSelect: (key: DateKey) => void
  onOpenMonth: (year: number, month: number) => void
}): ReactElement {
  const columns = weekdayOrder(weekStartsOnMonday)
  const prefix = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`

  return (
    <section className="mini-month" aria-label={`${year}年${month}月`}>
      <header className="mini-month__header">
        <span className="mini-month__title">{month}月</span>
        <button
          type="button"
          className="mini-month__open"
          onClick={() => onOpenMonth(year, month)}
          aria-label={`在月视图中打开${year}年${month}月`}
        >
          展开
        </button>
      </header>

      <div className="mini-month__weekdays">
        {columns.map((label) => (
          <span key={label} className="mini-month__weekday">
            {label}
          </span>
        ))}
      </div>

      <div className="mini-month__grid" style={{ gridTemplateRows: `repeat(${rows}, 1fr)` }}>
        {cells.map((cell, index) =>
          cell === null ? (
            <span
              key={`empty-${month}-${index}`}
              className="mini-day is-empty"
              aria-hidden="true"
            />
          ) : (
            <MiniDay
              key={cell.iso}
              summary={cell}
              inMonth={cell.iso.startsWith(prefix)}
              isToday={dateKeyEquals(cell.key, today)}
              isSelected={dateKeyEquals(cell.key, selected)}
              onSelect={onSelect}
            />
          )
        )}
      </div>
    </section>
  )
}

function TermList({ year }: { year: YearInfo }): ReactElement {
  return (
    <section className="year-panel">
      <h3 className="year-panel__title">二十四节气</h3>
      <ul className="term-list">
        {year.terms.map((term) => (
          <li key={`${term.month}-${term.day}-${term.name}`} className="term-list__item">
            <span className="term-list__name">
              <TermTip family="term" name={term.name} />
            </span>
            <span className="term-list__date">
              {term.month}月{term.day}日
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function HolidayList({ year }: { year: YearInfo }): ReactElement {
  if (year.holidays.length === 0) {
    return (
      <section className="year-panel">
        <h3 className="year-panel__title">法定假日</h3>
        <p className="year-panel__note">
          tyme4ts 内置的法定假日数据覆盖 2001-12-29 至 2026-10-10，该年份不在范围内。
        </p>
      </section>
    )
  }

  const rest = year.holidays.filter((entry) => !entry.isWork).length
  const work = year.holidays.length - rest

  return (
    <section className="year-panel">
      <h3 className="year-panel__title">
        法定假日
        <span className="year-panel__badge">
          休 {rest} 天 · 班 {work} 天
        </span>
      </h3>
      <ul className="holiday-list">
        {year.holidays.map((entry) => (
          <li key={`${entry.month}-${entry.day}`} className="holiday-list__item">
            <span className={cx('holiday-list__tag', entry.isWork ? 'is-work' : 'is-rest')}>
              {entry.isWork ? '班' : '休'}
            </span>
            <span className="holiday-list__date">
              {entry.month}月{entry.day}日
            </span>
            <span className="holiday-list__name">{entry.name}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function YearView({
  selected,
  today,
  weekStartsOnMonday,
  onSelect,
  onOpenMonth
}: YearViewProps): ReactElement {
  const year = useMemo(
    () => buildYearInfo(selected.year, { weekStartsOnMonday }),
    [selected.year, weekStartsOnMonday]
  )

  const shiftYear = (delta: number): void => {
    const next = selected.year + delta
    if (next < SOLAR_YEAR_MIN || next > SOLAR_YEAR_MAX) return
    onSelect({ ...selected, year: next })
  }

  return (
    <section className="year-view" aria-label="年视图">
      <header className="year-view__toolbar">
        <div className="month-view__nav">
          <button
            type="button"
            className="icon-button"
            onClick={() => shiftYear(-1)}
            aria-label="上一年"
          >
            ‹
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => shiftYear(1)}
            aria-label="下一年"
          >
            ›
          </button>
        </div>
        <h2 className="year-view__title">{year.year}年</h2>
        <span className="year-view__meta">共 {year.dayCount} 天</span>
        <button
          type="button"
          className="text-button"
          onClick={() => onSelect(today)}
          disabled={selected.year === today.year}
        >
          回到今年
        </button>
      </header>

      <div className="year-view__body">
        <div className="year-view__months">
          {year.months.map((month) => (
            <MiniMonth
              key={month.month}
              year={year.year}
              month={month.month}
              rows={month.rows}
              cells={month.cells}
              weekStartsOnMonday={weekStartsOnMonday}
              today={today}
              selected={selected}
              onSelect={onSelect}
              onOpenMonth={onOpenMonth}
            />
          ))}
        </div>

        <aside className="year-view__side">
          <TermList year={year} />
          <HolidayList year={year} />
        </aside>
      </div>
    </section>
  )
}
