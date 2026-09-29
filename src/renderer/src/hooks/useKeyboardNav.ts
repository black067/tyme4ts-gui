import { useEffect } from 'react'
import type { ViewId } from '@shared/ipc'
import type { Messages } from '@renderer/i18n'

export interface KeyboardNavHandlers {
  /** Arrow keys: ±1 day, ±7 days. */
  shiftDays(delta: number): void
  /** PageUp / PageDown: ±1 month, or ±1 year with Shift. */
  shiftMonths(delta: number): void
  goToday(): void
  setView(view: ViewId): void
  toggleShortcuts(): void
  closeOverlays(): void
}

const VIEW_KEYS: Record<string, ViewId> = {
  '1': 'month',
  '2': 'year',
  '3': 'timeline',
  '4': 'tools'
}

/** True when the event came from a control the user is typing into. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

/**
 * Application-wide keyboard navigation.
 *
 * Bindings are ignored while the user is typing in a field, so the tool pages
 * can use the same keys for their own inputs.
 */
export function useKeyboardNav(handlers: KeyboardNavHandlers): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey) return

      if (event.key === 'Escape') {
        handlers.closeOverlays()
        return
      }

      if (isTypingTarget(event.target)) return

      if (event.altKey) {
        const view = VIEW_KEYS[event.key]
        if (view) {
          event.preventDefault()
          handlers.setView(view)
        }
        return
      }

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault()
          handlers.shiftDays(-1)
          break
        case 'ArrowRight':
          event.preventDefault()
          handlers.shiftDays(1)
          break
        case 'ArrowUp':
          event.preventDefault()
          handlers.shiftDays(-7)
          break
        case 'ArrowDown':
          event.preventDefault()
          handlers.shiftDays(7)
          break
        case 'PageUp':
          event.preventDefault()
          handlers.shiftMonths(event.shiftKey ? -12 : -1)
          break
        case 'PageDown':
          event.preventDefault()
          handlers.shiftMonths(event.shiftKey ? 12 : 1)
          break
        case 'Home':
        case 't':
        case 'T':
          event.preventDefault()
          handlers.goToday()
          break
        case '?':
          event.preventDefault()
          handlers.toggleShortcuts()
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handlers])
}

export interface ShortcutDoc {
  keys: string
  label: string
}

/**
 * 快捷键说明的文案。
 *
 * 参数是文案集合而非 locale：这一层不认识语言，只负责把键位与说明配起来。
 * 做成函数而不是模块级常量，是因为常量在 import 时冻结，切换语言后不会更新。
 */
export function shortcutDocs(t: Messages): readonly ShortcutDoc[] {
  return [
    { keys: '← / →', label: t.shortcuts.items.shiftDay },
    { keys: '↑ / ↓', label: t.shortcuts.items.shiftWeek },
    { keys: 'PgUp / PgDn', label: t.shortcuts.items.shiftMonth },
    { keys: 'Shift + PgUp / PgDn', label: t.shortcuts.items.shiftYear },
    { keys: 'T', label: t.shortcuts.items.goToday },
    { keys: 'Alt + 1…4', label: t.shortcuts.items.switchView },
    { keys: '?', label: t.shortcuts.items.toggleHelp },
    { keys: 'Esc', label: t.shortcuts.items.closeHelp }
  ]
}
