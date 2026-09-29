import { useEffect } from 'react'
import type { ViewId } from '@shared/ipc'

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

export const SHORTCUTS: readonly ShortcutDoc[] = [
  { keys: '← / →', label: '前一天 / 后一天' },
  { keys: '↑ / ↓', label: '前一周 / 后一周' },
  { keys: 'PgUp / PgDn', label: '前一个月 / 后一个月' },
  { keys: 'Shift + PgUp / PgDn', label: '前一年 / 后一年' },
  { keys: 'T', label: '回到今天' },
  { keys: 'Alt + 1…4', label: '切换月 / 年 / 时间轴 / 工具' },
  { keys: '?', label: '显示或隐藏本说明' },
  { keys: 'Esc', label: '关闭说明' }
]
