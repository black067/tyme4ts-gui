import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { resolveThemeId } from './resolve'
import { ThemeContext, type ThemeContextValue } from './theme-context'
import { getTheme } from './themes'
import { resolveVariant } from './types'
import { useSettings } from '@renderer/state/settings-context'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** Tracks the OS appearance so `appearance: 'system'` can follow it live. */
function useSystemPrefersDark(): boolean {
  const [prefersDark, setPrefersDark] = useState(() => window.matchMedia(DARK_QUERY).matches)

  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY)
    const onChange = (event: MediaQueryListEvent): void => setPrefersDark(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return prefersDark
}

/**
 * Applies the resolved theme to the document.
 *
 * The only thing this writes is `data-theme` on `<html>` — every visible colour
 * comes from the matching `:root[data-theme='…']` block in `tokens.css`, so no
 * component needs to know which theme is active.
 */
export function ThemeProvider({ children }: { children: ReactNode }): ReactElement {
  const { settings } = useSettings()
  const systemPrefersDark = useSystemPrefersDark()

  const theme = useMemo(() => getTheme(settings.themeId), [settings.themeId])
  const variant = resolveVariant(settings.appearance, systemPrefersDark)
  const resolvedThemeId = resolveThemeId(settings.themeId, settings.appearance, systemPrefersDark)

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedThemeId
  }, [resolvedThemeId])

  // Keep Electron's own theme source in step so native chrome matches.
  useEffect(() => {
    void window.tyme.theme.setNative(settings.appearance)
  }, [settings.appearance])

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedThemeId, isDark: variant === 'dark' }),
    [theme, resolvedThemeId, variant]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
