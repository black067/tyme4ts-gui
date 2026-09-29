import { useMemo, useState, type ReactElement } from 'react'
import {
  SEARCH_MAX_DAYS,
  addDays,
  compareDateKey,
  formatFullDate,
  fromIsoDate,
  searchDays,
  searchSpanDays,
  toIsoDate,
  type DateKey,
  type SearchFilter,
  type SearchHit,
  type SearchResult
} from '@core'
import { cx } from '@renderer/components/cx'
import { PickerGroup } from './PickerGroup'
import './tools.css'

interface SearchToolProps {
  selected: DateKey
  onSelect: (key: DateKey) => void
  onOpenMonth: (year: number, month: number) => void
}

function defaultRange(selected: DateKey): { from: string; to: string } {
  return { from: toIsoDate(selected), to: toIsoDate(addDays(selected, 89)) }
}

/**
 * 择日 / range search.
 *
 * The scan is synchronous and can take a few hundred milliseconds for a full
 * year, so the button defers it by one tick to let the loading state paint.
 */
export function SearchTool({ selected, onSelect, onOpenMonth }: SearchToolProps): ReactElement {
  const initial = useMemo(() => defaultRange(selected), [selected])
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [recommends, setRecommends] = useState<readonly string[]>([])
  const [avoids, setAvoids] = useState<readonly string[]>([])
  const [terms, setTerms] = useState<readonly string[]>([])
  const [weekendsOnly, setWeekendsOnly] = useState(false)
  const [restDaysOnly, setRestDaysOnly] = useState(false)
  const [excludeMakeupDays, setExcludeMakeupDays] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<SearchResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const parsedFrom = fromIsoDate(from)
  const parsedTo = fromIsoDate(to)

  const span = useMemo(() => {
    if (!parsedFrom || !parsedTo) return null
    return searchSpanDays({ from: parsedFrom, to: parsedTo })
  }, [parsedFrom, parsedTo])

  const reset = (): void => {
    setRecommends([])
    setAvoids([])
    setTerms([])
    setWeekendsOnly(false)
    setRestDaysOnly(false)
    setExcludeMakeupDays(false)
  }

  const run = (): void => {
    if (!parsedFrom || !parsedTo) {
      setError('日期范围无效，请检查起止日期。')
      setResult(null)
      return
    }
    if (compareDateKey(parsedFrom, parsedTo) > 0) {
      setError('起始日期不能晚于结束日期。')
      setResult(null)
      return
    }

    const filter: SearchFilter = {
      from: parsedFrom,
      to: parsedTo,
      recommends,
      avoids,
      terms,
      weekendsOnly,
      restDaysOnly,
      excludeMakeupDays
    }

    setError(null)
    setRunning(true)
    setResult(null)
    // Yield once so the "检索中" state renders before the scan blocks the thread.
    window.setTimeout(() => {
      const found = searchDays(filter)
      setResult(found)
      setRunning(false)
    }, 0)
  }

  const openHit = (hit: SearchHit): void => {
    onSelect(hit.key)
    onOpenMonth(hit.key.year, hit.key.month)
  }

  return (
    <section className="tool" aria-label="择日检索">
      <header className="tool__header">
        <h2 className="tool__title">择日检索</h2>
        <span className="tool__meta">
          {span
            ? `共 ${span.days} 天${span.clipped ? `（已截断至上限 ${SEARCH_MAX_DAYS} 天）` : ''}`
            : '—'}
        </span>
        <button type="button" className="text-button" onClick={reset}>
          清空条件
        </button>
      </header>

      <div className="search-form">
        <div className="search-form__range">
          <label className="field">
            <span className="field__label">起始</span>
            <input
              className="field__input"
              type="date"
              value={from}
              min="0001-01-01"
              max="9999-12-31"
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">结束</span>
            <input
              className="field__input"
              type="date"
              value={to}
              min="0001-01-01"
              max="9999-12-31"
              onChange={(event) => setTo(event.target.value)}
            />
          </label>

          <div className="search-form__presets">
            {[
              { label: '未来 30 天', days: 29 },
              { label: '未来 90 天', days: 89 },
              { label: '未来一年', days: 365 }
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="text-button"
                onClick={() => {
                  setFrom(toIsoDate(selected))
                  setTo(toIsoDate(addDays(selected, preset.days)))
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <PickerGroup
          label="宜（需同时包含）"
          tone="luck"
          selected={recommends}
          onChange={setRecommends}
        />
        <PickerGroup label="忌（需同时包含）" tone="avoid" selected={avoids} onChange={setAvoids} />
        <PickerGroup label="节气（任一）" tone="term" selected={terms} onChange={setTerms} />

        <div className="search-form__switches">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={weekendsOnly}
              onChange={(event) => setWeekendsOnly(event.target.checked)}
            />
            仅周末
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={restDaysOnly}
              onChange={(event) => setRestDaysOnly(event.target.checked)}
            />
            仅法定休息日
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={excludeMakeupDays}
              onChange={(event) => setExcludeMakeupDays(event.target.checked)}
            />
            排除调休上班
          </label>
        </div>

        <div className="search-form__actions">
          <button type="button" className="primary-button" onClick={run} disabled={running}>
            {running ? '检索中…' : '开始检索'}
          </button>
          {error ? <span className="tool__error">{error}</span> : null}
        </div>
      </div>

      <div className="search-results">
        {running ? <p className="tool__note">正在检索，请稍候…</p> : null}

        {!running && result ? (
          result.hits.length === 0 ? (
            <p className="tool__note">没有符合条件的日期。</p>
          ) : (
            <>
              <p className="tool__note">
                命中 {result.hits.length} 天
                {result.limitReached ? '（已达结果上限，请缩小范围）' : ''}，共扫描{' '}
                {result.scannedDays} 天。
              </p>
              <ul className="hit-list">
                {result.hits.map((hit) => (
                  <li key={hit.iso} className="hit">
                    <button
                      type="button"
                      className="hit__main"
                      onClick={() => openHit(hit)}
                      title="在月视图中打开"
                      aria-label={`在月视图中打开 ${hit.iso}`}
                    >
                      <span className="hit__date">
                        {formatFullDate(hit.key.year, hit.key.month, hit.key.day)}
                      </span>
                      <span className="hit__lunar">{hit.lunar.full}</span>
                    </button>
                    <span className="hit__marks">
                      {hit.term ? <span className="hit__term">{hit.term.name}</span> : null}
                      {hit.festivals.map((festival) => (
                        <span key={festival.name} className="hit__festival">
                          {festival.name}
                        </span>
                      ))}
                      {hit.holiday ? (
                        <span
                          className={cx('hit__holiday', hit.holiday.isWork ? 'is-work' : 'is-rest')}
                        >
                          {hit.holiday.isWork ? '班' : '休'}
                        </span>
                      ) : null}
                      {hit.ganzhiDay ? <span className="hit__ganzhi">{hit.ganzhiDay}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )
        ) : null}

        {!running && !result ? <p className="tool__note">设置条件后点击「开始检索」。</p> : null}
      </div>
    </section>
  )
}
