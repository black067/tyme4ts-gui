import { useCallback, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import type { UpdateState } from '@shared/update'
import { UpdateContext, type UpdateContextValue } from './update-context'

/**
 * Owns the single subscription to the main process's updater.
 *
 * The snapshot is pushed rather than polled, so a 100 MB download needs no timer
 * here. `getState()` seeds the first render because a subscriber only receives
 * *changes*, and the app can mount long after a check already finished — the
 * launch check happens before the window is interactive.
 */
export function UpdateProvider({ children }: { children: ReactNode }): ReactElement {
  const [state, setState] = useState<UpdateState | null>(null)

  useEffect(() => {
    let cancelled = false
    window.tyme.updates
      .getState()
      .then((initial) => {
        if (!cancelled) setState(initial)
      })
      .catch(() => undefined)

    const unsubscribe = window.tyme.updates.subscribe((next) => setState(next))
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  // Actions resolve with a snapshot, but the subscription is what the UI renders
  // from; awaiting them keeps the callers' await semantics honest.
  const check = useCallback(async () => {
    await window.tyme.updates.check()
  }, [])
  const download = useCallback(async () => {
    await window.tyme.updates.download()
  }, [])
  const cancel = useCallback(async () => {
    await window.tyme.updates.cancel()
  }, [])
  const install = useCallback(async () => {
    await window.tyme.updates.install()
  }, [])

  const value = useMemo<UpdateContextValue>(
    () => ({ state, check, download, cancel, install }),
    [state, check, download, cancel, install]
  )

  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>
}
