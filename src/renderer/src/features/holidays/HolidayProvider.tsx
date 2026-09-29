import { useCallback, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import type { HolidayStatus } from '@shared/holidays'
import { HolidayContext, type HolidayContextValue } from './holiday-context'

/**
 * Owns the single subscription to the main process's holiday status.
 *
 * `getStatus()` seeds the first render because a subscriber only receives
 * *changes*, and the startup refresh usually finishes before the settings screen
 * is ever opened.
 */
export function HolidayProvider({ children }: { children: ReactNode }): ReactElement {
  const [status, setStatus] = useState<HolidayStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    window.tyme.holidays
      .getStatus()
      .then((initial) => {
        if (!cancelled) setStatus(initial)
      })
      .catch(() => undefined)

    const unsubscribe = window.tyme.holidays.subscribe((next) => setStatus(next))
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const refresh = useCallback(async () => {
    await window.tyme.holidays.refresh()
  }, [])

  const value = useMemo<HolidayContextValue>(() => ({ status, refresh }), [status, refresh])

  return <HolidayContext.Provider value={value}>{children}</HolidayContext.Provider>
}
