/**
 * 首帧骨架屏的契约测试。
 *
 * 骨架屏住在 `src/renderer/index.html`，在 React 与 i18n 层起来之前就是用户
 * 看到的一切——也正因为它在两层之外，仓库里现有的守卫全都够不着它：
 * 主题 token 契约只扫组件，硬编码中文账本只扫 `src/renderer/src`。这个文件
 * 把骨架屏重新接回这三套既有约定：
 *
 * 1. **文案**——每个 `LOCALES` 成员必须恰有一对 `data-locale` 节点，且与
 *    对应文案目录的 `app.splash` / `app.splashFirstRun` **逐字一致**；
 *    每个语言还要有两条显示规则，防止"加了节点忘了显示"。
 * 2. **配色**——`<style>` 里出现的每个颜色字面量都必须是 `tokens.css` 已有
 *    的值；`splashBackground()` 的每个返回值必须等于对应主题在 `tokens.css`
 *    里的 `--color-bg`。骨架屏不许自成一套配色。
 * 3. **脚本面**——`index.html` 禁止 inline `<script>` 与内联事件属性（CSP
 *    本来就会拦，测试拦的是"有人想把它塞回去"）；非 module 脚本有且只有
 *    `splash.js`；文案节点不许用 `style="display:none"` 硬藏——那样 JS 挂掉
 *    时连兜底骨架都没了。
 *
 * 另外钉住主题串格式：`resolvedSplashTheme()` 与 `theme/themes/*` 的
 * `variants` 必须给出一样的 `data-theme` 值，否则首帧与 React 起来之后会换装。
 *
 * 4. **宿主这一半**——窗口现在由 Rust 创建（`src-tauri/src/splash.rs`），首帧的三个输入
 *    由它经一段初始化脚本递给页面。底色字面量、`window.__TAYME_SPLASH__` 这个键名、
 *    主题串的拼法，都是跨语言抄了一遍的同一套规则：抄错不会编译失败，只会首帧闪错色。
 *    所以这里直接读 Rust 源文本，跟 `src/shared/splash.ts` 逐项对账。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_LOCALE, LOCALES } from '../src/shared/ipc'
import { resolvedSplashTheme, splashBackground, splashBootstrap } from '../src/shared/splash'
import { THEMES, DEFAULT_THEME } from '../src/renderer/src/theme/themes'
import { getMessages } from '../src/renderer/src/i18n/messages'

const ROOT = process.cwd()
const HTML_PATH = join(ROOT, 'src', 'renderer', 'index.html')
const TOKENS_PATH = join(ROOT, 'src', 'renderer', 'src', 'theme', 'tokens.css')
const SPLASH_JS_PATH = join(ROOT, 'src', 'renderer', 'public', 'splash.js')
const RUST_SPLASH_PATH = join(ROOT, 'src-tauri', 'src', 'splash.rs')

const html = readFileSync(HTML_PATH, 'utf8')
const tokens = readFileSync(TOKENS_PATH, 'utf8')

/** 去掉 HTML 注释，防止注释里的示例代码被当成真脚本统计。 */
const code = html.replace(/<!--[\s\S]*?-->/g, '')

