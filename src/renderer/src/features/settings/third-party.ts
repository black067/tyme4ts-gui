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
  usageKey: 'tyme4ts' | 'electron' | 'react' | 'tanstackVirtual' | 'electronToolkit' | 'holidayCn'
}

export const THIRD_PARTY: readonly ThirdPartyEntry[] = [
  {
    name: 'tyme4ts',
    licence: 'MIT',
    homepage: 'https://github.com/6tail/tyme4ts',
    usageKey: 'tyme4ts'
  },
  {
    name: 'Electron',
    licence: 'MIT',
    homepage: 'https://github.com/electron/electron',
    usageKey: 'electron'
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
    name: '@electron-toolkit/utils',
    licence: 'MIT',
    homepage: 'https://github.com/alex8088/electron-toolkit',
    usageKey: 'electronToolkit'
  },
  {
    name: 'holiday-cn',
    licence: 'MIT',
    homepage: 'https://github.com/NateScarlet/holiday-cn',
    usageKey: 'holidayCn'
  }
]

export interface AssetCredit {
  /** Catalogue key for the asset's display name. */
  nameKey: 'calendarIcon'
  author: string
  source: string
  /** Free-text licence note; the terms live on the source page. */
  licence: string
  /** Path inside the repository, for traceability. */
  path: string
}

export const ASSET_CREDITS: readonly AssetCredit[] = [
  {
    nameKey: 'calendarIcon',
    author: 'paomedia (Arnaud)',
    source: 'https://github.com/paomedia',
    licence: '见来源页面',
    path: 'assets/calendar.svg'
  }
]
