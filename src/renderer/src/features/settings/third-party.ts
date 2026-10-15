/**
 * Third-party licences surfaced in the settings screen.
 *
 * The licence identifiers and homepages were read from each installed package's
 * own `package.json` rather than copied from documentation, so they match what
 * actually ships. Anything bundled into the renderer bundle is listed too, even
 * though it is not a runtime `node_modules` dependency.
 *
 * `name`, `licence` and `homepage` are identifiers, not copy, so they stay here;
 * the `usage` prose is user-facing and comes from the message catalog.
 */
export interface ThirdPartyEntry {
  name: string
  licence: string
  homepage: string
  /** Catalogue key for what it is used for in this app. */
  usageKey:
    'tyme4ts' | 'tauri' | 'webview2' | 'rustCrates' | 'react' | 'tanstackVirtual' | 'chineseDays'
}

export const THIRD_PARTY: readonly ThirdPartyEntry[] = [
  {
    name: 'tyme4ts',
    licence: 'MIT',
    homepage: 'https://github.com/6tail/tyme4ts',
    usageKey: 'tyme4ts'
  },
  {
    name: 'Tauri 2 + plugin-fs / plugin-http / plugin-opener',
    licence: 'MIT OR Apache-2.0',
    homepage: 'https://github.com/tauri-apps/tauri',
    usageKey: 'tauri'
  },
  {
    name: 'Microsoft Edge WebView2',
    licence: 'Microsoft Software License Terms',
    homepage: 'https://developer.microsoft.com/microsoft-edge/webview2/',
    usageKey: 'webview2'
  },
  {
    // 宿主侧依赖太多，逐条列会把这一屏变成清单；名字取自 Cargo.toml 的直接依赖，
    // 完整清单与精确版本在 src-tauri/Cargo.lock。
    name: 'reqwest · schannel · sha2 · tokio · winreg',
    licence: 'MIT / Apache-2.0 / ISC',
    homepage: 'https://crates.io/',
    usageKey: 'rustCrates'
  },
  {
    name: 'React / React DOM',
    licence: 'MIT',
    homepage: 'https://github.com/facebook/react',
    usageKey: 'react'
  },
  {
    name: '@tanstack/react-virtual',
    licence: 'MIT',
    homepage: 'https://github.com/TanStack/virtual',
    usageKey: 'tanstackVirtual'
  },
  {
    name: 'chinese-days',
    licence: 'MIT',
    homepage: 'https://github.com/vsme/chinese-days',
    usageKey: 'chineseDays'
  }
]

export interface AssetCredit {
  /** Catalogue key for the asset's display name. */
  nameKey: 'calendarIcon'
  author: string
  source: string
  /** Path inside the repository, for traceability. */
  path: string
}

export const ASSET_CREDITS: readonly AssetCredit[] = [
  {
    nameKey: 'calendarIcon',
    author: 'paomedia (Arnaud)',
    source: 'https://github.com/paomedia',
    path: 'assets/calendar.svg'
  }
]
