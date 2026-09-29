/**
 * 文案层的公开入口。
 *
 * 组件从这里拿 `useMessages()` / `useLocale()`；目录与键的实现细节不外泄，
 * 这样以后换掉目录的组织方式（比如按需加载）不必改调用方。
 */
export { LocaleProvider } from './LocaleProvider'
export { useLocale, useMessages, type LocaleContextValue } from './locale-context'
export type { Messages, ThemeNameKey } from './messages'
export type { Translate } from './types'
