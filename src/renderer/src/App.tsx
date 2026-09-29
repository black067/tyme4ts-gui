import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import {
  buildDaySummary,
  formatFullDate,
  fromIsoDate,
  toIsoDate,
  todayKey,
  weekDayLabel,
  type DateKey
} from '@core'
import { SettingsProvider } from './state/SettingsProvider'
import { useSettings } from './state/settings-context'
import { MonthView } from './features/month/MonthView'
import { DayPanel } from './features/day/DayPanel'
import './styles/global.css'

export function App(): ReactElement {
  return (
    <SettingsProvider>
      <AppShell />
    </SettingsProvider>
  )
}

/**
 * Application shell: a header, the active view, and the focused day's panel.
 *
 * `selected` is the single source of truth for "which day is the user looking
 * at"; the month view derives its visible month from it, so paging and picking
 * can never drift apart.
 */
function AppShell(): ReactElement {
  const { settings, ready, update, error } = useSettings()
  const today = useMemo(() => todayKey(), [])
  const [selected, setSelected] = useState<DateKey>(today)
  const restored = useRef(false)

  // Restore the last browsed day once the persisted settings arrive.
  useEffect(() => {
    if (!ready || restored.current) return
    restored.current = true
    setSelected(fromIsoDate(settings.lastViewedDate) ?? today)
  }, [ready, settings.lastViewedDate, today])

  // Persist the selection, debounced so rapid navigation stays cheap.
  useEffect(() => {
    if (!ready || !restored.current) return
    const timer = setTimeout(() => update({ lastViewedDate: toIsoDate(selected) }), 600)
    return () => clearTimeout(timer)
  }, [ready, selected, update])

  const select = useCallback((key: DateKey) => setSelected(key), [])

  const todaySummary = useMemo(() => buildDaySummary(today), [today])

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">万年历</h1>
        <p className="app-subtitle">
          <span>{formatFullDate(today.year, today.month, today.day)}</span>
          <span className="app-subtitle__sep">·</span>
          <span>星期{weekDayLabel(todaySummary.weekDay)}</span>
          <span className="app-subtitle__sep">·</span>
          <span className="app-subtitle__lunar">{todaySummary.lunar.full}</span>
        </p>
        {error ? <p className="app-error">{error}</p> : null}
      </header>

      <div className="app-body">
        <main className="app-main">
          <MonthView
            selected={selected}
            today={today}
            weekStartsOnMonday={settings.weekStartsOnMonday}
            onSelect={select}
          />
        </main>
        <DayPanel selected={selected} />
      </div>
    </div>
  )
}
