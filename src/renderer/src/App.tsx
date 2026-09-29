import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { ViewId } from '@shared/ipc'
import {
  buildDaySummary,
  formatFullDate,
  fromIsoDate,
  toIsoDate,
  todayKey,
  weekDayLabel,
  type DateKey
} from '@core'
import { ViewTabs, type ViewTab } from './components/ViewTabs'
import { SettingsProvider } from './state/SettingsProvider'
import { useSettings } from './state/settings-context'
import { ThemeProvider } from './theme/ThemeProvider'
import { SettingsBar } from './features/settings/SettingsBar'
import { MonthView } from './features/month/MonthView'
import { YearView } from './features/year/YearView'
import { TimelineView } from './features/timeline/TimelineView'
import { ToolsView } from './features/tools/ToolsView'
import { DayPanel } from './features/day/DayPanel'
import './styles/global.css'

/** `day` is not a tab: the day detail is always visible as the side panel. */
const TABS: readonly ViewTab[] = [
  { id: 'month', label: '月视图' },
  { id: 'year', label: '年视图' },
  { id: 'timeline', label: '时间轴' },
  { id: 'tools', label: '工具' }
]

function initialView(stored: ViewId): ViewId {
  return TABS.some((tab) => tab.id === stored) ? stored : 'month'
}

export function App(): ReactElement {
  return (
    <SettingsProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </SettingsProvider>
  )
}

/**
 * Waits for the persisted settings before mounting the shell.
 *
 * Reading them takes one IPC round trip, and mounting only afterwards lets the
 * shell seed its state from real values instead of syncing them in an effect.
 */
function AppContent(): ReactElement {
  const { ready } = useSettings()
  if (!ready) return <div className="app-loading">正在载入…</div>
  return <AppShell />
}

/**
 * Application shell: a header, the tab bar, the active view and the focused
 * day's panel.
 *
 * `selected` is the single source of truth for "which day is the user looking
 * at". Every view derives its own window from it, so paging, picking and the
 * side panel can never drift apart.
 */
function AppShell(): ReactElement {
  const { settings, update, error } = useSettings()
  const today = useMemo(() => todayKey(), [])
  const [selected, setSelected] = useState<DateKey>(
    () => fromIsoDate(settings.lastViewedDate) ?? today
  )
  const [view, setView] = useState<ViewId>(() => initialView(settings.defaultView))
  const skipFirstPersist = useRef(true)

  // Persist the selection, debounced so rapid navigation stays cheap. The
  // first run is skipped because it would only rewrite the restored value.
  useEffect(() => {
    if (skipFirstPersist.current) {
      skipFirstPersist.current = false
      return
    }
    const timer = setTimeout(() => update({ lastViewedDate: toIsoDate(selected) }), 600)
    return () => clearTimeout(timer)
  }, [selected, update])

  const select = useCallback((key: DateKey) => setSelected(key), [])

  const changeView = useCallback(
    (next: ViewId) => {
      setView(next)
      update({ defaultView: next })
    },
    [update]
  )

  const openMonth = useCallback((year: number, month: number) => {
    setSelected((current) => ({ year, month, day: Math.min(current.day, 28) }))
    setView('month')
  }, [])

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

      <div className="app-toolbar">
        <ViewTabs tabs={TABS} active={view} onChange={changeView} />
      </div>

      <SettingsBar />

      <div className="app-body">
        <main className="app-main">
          {view === 'year' ? (
            <YearView
              selected={selected}
              today={today}
              weekStartsOnMonday={settings.weekStartsOnMonday}
              onSelect={select}
              onOpenMonth={openMonth}
            />
          ) : view === 'timeline' ? (
            <TimelineView selected={selected} today={today} onSelect={select} />
          ) : view === 'tools' ? (
            <ToolsView selected={selected} onSelect={select} onOpenMonth={openMonth} />
          ) : (
            <MonthView
              selected={selected}
              today={today}
              weekStartsOnMonday={settings.weekStartsOnMonday}
              onSelect={select}
            />
          )}
        </main>
        <DayPanel selected={selected} />
      </div>
    </div>
  )
}
