/**
 * 骨架屏与宿主之间的契约。
 *
 * 骨架屏住在 `src/renderer/index.html`，在 React、i18n、甚至 `splash.js` 起来之前就是用户
 * 看到的一切。它需要三个输入：该用哪个主题的哪个变体、什么语言、是不是首次启动。
 *
 * 旧版把这三个值拼成查询串挂在要加载的 URL 上——因为只有主进程知道答案。现在答案仍由
 * 宿主（Rust）在创建窗口前算出，但传递方式换成**初始化脚本**：它先于页面任何脚本执行，
 * 开发模式（Vite 起了 devUrl）和生产模式（内嵌资源）走同一条路，不必改动 URL。
 *
 * `splash.js` 因此有两个来源可读：优先 `window.__TAYME_SPLASH__`，读不到才退回查询串
 * （直接用浏览器跑 `npm run dev:web` 时手工拼串仍然有效）。本文件仍是这套规则的唯一
 * 规范来源；`src-tauri/src/splash.rs` 是它的受契约副本，由 `tests/splash-contract.test.ts`
 * 钉住底色字面量与主题串格式。
 */
import type { Locale } from './ipc'

/**
 * 递给骨架屏的三个输入。
 *
 * `dt` 就是 `<html data-theme>` 的取值，必须和 `theme/themes/*` 的 `variants` 同格式，
 * 否则 React 起来之后会换装。
 */
export interface SplashBootstrap {
  dt: string
  locale: Locale
  first: boolean
}

/**
 * 主题串一律是 `{theme_id}-{variant}`。
 *
 * 这是骨架屏与 `resolveThemeId()` 之间唯一的约定：两边都由这个函数生成，
 * 就不会出现"骨架屏显示浅色、React 挂载后跳成深色"。
 */
export function resolvedSplashTheme(themeId: string, dark: boolean): string {
  return `${themeId}-${dark ? 'dark' : 'light'}`
}

/**
 * 窗口（webview）的底色，必须等于该主题在 `tokens.css` 里的 `--color-bg`。
 *
 * 骨架屏的 CSS 在 `<style>` 里写死同一组字面量，因为那一刻还没有样式表。
 * classic 是纸墨色，其余主题共用中性色。
 */
export function splashBackground(themeId: string, dark: boolean): string {
  if (themeId === 'classic') {
    return dark ? '#191512' : '#f3ecdd'
  }
  return dark ? '#15171b' : '#f6f6f4'
}

/**
 * 组装三个输入。旧版的 `splashSearch()` 换成这里，语义完全一致：
 * 首次启动（盘上没有设置文件）才置 `first`，语言取设置里的值，深浅色由宿主判定。
 */
export function splashBootstrap(
  themeId: string,
  locale: Locale,
  dark: boolean,
  firstRun: boolean
): SplashBootstrap {
  return {
    dt: resolvedSplashTheme(themeId, dark),
    locale,
    first: firstRun
  }
}
