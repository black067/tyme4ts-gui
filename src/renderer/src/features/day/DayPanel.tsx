import { useMemo, type ReactElement } from 'react'
import { buildDayInfo, formatFullDate, weekDayLabel, type DateKey, type DayInfo } from '@core'
import { cx } from '@renderer/components/cx'
import './day-panel.css'

interface DayPanelProps {
  selected: DateKey
}

function Row({ label, value }: { label: string; value: string | null }): ReactElement | null {
  if (!value) return null
  return (
    <div className="day-panel__row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

/**
 * Details for the focused day.
 *
 * Phase 2 fills in the almanac sections (宜忌 / 神煞 / 胎神 …); this version
 * already surfaces everything the month engine derives.
 */
export function DayPanel({ selected }: DayPanelProps): ReactElement {
  const info: DayInfo = useMemo(() => buildDayInfo(selected), [selected])

  const tags = [
    info.term?.name,
    ...info.festivals.map((festival) => festival.name),
    info.holiday ? `${info.holiday.name}(${info.holiday.isWork ? '班' : '休'})` : null
  ].filter((tag): tag is string => typeof tag === 'string')

  return (
    <aside className="day-panel" aria-label="日详情">
      <header className="day-panel__header">
        <p className="day-panel__date">
          {formatFullDate(selected.year, selected.month, selected.day)}
        </p>
        <p className="day-panel__week">星期{weekDayLabel(info.weekDay) || info.weekName}</p>
        <p className="day-panel__lunar">{info.lunar.full}</p>
      </header>

      {tags.length > 0 ? (
        <div className="day-panel__tags">
          {tags.map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <dl className="day-panel__facts">
        <Row label="干支" value={info.ganzhi?.day ?? null} />
        <Row label="生肖" value={info.lunar.zodiac} />
        <Row label="星座" value={info.constellation} />
        <Row label="月相" value={info.phase} />
        <Row
          label="节气"
          value={
            info.currentTerm
              ? `${info.currentTerm.name} 第${info.currentTerm.dayIndex + 1}天`
              : null
          }
        />
      </dl>

      <p className={cx('day-panel__hint')}>黄历详情将在下一阶段接入。</p>
    </aside>
  )
}
