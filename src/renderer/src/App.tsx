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
import { ToastProvider } from './components/ToastProvider'
import { useToast } from './components/toast-context'
import { LocaleProvider, useMessages } from './i18n'
import { dismissSplash } from './splash'
import { UpdateProvider } from './features/updates/UpdateProvider'
import { HolidayProvider } from './features/holidays/HolidayProvider'
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
          <ToastProvider>
            <UpdateProvider>
              <HolidayProvider>
                <TermTipProvider>
                  <AppContent />
                </TermTipProvider>
              </HolidayProvider>
            </UpdateProvider>
          </ToastProvider>
        </ThemeProvider>
      </LocaleProvider>
    </SettingsProvider>
  )
}

/**
 * Waits for the persisted settings before mounting the shell.
 *
 * Reading them is one awaited call into the in-process backend, and mounting only
 * afterwards lets the shell seed its state from real values instead of syncing them
 * in an effect. While that call is in flight the user is not looking at a blank page:
 * the first frame is the static skeleton in `index.html`, and `AppShell`
 * dismisses it once the real UI has committed.
 */
function AppContent(): ReactElement | null {
  const { ready } = useSettings()
  if (!ready) return null
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
  const toast = useToast()
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

  // The shell has committed to the DOM, so the first-frame skeleton has done
  // its job: fade it out and remove it (idempotent — see src/splash.ts).
  useEffect(() => {
    dismissSplash()
  }, [])

  // 设置存不下去（磁盘、权限）不是一条该钉在标题栏下面的消息。旧版那条 `app-error` 会一直
  // 挂在那儿，直到用户改下一项才消失——于是"有一次没存上"看起来像这个应用的永久状态。
  // 说一次就走才是它该有的样子，而原始异常那句话留给控制台，不进界面。
  useEffect(() => {
    if (error === null) return
    // 原始那句异常留给控制台：它是给下一个读代码的人用的，不是给用户看的（界面只说
    // "这个改动没存下来"，因为用户做得到的那件事与异常内容无关）。
    console.warn('[tyme-app] settings could not be saved', error)
    toast.notify(t.settings.saveFailed, 'error')
  }, [error, toast, t])

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

  useEffect(() => {
    // 宿主把 document.title 同步进原生标题栏（src-tauri/src/lib.rs 里的
    // on_document_title_changed），所以在这里改标题就等于让标题栏跟着界面语言一起变。
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
