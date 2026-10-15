/**
 * Shared contract between the splash screen and the native window colour.
 *
 * Before creating the window, the main process puts the resolved theme, the UI
 * locale and a first-run marker into the load URL's query string;
 * `src/renderer/public/splash.js` writes them into `<html>` synchronously,
 * before the first paint. The skeleton therefore carries the user's real
 * theme, language and copy from the very first frame.
 *
 * These functions are pure and shared with the tests.
 * `tests/splash-contract.test.ts` pins three things: the theme string format
 * matches the `variants` of every registered theme family, the background
 * colours equal each theme's `--color-bg` in `tokens.css`, and the static
 * defaults written into `index.html` are exactly the fallback branches below.
 */
import type { Locale } from './ipc'

/** The `data-theme` value, in the same form as `resolveThemeId()` produces. */
export function resolvedSplashTheme(themeId: string, dark: boolean): string {
  return `${themeId}-${dark ? 'dark' : 'light'}`
}

/**
 * The native window background, correct before the HTML paints the skeleton.
 *
 * Each value must be the same literal as that theme's `--color-bg` in
 * `tokens.css` (the contract test enforces it) — a wrong colour here is more
 * noticeable than the skeleton itself. Unknown theme families fall back to
 * `minimal`, matching the renderer's own fallback.
 */
export function splashBackground(themeId: string, dark: boolean): string {
  if (themeId === 'classic') return dark ? '#191512' : '#f3ecdd'
  return dark ? '#15171b' : '#f6f6f4'
}

/** The load URL's query string. `first=1` appears only when settings.json is absent. */
export function splashSearch(
  themeId: string,
  locale: Locale,
  dark: boolean,
  firstRun: boolean
): string {
  const params = new URLSearchParams({
    dt: resolvedSplashTheme(themeId, dark),
    locale
  })
  if (firstRun) params.set('first', '1')
  return params.toString()
}
