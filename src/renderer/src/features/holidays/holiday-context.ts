import { createContext, useContext } from 'react'
import type { HolidayStatus } from '@shared/holidays'

export interface HolidayContextValue {
  status: HolidayStatus | null
  refresh: () => Promise<void>
}

export const HolidayContext = createContext<HolidayContextValue | null>(null)

/**
 * Reads the shared holiday status.
 *
 * Like the updater, the snapshot lives in a provider so the whole app shares one
 * IPC subscription instead of registering a listener per component.
 */
export function useHolidays(): HolidayContextValue {
  const value = useContext(HolidayContext)
  if (value === null) {
    throw new Error('useHolidays must be called inside <HolidayProvider>')
  }
  return value
}
