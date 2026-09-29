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
import { useMessages, type Messages } from '@renderer/i18n'
import './tools.css'

interface FieldSpec {
  name: string
  label: string
  value: number
  step?: string
}

/** The editable fields for each input calendar, seeded from the resolved day. */
function fieldSpecs(kind: CalendarKind, result: ConversionResult, t: Messages): FieldSpec[] {
  const { fields } = result
  const f = t.converter.field
  switch (kind) {
    case 'solar':
      return [
        { name: 'year', label: f.year, value: fields.solar.year },
        { name: 'month', label: f.month, value: fields.solar.month },
        { name: 'day', label: f.day, value: fields.solar.day }
      ]
    case 'lunar':
      return [
        { name: 'year', label: f.year, value: fields.lunar.year },
        { name: 'month', label: f.month, value: fields.lunar.month },
        { name: 'day', label: f.day, value: fields.lunar.day }
      ]
    case 'hijri':
      return [
        { name: 'year', label: f.year, value: fields.hijri?.year ?? 1445 },
        { name: 'month', label: f.month, value: fields.hijri?.month ?? 1 },
        { name: 'day', label: f.day, value: fields.hijri?.day ?? 1 }
      ]
    case 'rabByung':
      return [
        { name: 'year', label: f.year, value: fields.rabByung?.year ?? 1990 },
        { name: 'month', label: f.month, value: fields.rabByung?.month ?? 1 },
        { name: 'day', label: f.day, value: fields.rabByung?.day ?? 1 }
      ]
    case 'julianDay':
      return [
        {
          name: 'julianDay',
          label: f.julianDay,
          value: fields.julianDay ?? 2460000,
          step: '0.5'
        }
      ]
  }
}

function resultRows(result: ConversionResult, t: Messages): Array<[string, string | null]> {
  const c = t.converter.calendars
  const r = t.converter.result
  return [
    [c.solar, r.solarWithWeekday({ solar: result.solarText, weekday: result.weekName })],
    [c.lunar, result.lunar.full],
    [
      r.ganzhi,
      result.ganzhi ? `${result.ganzhi.year} ${result.ganzhi.month} ${result.ganzhi.day}` : null
    ],
    [r.zodiac, result.lunar.zodiac],
    [r.constellation, result.constellation],
    [c.hijri, result.hijriText],
    [c.rabByung, result.rabByungText],
    [c.julianDay, result.julianDay === null ? null : String(result.julianDay)]
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
  const t = useMessages()
  const [kind, setKind] = useState<CalendarKind>('solar')
  const [anchor, setAnchor] = useState<DateKey>(selected)
  const [seed, setSeed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const kindOptions = useMemo<readonly SegmentedOption<CalendarKind>[]>(
    () => [
      { value: 'solar', label: t.converter.calendars.solar },
      { value: 'lunar', label: t.converter.calendars.lunar },
      { value: 'hijri', label: t.converter.calendars.hijri },
      { value: 'rabByung', label: t.converter.calendars.rabByung },
      { value: 'julianDay', label: t.converter.calendars.julianDay }
    ],
    [t]
  )

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
    <section className="tool" aria-label={t.converter.title}>
      <header className="tool__header">
        <h2 className="tool__title">{t.converter.title}</h2>
        <span className="tool__meta">
          {result ? formatFullDate(result.key.year, result.key.month, result.key.day) : '—'}
        </span>
        <button type="button" className="text-button" onClick={useBrowsedDate}>
          {t.converter.useBrowsed}
        </button>
      </header>

      <div className="tool__columns">
        <div className="tool__pane">
          <SegmentedControl
            label={t.converter.inputKind}
            value={kind}
            options={kindOptions}
            onChange={setKind}
          />

          <form ref={formRef} className="converter-form" key={`${kind}:${seed}`}>
            <div className="converter-form__row">
              {result
                ? fieldSpecs(kind, result, t).map((spec) => (
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
                {t.converter.field.leap}
              </label>
            ) : null}
          </form>

          {kind === 'rabByung' ? (
            <p className="tool__note">
              {t.converter.rabByungRange({
                from: RAB_BYUNG_MIN_YEAR,
                to: RAB_BYUNG_MAX_YEAR
              })}
            </p>
          ) : null}

          {error ? <p className="tool__error">{error}</p> : null}
        </div>

        <div className="tool__pane">
          <h3 className="tool__subtitle">{t.converter.resultTitle}</h3>
          {result ? (
            <dl className="tool__facts">
              {resultRows(result, t).map(([label, value]) => (
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
