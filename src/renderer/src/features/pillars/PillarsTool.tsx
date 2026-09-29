import { useMemo, useState, type ReactElement } from 'react'
import {
  buildEightChar,
  formatFullDate,
  type DateKey,
  type EightCharResult,
  type PersonGender,
  type PillarInfo
} from '@core'
import { cx } from '@renderer/components/cx'
import { SegmentedControl, type SegmentedOption } from '@renderer/components/SegmentedControl'
import './pillars.css'

const GENDERS: readonly SegmentedOption<PersonGender>[] = [
  { value: 'male', label: '男' },
  { value: 'female', label: '女' }
]

const PILLAR_COLUMNS: ReadonlyArray<{ key: keyof EightCharResult['pillars']; label: string }> = [
  { key: 'year', label: '年柱' },
  { key: 'month', label: '月柱' },
  { key: 'day', label: '日柱' },
  { key: 'hour', label: '时柱' }
]

function hiddenText(pillar: PillarInfo): string {
  if (pillar.hiddenStems.length === 0) return '—'
  return pillar.hiddenStems.map((hidden) => hidden.name).join('')
}

/** The classic 排盘 table: one column per pillar. */
function PillarTable({ result }: { result: EightCharResult }): ReactElement {
  return (
    <div className="chart" role="table" aria-label="四柱">
      <div className="chart__row chart__row--head" role="row">
        <span className="chart__label" role="columnheader" />
        {PILLAR_COLUMNS.map((column) => (
          <span key={column.key} className="chart__head" role="columnheader">
            {column.label}
          </span>
        ))}
      </div>

      <div className="chart__row" role="row">
        <span className="chart__label" role="rowheader">
          干支
        </span>
        {PILLAR_COLUMNS.map((column) => (
          <span key={column.key} className="chart__pillar" role="cell">
            {result.pillars[column.key].name}
          </span>
        ))}
      </div>

      <div className="chart__row" role="row">
        <span className="chart__label" role="rowheader">
          十神
        </span>
        {PILLAR_COLUMNS.map((column) => (
          <span
            key={column.key}
            className={cx(
              'chart__cell',
              result.pillars[column.key].tenStar === '日主' && 'is-day-master'
            )}
            role="cell"
          >
            {result.pillars[column.key].tenStar}
          </span>
        ))}
      </div>

      <div className="chart__row" role="row">
        <span className="chart__label" role="rowheader">
          藏干
        </span>
        {PILLAR_COLUMNS.map((column) => (
          <span key={column.key} className="chart__cell" role="cell">
            {hiddenText(result.pillars[column.key])}
          </span>
        ))}
      </div>

      <div className="chart__row" role="row">
        <span className="chart__label" role="rowheader">
          五行
        </span>
        {PILLAR_COLUMNS.map((column) => (
          <span key={column.key} className="chart__cell" role="cell">
            {result.pillars[column.key].stemElement}
            {result.pillars[column.key].branchElement}
          </span>
        ))}
      </div>

      <div className="chart__row" role="row">
        <span className="chart__label" role="rowheader">
          纳音
        </span>
        {PILLAR_COLUMNS.map((column) => (
          <span key={column.key} className="chart__cell chart__cell--muted" role="cell">
            {result.pillars[column.key].nayin}
          </span>
        ))}
      </div>
    </div>
  )
}

function Elements({ result }: { result: EightCharResult }): ReactElement {
  const total = result.elements.reduce((sum, entry) => sum + entry.count, 0) || 1
  return (
    <div className="elements" aria-label="五行统计">
      {result.elements.map((entry) => (
        <div key={entry.name} className="elements__row">
          <span className="elements__name">{entry.name}</span>
          <span className="elements__bar">
            <span
              className="elements__fill"
              style={{ width: `${Math.round((entry.count / total) * 100)}%` }}
            />
          </span>
          <span className="elements__count">{entry.count}</span>
        </div>
      ))}
    </div>
  )
}

