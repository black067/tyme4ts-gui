import { useEffect, useMemo, type ReactElement, type ReactNode } from 'react'
import { DEFAULT_LOCALE } from '@shared/ipc'
import { getMessages } from './messages'
import { LocaleContext, type LocaleContextValue } from './locale-context'

/**
 * 不读设置的语言提供者：固定给一种语言的文案。
 *
 * `LocaleProvider` 的语言来自磁盘上的设置文件，而选用户目录那一屏正处在"还没有设置可读"的
 * 时刻——读设置就得先有一个能读的目录，而那件事恰恰要等用户按下确定。所以那一屏用默认语言。
 *
 * 除了来源，别的一切与平时一致：context 的形状、`useMessages()` 的用法、写到 `<html>` 上的
 * 两个属性。组件因此不必知道自己处在哪个启动分支里——这正是这一屏要的：它只是一个没有设置
 * 可读时的普通界面。
 */
export function StaticLocaleProvider({ children }: { children: ReactNode }): ReactElement {
  const messages = useMemo(() => getMessages(DEFAULT_LOCALE), [])

  useEffect(() => {
    document.documentElement.lang = DEFAULT_LOCALE
    document.documentElement.dataset.locale = DEFAULT_LOCALE
  }, [])

  const value = useMemo<LocaleContextValue>(
    () => ({ locale: DEFAULT_LOCALE, messages }),
    [messages]
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}
