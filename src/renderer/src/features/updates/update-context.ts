import { createContext, useContext } from 'react'
import type { UpdateState } from '@shared/update'

export interface UpdateContextValue {
  state: UpdateState | null
  check: () => Promise<void>
  download: () => Promise<void>
  cancel: () => Promise<void>
  install: () => Promise<void>
}

export const UpdateContext = createContext<UpdateContextValue | null>(null)

/**
 * Reads the shared updater snapshot.
 *
 * The snapshot lives in a provider rather than in this hook so the whole app
 * shares one IPC subscription — calling `subscribe` per component would
 * register one listener each and let their copies drift apart.
 */
export function useUpdateState(): UpdateContextValue {
  const value = useContext(UpdateContext)
  if (value === null) {
    throw new Error('useUpdateState must be called inside <UpdateProvider>')
  }
  return value
}
