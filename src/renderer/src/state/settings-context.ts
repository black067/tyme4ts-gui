import { createContext, useContext } from 'react'
import type { AppSettings } from '@shared/ipc'

export interface SettingsContextValue {
  settings: AppSettings
  /** False until the persisted settings have been read from the main process. */
  ready: boolean
  /** Last failure from the settings bridge, if any. */
  error: string | null
  update: (patch: Partial<AppSettings>) => void
}

export const SettingsContext = createContext<SettingsContextValue | null>(null)

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext)
  if (value === null) {
    throw new Error('useSettings must be called inside <SettingsProvider>')
  }
  return value
}
