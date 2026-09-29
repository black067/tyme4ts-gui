import { useCallback, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { createDefaultSettings, type AppSettings } from '@shared/ipc'
import { toIsoDate, todayKey } from '@core'
import { SettingsContext, type SettingsContextValue } from './settings-context'

const bootstrapSettings = createDefaultSettings(toIsoDate(todayKey()))

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/**
 * Owns the persisted preferences.
 *
 * Updates are optimistic so the UI never waits on disk, and the main process
 * echoes back the normalized settings (which is what actually gets stored).
 */
export function SettingsProvider({ children }: { children: ReactNode }): ReactElement {
  const [settings, setSettings] = useState<AppSettings>(bootstrapSettings)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.tyme.settings
      .get()
      .then((loaded) => {
        if (cancelled) return
        setSettings(loaded)
        setReady(true)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(describe(cause))
        setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const update = useCallback((patch: Partial<AppSettings>) => {
    setSettings((current) => ({ ...current, ...patch }))
    setError(null)
    window.tyme.settings
      .set(patch)
      .then((stored) => setSettings(stored))
      .catch((cause: unknown) => setError(describe(cause)))
  }, [])

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, ready, error, update }),
    [settings, ready, error, update]
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}
