import { createContext, useContext } from 'react'
import type { Locale } from '@shared/ipc'
import type { Messages } from './messages'

export interface LocaleContextValue {
  /** 当前界面语言，来自持久化设置。 */
  locale: Locale
  /** 与 `locale` 对应的文案集合。组件直接取字段，不经过字符串键。 */
  messages: Messages
}

export const LocaleContext = createContext<LocaleContextValue | null>(null)

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext)
  if (value === null) {
    throw new Error('useLocale must be called inside <LocaleProvider>')
  }
  return value
}

/** 只关心文案时的便捷入口，等价于 `useLocale().messages`。 */
export function useMessages(): Messages {
  return useLocale().messages
}
