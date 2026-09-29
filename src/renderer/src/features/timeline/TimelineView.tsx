import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
// TanStack Virtual returns functions from its hook, which React Compiler cannot
// memoize. We do not enable the compiler, so opting this file out of the check
// keeps the warning out of the lint output without hiding a real problem.
/* eslint-disable react-hooks/incompatible-library */
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  addDays,
  buildDayInfo,
  buildDayRange,
  dateKeyEquals,
  formatFullDate,
  weekDayLabel,
  type DateKey,
  type DayInfo
} from '@core'
import { cx } from '@renderer/components/cx'
import { useMessages } from '@renderer/i18n'
import './timeline-view.css'

/** Half-window in days; roughly ±20 years around the anchor. */
const SPAN = 3650
const ROW_HEIGHT = 152

interface TimelineViewProps {
  selected: DateKey
  today: DateKey
  onSelect: (key: DateKey) => void
}

function Chips({ items, limit }: { items: string[] | null; limit: number }): ReactElement | null {
  if (items === null || items.length === 0) return null
  const shown = items.slice(0, limit)
  const hidden = items.length - shown.length
  return (
    <span className="timeline-row__chips">
      {shown.map((item) => (
        <span key={item} className="timeline-row__chip">
          {item}
        </span>
      ))}
      {hidden > 0 ? <span className="timeline-row__more">+{hidden}</span> : null}
    </span>
  )
}

function TimelineRow({
  info,
  isToday,
  isSelected,
  onSelect
}: {
  info: DayInfo
  isToday: boolean
  isSelected: boolean
  onSelect: (key: DateKey) => void
}): ReactElement {
  const t = useMessages()
  const holiday = info.holiday
  return (
    <article className={cx('timeline-row', isToday && 'is-today', isSelected && 'is-selected')}>
      <button
        type="button"
        className="timeline-row__date"
        onClick={() => onSelect(info.key)}
        aria-current={isToday ? 'date' : undefined}
      >
        <span className="timeline-row__day">{info.key.day}</span>
        <span className="timeline-row__month">
          {t.timeline.monthWithWeekday({
            month: info.key.month,
            weekday: weekDayLabel(info.weekDay) || info.weekName
          })}
        </span>
        <span className="timeline-row__lunar">{info.lunar.full}</span>
      </button>

      <div className="timeline-row__body">
        <div className="timeline-row__headline">
          {info.term ? <span className="timeline-row__term">{info.term.name}</span> : null}
          {info.festivals.map((festival) => (
            <span key={festival.name} className="timeline-row__festival">
              {festival.name}
            </span>
          ))}
          {holiday ? (
            <span className={cx('timeline-row__holiday', holiday.isWork ? 'is-work' : 'is-rest')}>
              {holiday.name}
              {holiday.isWork ? t.timeline.holidayWork : t.timeline.holidayRest}
            </span>
          ) : null}
          {info.ganzhi ? (
            <span className="timeline-row__pillars">
              {info.ganzhi.year} {info.ganzhi.month} {info.ganzhi.day}
            </span>
          ) : null}
        </div>

        <div className="timeline-row__tabs">
          <span className="timeline-row__label timeline-row__label--luck">
            {t.timeline.recommends}
          </span>
          <Chips items={info.recommends} limit={6} />
        </div>
        <div className="timeline-row__tabs">
          <span className="timeline-row__label timeline-row__label--avoid">
            {t.timeline.avoids}
          </span>
          <Chips items={info.avoids} limit={6} />
        </div>
      </div>
    </article>
  )
}

/**
 * A continuous, virtualized stream of day details.
 *
 * The window is anchored when the view mounts, so the selected day is always
 * centred and reachable; "回到今天" re-anchors to today.
 */
export function TimelineView({ selected, today, onSelect }: TimelineViewProps): ReactElement {
  const t = useMessages()
  const [anchor, setAnchor] = useState<DateKey>(selected)
  const scrollerRef = useRef<HTMLDivElement>(null)

  const keys = useMemo(() => buildDayRange(addDays(anchor, -SPAN), SPAN * 2 + 1), [anchor])

  const virtualizer = useVirtualizer({
    count: keys.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 4
  })

  // Centre the initial position on the anchor.
  useEffect(() => {
    virtualizer.scrollToIndex(SPAN, { align: 'center' })
  }, [virtualizer, anchor])

  const todayIndex = useMemo(
    () => keys.findIndex((key) => dateKeyEquals(key, today)),
    [keys, today]
  )

  return (
    <section className="timeline-view" aria-label={t.timeline.title}>
      <header className="timeline-view__toolbar">
        <h2 className="timeline-view__title">{t.timeline.title}</h2>
        <span className="timeline-view__meta">
          {t.timeline.span({
            from: formatFullDate(keys[0]?.year ?? 0, keys[0]?.month ?? 1, keys[0]?.day ?? 1),
            days: keys.length
          })}
        </span>
        {todayIndex >= 0 ? (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              virtualizer.scrollToIndex(todayIndex, { align: 'center' })
              onSelect(today)
            }}
          >
            {t.timeline.goToday}
          </button>
        ) : (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setAnchor(today)
              onSelect(today)
            }}
          >
            {t.timeline.goToday}
          </button>
        )}
      </header>

      <div className="timeline-view__scroller" ref={scrollerRef}>
        <div className="timeline-view__track" style={{ height: `${virtualizer.getTotalSize()}px` }}>
          {virtualizer.getVirtualItems().map((item) => {
            const key = keys[item.index]
            if (!key) return null
            return (
              <div
                key={item.key}
                className="timeline-view__item"
                style={{
                  height: `${item.size}px`,
                  transform: `translateY(${item.start}px)`
                }}
              >
                <TimelineRow
                  info={buildDayInfo(key)}
                  isToday={dateKeyEquals(key, today)}
                  isSelected={dateKeyEquals(key, selected)}
                  onSelect={onSelect}
                />
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
