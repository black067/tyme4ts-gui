import { useEffect, useMemo, type ReactElement, type ReactNode } from 'react'
import { useSettings } from '@renderer/state/settings-context'
import { LocaleContext, type LocaleContextValue } from './locale-context'
import { getMessages } from './messages'

/**
 * 把当前语言提供给组件树，并把它写到 `<html>` 上。
 *
 * 与 `ThemeProvider` 同样的形态：唯一的副作用是写一个属性，于是"当前是什么语言"
 * 只由 `<html lang>` 和 context 决定，不会有第二份真相。
 *
 * `lang` 不是装饰：它决定读屏器用哪种语音合成、以及浏览器给 CJK 文本挑哪套字形。
 * 简体与繁体共用汉字码位，字形却不同，标错会让"直/值"这类字显示成另一套写法。
 */
export function LocaleProvider({ children }: { children: ReactNode }): ReactElement {
  const { settings } = useSettings()
  const locale = settings.locale

  const messages = useMemo(() => getMessages(locale), [locale])

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dataset.locale = locale
  }, [locale])

  const value = useMemo<LocaleContextValue>(() => ({ locale, messages }), [locale, messages])

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}
