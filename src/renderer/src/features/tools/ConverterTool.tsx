import { useMemo, useRef, useState, type ReactElement } from 'react'
import {
  RAB_BYUNG_MAX_YEAR,
  RAB_BYUNG_MIN_YEAR,
  convert,
  formatFullDate,
  type CalendarInput,
  type CalendarKind,
  type ConversionResult,
  type DateKey
} from '@core'
import { SegmentedControl, type SegmentedOption } from '@renderer/components/SegmentedControl'
import './tools.css'

const KINDS: readonly SegmentedOption<CalendarKind>[] = [
  { value: 'solar', label: '公历' },
  { value: 'lunar', label: '农历' },
  { value: 'hijri', label: '回历' },
  { value: 'rabByung', label: '藏历' },
  { value: 'julianDay', label: '儒略日' }
]

interface FieldSpec {
  name: string
  label: string
  value: number
  step?: string
}

/** The editable fields for each input calendar, seeded from the resolved day. */
function fieldSpecs(kind: CalendarKind, result: ConversionResult): FieldSpec[] {
  const { fields } = result
  switch (kind) {
    case 'solar':
      return [
        { name: 'year', label: '年', value: fields.solar.year },
        { name: 'month', label: '月', value: fields.solar.month },
        { name: 'day', label: '日', value: fields.solar.day }
      ]
    case 'lunar':
      return [
        { name: 'year', label: '年', value: fields.lunar.year },
        { name: 'month', label: '月', value: fields.lunar.month },
        { name: 'day', label: '日', value: fields.lunar.day }
      ]
    case 'hijri':
      return [
        { name: 'year', label: '年', value: fields.hijri?.year ?? 1445 },
        { name: 'month', label: '月', value: fields.hijri?.month ?? 1 },
        { name: 'day', label: '日', value: fields.hijri?.day ?? 1 }
      ]
    case 'rabByung':
      return [
        { name: 'year', label: '年', value: fields.rabByung?.year ?? 1990 },
        { name: 'month', label: '月', value: fields.rabByung?.month ?? 1 },
        { name: 'day', label: '日', value: fields.rabByung?.day ?? 1 }
      ]
    case 'julianDay':
      return [
        {
          name: 'julianDay',
          label: '儒略日',
          value: fields.julianDay ?? 2460000,
          step: '0.5'
        }
      ]
  }
}

function resultRows(result: ConversionResult): Array<[string, string | null]> {
  return [
    ['公历', `${result.solarText} 星期${result.weekName}`],
    ['农历', result.lunar.full],
    [
      '干支',
      result.ganzhi ? `${result.ganzhi.year} ${result.ganzhi.month} ${result.ganzhi.day}` : null
    ],
    ['生肖', result.lunar.zodiac],
    ['星座', result.constellation],
    ['回历', result.hijriText],
    ['藏历', result.rabByungText],
    ['儒略日', result.julianDay === null ? null : String(result.julianDay)]
  ]
}

/**
 * Converts between the calendars tyme4ts supports.
 *
 * The solar day is the hub: whichever calendar you type in resolves to a day,
 * and every other representation is derived from it. The inputs are
 * uncontrolled and keyed by the active calendar plus a seed counter, so
 * switching calendars (or pressing "用浏览中的日期") re-seeds them from the
 * resolved day without fighting what the user is typing.
 */
export function ConverterTool({ selected }: { selected: DateKey }): ReactElement {
  const [kind, setKind] = useState<CalendarKind>('solar')
  const [anchor, setAnchor] = useState<DateKey>(selected)
  const [seed, setSeed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const outcome = useMemo(() => convert({ kind: 'solar', ...anchor }), [anchor])
  const result = outcome.ok ? outcome.result : null

  const readInput = (): CalendarInput | null => {
    const form = formRef.current
    if (!form) return null
    const data = new FormData(form)
    const num = (name: string): number => Number(data.get(name) ?? '')
    switch (kind) {
      case 'solar':
        return { kind, year: num('year'), month: num('month'), day: num('day') }
      case 'lunar':
        return {
          kind,
          year: num('year'),
          month: num('month'),
          day: num('day'),
          leap: data.get('leap') === 'on'
        }
      case 'hijri':
      case 'rabByung':
        return { kind, year: num('year'), month: num('month'), day: num('day') }
      case 'julianDay':
        return { kind, julianDay: num('julianDay') }
    }
  }

  const handleChange = (): void => {
    const input = readInput()
    if (!input) return
    const next = convert(input)
    if (next.ok) {
      setAnchor(next.result.key)
      setError(null)
    } else {
      setError(next.error)
    }
  }

  const useBrowsedDate = (): void => {
    setAnchor(selected)
    setSeed((current) => current + 1)
    setError(null)
  }

  return (
    <section className="tool" aria-label="日期换算器">
      <header className="tool__header">
        <h2 className="tool__title">日期换算器</h2>
        <span className="tool__meta">
          {result ? formatFullDate(result.key.year, result.key.month, result.key.day) : '—'}
        </span>
        <button type="button" className="text-button" onClick={useBrowsedDate}>
          用浏览中的日期
        </button>
      </header>

      <div className="tool__columns">
        <div className="tool__pane">
          <SegmentedControl label="输入历法" value={kind} options={KINDS} onChange={setKind} />

          <form ref={formRef} className="converter-form" key={`${kind}:${seed}`}>
            <div className="converter-form__row">
              {result
                ? fieldSpecs(kind, result).map((spec) => (
                    <label key={spec.name} className="field">
                      <span className="field__label">{spec.label}</span>
                      <input
                        className="field__input"
                        type="number"
                        name={spec.name}
                        step={spec.step}
                        defaultValue={spec.value}
                        onChange={handleChange}
                      />
                    </label>
                  ))
                : null}
            </div>

            {kind === 'lunar' ? (
              <label className="checkbox">
                <input
                  type="checkbox"
                  name="leap"
                  defaultChecked={result?.fields.lunar.leap ?? false}
                  onChange={handleChange}
                />
                闰月
              </label>
            ) : null}
          </form>

          {kind === 'rabByung' ? (
            <p className="tool__note">
              藏历仅支持 {RAB_BYUNG_MIN_YEAR}–{RAB_BYUNG_MAX_YEAR} 饶迥年。
            </p>
          ) : null}

          {error ? <p className="tool__error">{error}</p> : null}
        </div>

        <div className="tool__pane">
          <h3 className="tool__subtitle">换算结果</h3>
          {result ? (
            <dl className="tool__facts">
              {resultRows(result).map(([label, value]) => (
                <div key={label} className="almanac-row">
                  <dt>{label}</dt>
                  <dd>{value ?? '—'}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {result && result.notes.length > 0 ? (
            <ul className="tool__notes">
              {result.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </section>
  )
}
