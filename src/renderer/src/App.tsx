import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { ViewId } from '@shared/ipc'
import {
  addDays,
  addMonths,
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
import { SettingsView } from './features/settings/SettingsView'
import { MonthView } from './features/month/MonthView'
import { YearView } from './features/year/YearView'
import { TimelineView } from './features/timeline/TimelineView'
import { ToolsView } from './features/tools/ToolsView'
import { DayPanel } from './features/day/DayPanel'
import { SHORTCUTS, useKeyboardNav, type KeyboardNavHandlers } from './hooks/useKeyboardNav'
import './styles/global.css'

/** `day` is not a tab: the day detail is always visible as the side panel. */
const TABS: readonly ViewTab[] = [
  { id: 'month', label: '月视图' },
  { id: 'year', label: '年视图' },
  { id: 'timeline', label: '时间轴' },
  { id: 'tools', label: '工具' }
]

function isTabView(stored: ViewId): boolean {
  return TABS.some((tab) => tab.id === stored)
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
 * at". Every view derives its own window from it, so paging, picking, keyboard
 * navigation and the side panel can never drift apart.
 */
function AppShell(): ReactElement {
  const { settings, update, error } = useSettings()
  const today = useMemo(() => todayKey(), [])
  const [selected, setSelected] = useState<DateKey>(
    () => fromIsoDate(settings.lastViewedDate) ?? today
  )
  const [view, setView] = useState<ViewId>(() =>
    isTabView(settings.defaultView) ? settings.defaultView : 'month'
  )
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
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

  const keyboard = useMemo<KeyboardNavHandlers>(
    () => ({
      shiftDays: (delta) =>
        setSelected((current) => (showSettings ? current : addDays(current, delta))),
      shiftMonths: (delta) =>
        setSelected((current) => (showSettings ? current : addMonths(current, delta))),
      goToday: () => setSelected(today),
      setView: (next) => {
        setShowSettings(false)
        setView(next)
        update({ defaultView: next })
      },
      toggleShortcuts: () => setShowShortcuts((current) => !current),
      closeOverlays: () => {
        setShowShortcuts(false)
        setShowSettings(false)
      }
    }),
    [today, update, showSettings]
  )

  useKeyboardNav(keyboard)

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
        <button
          type="button"
          className="text-button"
          aria-expanded={showShortcuts}
          onClick={() => setShowShortcuts((current) => !current)}
        >
          快捷键
        </button>
        <button
          type="button"
          className="text-button app-toolbar__settings"
          aria-pressed={showSettings}
          onClick={() => setShowSettings((current) => !current)}
        >
          设置
        </button>
      </div>

      {showShortcuts ? (
        <section className="shortcuts" aria-label="键盘快捷键">
          <dl className="shortcuts__list">
            {SHORTCUTS.map((shortcut) => (
              <div key={shortcut.keys} className="shortcuts__item">
                <dt>
                  <kbd>{shortcut.keys}</kbd>
                </dt>
                <dd>{shortcut.label}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {showSettings ? (
        // Settings take over the whole body: they are a separate screen rather
        // than a strip competing with the calendar for attention.
        <div className="app-body app-body--settings">
          <main className="app-main">
            <SettingsView onClose={() => setShowSettings(false)} />
          </main>
        </div>
      ) : (
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

          {/* Announced by screen readers whenever the focused day changes. */}
          <output className="visually-hidden" aria-live="polite">
            当前选中 {formatFullDate(selected.year, selected.month, selected.day)}
          </output>

          <DayPanel selected={selected} />
        </div>
      )}
    </div>
  )
}
