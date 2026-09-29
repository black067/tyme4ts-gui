/**
 * Third-party licences surfaced in the settings screen.
 *
 * The licence identifiers and homepages were read from each installed package's
 * own `package.json` rather than copied from documentation, so they match what
 * actually ships. Anything bundled into the renderer bundle is listed too, even
 * though it is not a runtime `node_modules` dependency.
 */
export interface ThirdPartyEntry {
  name: string
  licence: string
  homepage: string
  /** What it is used for in this app. */
  usage: string
}

export const THIRD_PARTY: readonly ThirdPartyEntry[] = [
  {
    name: 'tyme4ts',
    licence: 'MIT',
    homepage: 'https://github.com/6tail/tyme4ts',
    usage: '全部历法、节假日与黄历数据（公历 / 农历 / 藏历 / 回历 / 节气 / 宜忌 / 八字）'
  },
  {
    name: 'Electron',
    licence: 'MIT',
    homepage: 'https://github.com/electron/electron',
    usage: '桌面应用运行时（Chromium + Node.js）'
  },
  {
    name: 'React / React DOM',
    licence: 'MIT',
    homepage: 'https://github.com/facebook/react',
    usage: '界面渲染'
  },
  {
    name: '@tanstack/react-virtual',
    licence: 'MIT',
    homepage: 'https://github.com/TanStack/virtual',
    usage: '时间轴视图的虚拟滚动'
  },
  {
    name: '@electron-toolkit/utils',
    licence: 'MIT',
    homepage: 'https://github.com/alex8088/electron-toolkit',
    usage: '主进程开发期辅助（开发者快捷键等）'
  }
]

export interface AssetCredit {
  name: string
  author: string
  source: string
  licence: string
  /** Path inside the repository, for traceability. */
  path: string
}

export const ASSET_CREDITS: readonly AssetCredit[] = [
  {
    name: '应用图标（日历）',
    author: 'paomedia (Arnaud)',
    source: 'https://github.com/paomedia',
    licence: '见来源页面',
    path: 'assets/calendar.svg'
  }
]