const styleBlocks = [...code.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n')

const HEX = /#[0-9a-fA-F]{3,8}\b/g

/** `tokens.css` 里出现过的全部颜色字面量（小写），骨架屏只许用这些。 */
function tokenColors(): Set<string> {
  return new Set([...tokens.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toLowerCase()))
}

/** `data-theme` 值 → 该主题的 `--color-bg`。 */
function colorBgByTheme(): Map<string, string> {
  const out = new Map<string, string>()
  const blocks = tokens.split(/(?=:root\[data-theme=')/)
  for (const block of blocks) {
    const theme = block.match(/:root\[data-theme='([^']+)'\]/)?.[1]
    const bg = block.match(/--color-bg:\s*(#[0-9a-fA-F]{3,8})/)?.[1]
    if (theme && bg) out.set(theme, bg.toLowerCase())
  }
  return out
}

describe('骨架屏文案与 i18n 目录一致', () => {
  const lineTags = [
    ...code.matchAll(
      /<span class="splash-line splash-line--(default|first)" data-locale="([^"]+)"\s*>([\s\S]*?)<\/span\s*>/g
    )
  ].map((m) => ({ kind: m[1] ?? '', locale: m[2] ?? '', text: (m[3] ?? '').trim() }))

  it('每个已注册语言恰有 default 与 first 两个节点', () => {
    for (const locale of LOCALES) {
      expect(
        lineTags.filter((l) => l.locale === locale && l.kind === 'default').length,
        `${locale} 的默认骨架文案`
      ).toBe(1)
      expect(
        lineTags.filter((l) => l.locale === locale && l.kind === 'first').length,
        `${locale} 的首启骨架文案`
      ).toBe(1)
    }
    // 反过来也要成立：写了没人注册的语言，说明节点是硬加进 HTML 的。
    const unknown = [...new Set(lineTags.map((l) => l.locale))].filter(
      (locale) => !(LOCALES as readonly string[]).includes(locale)
    )
    expect(unknown, 'data-locale 出现未在 LOCALES 注册的语言').toEqual([])
  })

  it('每个语言的文案与目录逐字一致', () => {
    for (const { kind, locale, text } of lineTags) {
      const messages = getMessages(locale as (typeof LOCALES)[number])
      const expected = kind === 'default' ? messages.app.splash : messages.app.splashFirstRun
      expect(text, `${kind} / ${locale} 的骨架文案`).toBe(expected)
    }
  })

  it('每个语言有两条显示规则（加了节点就得有让它显形的规则）', () => {
    for (const locale of LOCALES) {
      expect(styleBlocks.includes(`[data-locale='${locale}']`), `${locale} 的显示规则`).toBe(true)
    }
  })

  it('静态默认值指向默认语言与最浅主题（splash.js 挂掉时的兜底）', () => {
    const htmlTag = code.match(/<html\b[^>]*>/)?.[0] ?? ''
    expect(htmlTag).toContain(`data-locale="${DEFAULT_LOCALE}"`)
    expect(htmlTag).toContain(`data-theme="${DEFAULT_THEME.variants.light}"`)
  })
})

describe('骨架屏配色不许自成一套', () => {
  it('内联样式里的每个颜色都在 tokens.css 出现过', () => {
    const allowed = tokenColors()
    const rogue = [
      ...new Set([...styleBlocks.matchAll(HEX)].map((m) => m[0].toLowerCase()))
    ].filter((color) => !allowed.has(color))
    expect(rogue, '骨架屏出现了 tokens.css 之外的颜色字面量').toEqual([])
  })

  it('每个主题的骨架底色就是该主题的 --color-bg', () => {
    const bg = colorBgByTheme()
    for (const theme of THEMES) {
      for (const dark of [false, true]) {
        const variant = resolvedSplashTheme(theme.id, dark)
        expect(splashBackground(theme.id, dark).toLowerCase(), `${variant} 的窗口底色`).toBe(
          bg.get(variant)
        )
      }
    }
  })

  it('主进程给的主题串与渲染层 resolveThemeId 同格式', () => {
    for (const theme of THEMES) {
      expect(resolvedSplashTheme(theme.id, false)).toBe(theme.variants.light)
      expect(resolvedSplashTheme(theme.id, true)).toBe(theme.variants.dark)
    }
  })

  it('递给骨架屏的三个输入把主题、语言、首启都带上', () => {
    const bootstrap = splashBootstrap('classic', 'zh-Hans', true, true)
    expect(bootstrap.dt).toBe('classic-dark')
    expect(bootstrap.locale).toBe('zh-Hans')
    expect(bootstrap.first).toBe(true)

    const quiet = splashBootstrap('minimal', 'zh-Hans', false, false)
    expect(quiet.dt).toBe('minimal-light')
    expect(quiet.first).toBe(false)
  })
})

/**
 * 宿主这一半是规范的另一份抄本，改动最不容易被发现的地方。
 *
 * 底色写错、`window.__TAYME_SPLASH__` 这个键名写错、主题串写成 `light-minimal`：
 * 三种都不会让 Rust 编译失败，也不会让 TS 类型检查失败，只会在用户机上表现为
 * "首帧闪一下错色"或"首帧永远是默认主题"。所以直接从源文本对账。
 */
describe('宿主（Rust）抄的这套规则与 TS 规范一致', () => {
  const rust = readFileSync(RUST_SPLASH_PATH, 'utf8')
  const splashJs = readFileSync(SPLASH_JS_PATH, 'utf8')

  /** 从 `background_rgb` 里抠出四组字面量，键成 `{theme}-{variant}`。 */
  function rustBackgrounds(): Map<string, string> {
    const body = rust.slice(rust.indexOf('fn background_rgb'))
    const out = new Map<string, string>()
    for (const match of body.matchAll(
      /\((?:"([a-z]+)"|_),\s*(true|false)\)\s*=>\s*\[0x([0-9a-f]{2}),\s*0x([0-9a-f]{2}),\s*0x([0-9a-f]{2}),\s*0x([0-9a-f]{2})\]/gi
    )) {
      const theme = (match[1] ?? '*').toLowerCase()
      const variant = match[2] === 'true' ? 'dark' : 'light'
      out.set(`${theme}-${variant}`, `#${match[3]}${match[4]}${match[5]}`.toLowerCase())
    }
    return out
  }

  it('底色表能解析出四组字面量（抠不动就说明 Rust 的写法变了）', () => {
    // 反空转守卫：正则一旦够不着新的写法，下面的对账会全部变成"没东西可对"。
    expect([...rustBackgrounds().keys()].sort()).toEqual([
      '*-dark',
      '*-light',
      'classic-dark',
      'classic-light'
    ])
  })

  it('每个主题的底色与 splashBackground() 相同', () => {
    const rustColors = rustBackgrounds()
    for (const theme of THEMES) {
      for (const dark of [false, true]) {
        const key = `${theme.id === 'classic' ? 'classic' : '*'}-${dark ? 'dark' : 'light'}`
        expect(
          rustColors.get(key),
          `${resolvedSplashTheme(theme.id, dark)}：Rust 抄本 vs splashBackground()`
        ).toBe(splashBackground(theme.id, dark).toLowerCase())
      }
    }
  })

  it('alpha 恒为 255：底色不需要透明，透明会让窗口在出现那一瞬透出桌面', () => {
    for (const match of rust
      .slice(rust.indexOf('fn background_rgb'))
      .matchAll(/0x([0-9a-f]{2})\]/gi)) {
      expect((match[1] ?? '').toLowerCase()).toBe('ff')
    }
  })

  it('主题串按 {theme_id}-{variant} 拼', () => {
    expect(rust).toMatch(/"dt":\s*format!\("\{theme_id\}-\{variant\}"/)
    expect(rust).toMatch(/let variant = if dark \{ "dark" \} else \{ "light" \}/)
  })

  it('三个输入经 window.__TAYME_SPLASH__ 递交，键名三处一致', () => {
    expect(rust).toContain('window.__TAYME_SPLASH__')
    expect(splashJs).toContain('window.__TAYME_SPLASH__')
    // TS 侧那份声明（宿主注入的对象形状）。
    const globals = readFileSync(join(ROOT, 'src', 'backend', 'global.d.ts'), 'utf8')
    expect(globals).toContain('__TAYME_SPLASH__')
    for (const key of ['dt', 'locale', 'first']) {
      expect(rust).toMatch(new RegExp(`"${key}"`))
      expect(splashJs).toMatch(new RegExp(`\\.${key}\\b`))
    }
  })

  it('查询串仍是回退路径（浏览器里直接跑 dev:web 时仍然可用）', () => {
    expect(splashJs).toContain('URLSearchParams(window.location.search)')
    expect(splashJs).toMatch(/injected\?\.dt \?\? fallback\.dt/)
  })

  it('宿主与 TS 用同一组默认值', () => {
    expect(rust).toContain('const DEFAULT_THEME_ID: &str = "minimal"')
    expect(rust).toContain('const DEFAULT_LOCALE: &str = "zh-Hans"')
  })

  it('深浅色的判据仍是注册表那一个键（与 Electron 的 nativeTheme 同源）', () => {
    expect(rust).toContain('AppsUseLightTheme')
    expect(rust).toContain('Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize')
  })
})

describe('骨架屏的脚本面守住 CSP 现状', () => {
  const scriptTags = [...code.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1] ?? '')

  it('没有任何 inline <script>', () => {
    expect(scriptTags.filter((attrs) => !attrs.includes('src=')).length).toBe(0)
  })

  it('非 module 脚本有且只有 public/splash.js', () => {
    const classic = scriptTags.filter((attrs) => !attrs.includes('type="module"'))
    expect(classic.length).toBe(1)
    expect(classic[0]).toContain('splash.js')
  })

  it('没有内联事件属性（onclick 之类在 CSP 下本就无效）', () => {
    expect(/\son[a-z]+\s*=\s*"/i.test(code)).toBe(false)
  })

  it('文案不靠内联 style 属性硬藏——display 规则必须在样式表里，JS 挂了也有兜底', () => {
    expect(code.includes('style=')).toBe(false)
  })

  it('网格结构完整：7 个星期条 + 42 个日期格 + 1 个今日格', () => {
    expect((code.match(/class="splash-week splash-shimmer"/g) ?? []).length).toBe(7)
    const cells = code.match(/class="splash-cell(?: splash-cell--today)? splash-shimmer"/g) ?? []
    expect(cells.length).toBe(42)
    // 只数类名出现的那次（CSS 选择器里的同名不算）。
    expect(cells.filter((c) => c.includes('splash-cell--today')).length).toBe(1)
  })
})