export function PillarsTool({ selected }: { selected: DateKey }): ReactElement {
  const [time, setTime] = useState('14:30')
  const [gender, setGender] = useState<PersonGender>('male')

  const [hour, minute] = useMemo(() => {
    const [rawHour = '14', rawMinute = '30'] = time.split(':')
    return [Number(rawHour), Number(rawMinute)]
  }, [time])

  const outcome = useMemo(
    () => buildEightChar({ key: selected, hour, minute, gender }),
    [selected, hour, minute, gender]
  )

  return (
    <section className="tool" aria-label="八字排盘">
      <header className="tool__header">
        <h2 className="tool__title">八字排盘</h2>
        <span className="tool__meta">
          {formatFullDate(selected.year, selected.month, selected.day)} {time}
        </span>
      </header>

      <div className="tool__pane pillars-form">
        <div className="fields-row">
          <label className="field">
            <span className="field__label">出生时刻</span>
            <input
              className="field__input"
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          </label>
          <SegmentedControl label="性别" value={gender} options={GENDERS} onChange={setGender} />
        </div>
        <p className="tool__note">
          日期取自当前浏览的日期（在月视图中选择）。时柱按 tyme4ts 默认规则换算：23:00–23:59
          出生时，日柱进位到次日（晚子时）。
        </p>
      </div>

      {!outcome.ok ? (
        <p className="tool__error">{outcome.error}</p>
      ) : (
        <>
          <div className="tool__pane">
            <h3 className="tool__subtitle">
              四柱
              <span className="pillars-master">
                日主 {outcome.result.dayMaster.stem}
                {outcome.result.dayMaster.element}
              </span>
            </h3>
            <PillarTable result={outcome.result} />
          </div>

          <div className="tool__columns">
            <div className="tool__pane">
              <h3 className="tool__subtitle">五行统计</h3>
              <Elements result={outcome.result} />
            </div>

            <div className="tool__pane">
              <h3 className="tool__subtitle">起运</h3>
              {outcome.result.childLimit ? (
                <dl className="tool__facts">
                  <div className="almanac-row">
                    <dt>阳顺阴逆</dt>
                    <dd>{outcome.result.childLimit.forward ? '顺行' : '逆行'}</dd>
                  </div>
                  <div className="almanac-row">
                    <dt>起运</dt>
                    <dd>
                      {outcome.result.childLimit.years} 年 {outcome.result.childLimit.months} 个月{' '}
                      {outcome.result.childLimit.days} 天
                    </dd>
                  </div>
                  <div className="almanac-row">
                    <dt>起运时刻</dt>
                    <dd>{outcome.result.childLimit.startText}</dd>
                  </div>
                </dl>
              ) : (
                <p className="tool__note">该日期无法推算起运。</p>
              )}
            </div>
          </div>

          <div className="tool__pane">
            <h3 className="tool__subtitle">大运</h3>
            <div className="decades">
              {outcome.result.decades.map((decade) => (
                <div key={decade.index} className="decade">
                  <span className="decade__age">
                    {decade.startAge}–{decade.endAge} 岁
                  </span>
                  <span className="decade__pillar">{decade.pillar}</span>
                  <span className="decade__ten-star">{decade.tenStar}</span>
                  <span className="decade__year">{decade.startYear} 起</span>
                </div>
              ))}
            </div>
          </div>

          <div className="tool__pane">
            <h3 className="tool__subtitle">流年（起运后）</h3>
            <div className="fortunes">
              {outcome.result.fortunes.map((fortune) => (
                <div key={fortune.year} className="fortune">
                  <span className="fortune__year">{fortune.year}</span>
                  <span className="fortune__pillar">{fortune.pillar}</span>
                  <span className="fortune__ten-star">{fortune.tenStar}</span>
                  <span className="fortune__age">{fortune.age} 岁</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
