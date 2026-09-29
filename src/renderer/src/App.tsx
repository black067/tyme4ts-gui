import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { AppInfo, ViewId } from '@shared/ipc'
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
import { TermTipProvider } from './components/TermTip'
import { LocaleProvider, useMessages } from './i18n'
import { UpdateProvider } from './features/updates/UpdateProvider'
import { SettingsProvider } from './state/SettingsProvider'
import { useSettings } from './state/settings-context'
import { ThemeProvider } from './theme/ThemeProvider'
import { SettingsView } from './features/settings/SettingsView'
import { MonthView } from './features/month/MonthView'
import { YearView } from './features/year/YearView'
import { TimelineView } from './features/timeline/TimelineView'
import { ToolsView } from './features/tools/ToolsView'
import { DayPanel } from './features/day/DayPanel'
import { shortcutDocs, useKeyboardNav, type KeyboardNavHandlers } from './hooks/useKeyboardNav'
import './styles/global.css'

/** `day` is not a tab: the day detail is always visible as the side panel. */
type TabId = Exclude<ViewId, 'day'>

/**
 * Tab order. Labels are looked up per locale in `AppShell`, because a
 * module-level `const` would freeze the strings at import time and never react
 * to a language change.
 */
const TAB_IDS: readonly TabId[] = ['month', 'year', 'timeline', 'tools']

function isTabView(stored: ViewId): stored is TabId {
  return (TAB_IDS as readonly string[]).includes(stored)
}

export function App(): ReactElement {
  return (
    <SettingsProvider>
      <LocaleProvider>
        <ThemeProvider>
          <UpdateProvider>
            <TermTipProvider>
              <AppContent />
            </TermTipProvider>
          </UpdateProvider>
        </ThemeProvider>
      </LocaleProvider>
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
  const t = useMessages()
  if (!ready) return <div className="app-loading">{t.app.loading}</div>
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
  const t = useMessages()
  const today = useMemo(() => todayKey(), [])
  const [selected, setSelected] = useState<DateKey>(
    () => fromIsoDate(settings.lastViewedDate) ?? today
  )
  const [view, setView] = useState<ViewId>(() =>
    isTabView(settings.defaultView) ? settings.defaultView : 'month'
  )
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const skipFirstPersist = useRef(true)

  // Only the version is needed here, for the window title.
  useEffect(() => {
    let cancelled = false
    window.tyme.app
      .getInfo()
      .then((loaded) => {
        if (!cancelled) setInfo(loaded)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

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

  // Electron derives the native window title from the page title, so setting it
  // here is what keeps the title bar (and the taskbar entry) in the same
  // language as the rest of the chrome.
  useEffect(() => {
    document.title = info === null ? t.app.title : t.app.titleWithVersion({ version: info.version })
  }, [info, t])

  const tabs = useMemo<readonly ViewTab[]>(
    () => TAB_IDS.map((id) => ({ id, label: t.nav[id] })),
    [t]
  )

  const shortcuts = useMemo(() => shortcutDocs(t), [t])

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">{t.app.title}</h1>
        <p className="app-subtitle">
          <span>{formatFullDate(today.year, today.month, today.day)}</span>
          <span className="app-subtitle__sep">·</span>
          <span>
            {t.app.weekdayPrefix}
            {weekDayLabel(todaySummary.weekDay)}
          </span>
          <span className="app-subtitle__sep">·</span>
          <span className="app-subtitle__lunar">{todaySummary.lunar.full}</span>
        </p>
        {error ? <p className="app-error">{error}</p> : null}
      </header>

      <div className="app-toolbar">
        <ViewTabs tabs={tabs} active={view} onChange={changeView} />
        <button
          type="button"
          className="text-button"
          aria-expanded={showShortcuts}
          onClick={() => setShowShortcuts((current) => !current)}
        >
          {t.toolbar.shortcuts}
        </button>
        <button
          type="button"
          className="text-button app-toolbar__settings"
          aria-pressed={showSettings}
          onClick={() => setShowSettings((current) => !current)}
        >
          {t.toolbar.settings}
        </button>
      </div>

      {showShortcuts ? (
        <section className="shortcuts" aria-label={t.shortcuts.label}>
          <dl className="shortcuts__list">
            {shortcuts.map((shortcut) => (
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
            {t.app.currentSelectionPrefix}{' '}
            {formatFullDate(selected.year, selected.month, selected.day)}
          </output>

          <DayPanel selected={selected} />
        </div>
      )}
    </div>
  )
}
