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
import { useMessages } from '@renderer/i18n'
import './pillars.css'

type PillarKey = keyof EightCharResult['pillars']

const PILLAR_KEYS: readonly PillarKey[] = ['year', 'month', 'day', 'hour']

function hiddenText(pillar: PillarInfo): string {
  if (pillar.hiddenStems.length === 0) return '—'
  return pillar.hiddenStems.map((hidden) => hidden.name).join('')
}

/** The classic 排盘 table: one column per pillar. */
function PillarTable({ result }: { result: EightCharResult }): ReactElement {
  const t = useMessages()
  const rows = t.pillars.rows
  return (
    <div className="chart" role="table" aria-label={t.pillars.chartLabel}>
      <div className="chart__row chart__row--head" role="row">
        <span className="chart__label" role="columnheader" />
        {PILLAR_KEYS.map((key) => (
          <span key={key} className="chart__head" role="columnheader">
            {t.pillars.columns[key]}
          </span>
        ))}
      </div>

      <div className="chart__row" role="row">
        <span className="chart__label" role="rowheader">
          {rows.cycle}
        </span>
        {PILLAR_KEYS.map((key) => (
          <span key={key} className="chart__pillar" role="cell">
            {result.pillars[key].name}
          </span>
        ))}
      </div>

      <div className="chart__row" role="row">
        <span className="chart__label" role="rowheader">
          {rows.tenStar}
        </span>
        {PILLAR_KEYS.map((key) => (
          <span
            key={key}
            className={cx(
              'chart__cell',
              // `日主` 是「十神」里的一个取值（日柱自身的十神），属于历法数据而非界面文案——
              // 其余十神名也都是引擎给的汉字，所以这里比较它是正确的，不是"拿渲染文本当逻辑"。
              // 见 src/core/pillars.ts 里 PillarInfo.tenStar 的说明。
              result.pillars[key].tenStar === '日主' && 'is-day-master'
            )}
            role="cell"
          >
            {result.pillars[key].tenStar}
          </span>
        ))}
      </div>

      <div className="chart__row" role="row">
        <span className="chart__label" role="rowheader">
          {rows.hiddenStems}
        </span>
        {PILLAR_KEYS.map((key) => (
          <span key={key} className="chart__cell" role="cell">
            {hiddenText(result.pillars[key])}
          </span>
        ))}
      </div>

      <div className="chart__row" role="row">
        <span className="chart__label" role="rowheader">
          {rows.elements}
        </span>
        {PILLAR_KEYS.map((key) => (
          <span key={key} className="chart__cell" role="cell">
            {result.pillars[key].stemElement}
            {result.pillars[key].branchElement}
          </span>
        ))}
      </div>

      <div className="chart__row" role="row">
        <span className="chart__label" role="rowheader">
          {rows.nayin}
        </span>
        {PILLAR_KEYS.map((key) => (
          <span key={key} className="chart__cell chart__cell--muted" role="cell">
            {result.pillars[key].nayin}
          </span>
        ))}
      </div>
    </div>
  )
}

function Elements({ result }: { result: EightCharResult }): ReactElement {
  const t = useMessages()
  const total = result.elements.reduce((sum, entry) => sum + entry.count, 0) || 1
  return (
    <div className="elements" aria-label={t.pillars.elementTally}>
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
  const t = useMessages()
  const [time, setTime] = useState('14:30')
  const [gender, setGender] = useState<PersonGender>('male')

  const genderOptions = useMemo<readonly SegmentedOption<PersonGender>[]>(
    () => [
      { value: 'male', label: t.pillars.male },
      { value: 'female', label: t.pillars.female }
    ],
    [t]
  )

  const [hour, minute] = useMemo(() => {
    const [rawHour = '14', rawMinute = '30'] = time.split(':')
    return [Number(rawHour), Number(rawMinute)]
  }, [time])

  const outcome = useMemo(
    () => buildEightChar({ key: selected, hour, minute, gender }),
    [selected, hour, minute, gender]
  )

  return (
    <section className="tool" aria-label={t.pillars.title}>
      <header className="tool__header">
        <h2 className="tool__title">{t.pillars.title}</h2>
        <span className="tool__meta">
          {formatFullDate(selected.year, selected.month, selected.day)} {time}
        </span>
      </header>

      <div className="tool__pane pillars-form">
        <div className="fields-row">
          <label className="field">
            <span className="field__label">{t.pillars.birthTimeLabel}</span>
            <input
              className="field__input"
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          </label>
          <SegmentedControl
            label={t.pillars.genderLabel}
            value={gender}
            options={genderOptions}
            onChange={setGender}
          />
        </div>
        <p className="tool__note">{t.pillars.ruleNote}</p>
      </div>

      {!outcome.ok ? (
        <p className="tool__error">{outcome.error}</p>
      ) : (
        <>
          <div className="tool__pane">
            <h3 className="tool__subtitle">
              {t.pillars.chartLabel}
              <span className="pillars-master">
                {t.pillars.dayMaster({ stem: outcome.result.dayMaster.stem })}
                {outcome.result.dayMaster.element}
              </span>
            </h3>
            <PillarTable result={outcome.result} />
          </div>

          <div className="tool__columns">
            <div className="tool__pane">
              <h3 className="tool__subtitle">{t.pillars.elementTally}</h3>
              <Elements result={outcome.result} />
            </div>

            <div className="tool__pane">
              <h3 className="tool__subtitle">{t.pillars.childLimit.title}</h3>
              {outcome.result.childLimit ? (
                <dl className="tool__facts">
                  <div className="almanac-row">
                    <dt>{t.pillars.childLimit.directionLabel}</dt>
                    <dd>
                      {outcome.result.childLimit.forward
                        ? t.pillars.childLimit.forward
                        : t.pillars.childLimit.backward}
                    </dd>
                  </div>
                  <div className="almanac-row">
                    <dt>{t.pillars.childLimit.durationLabel}</dt>
                    <dd>
                      {t.pillars.childLimit.years({
                        years: outcome.result.childLimit.years,
                        months: outcome.result.childLimit.months,
                        days: outcome.result.childLimit.days
                      })}
                    </dd>
                  </div>
                  <div className="almanac-row">
                    <dt>{t.pillars.childLimit.startLabel}</dt>
                    <dd>{outcome.result.childLimit.startText}</dd>
                  </div>
                </dl>
              ) : (
                <p className="tool__note">{t.pillars.childLimit.unavailable}</p>
              )}
            </div>
          </div>

          <div className="tool__pane">
            <h3 className="tool__subtitle">{t.pillars.decades.title}</h3>
            <div className="decades">
              {outcome.result.decades.map((decade) => (
                <div key={decade.index} className="decade">
                  <span className="decade__age">
                    {t.pillars.decades.ageRange({
                      from: decade.startAge,
                      to: decade.endAge
                    })}
                  </span>
                  <span className="decade__pillar">{decade.pillar}</span>
                  <span className="decade__ten-star">{decade.tenStar}</span>
                  <span className="decade__year">
                    {t.pillars.decades.startYear({ year: decade.startYear })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="tool__pane">
            <h3 className="tool__subtitle">{t.pillars.fortunes.title}</h3>
            <div className="fortunes">
              {outcome.result.fortunes.map((fortune) => (
                <div key={fortune.year} className="fortune">
                  <span className="fortune__year">{fortune.year}</span>
                  <span className="fortune__pillar">{fortune.pillar}</span>
                  <span className="fortune__ten-star">{fortune.tenStar}</span>
                  <span className="fortune__age">
                    {t.pillars.fortunes.age({ age: fortune.age })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
