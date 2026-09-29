import type { TymeApi } from '@shared/ipc'

declare global {
  interface Window {
    tyme: TymeApi
  }
}

export {}
