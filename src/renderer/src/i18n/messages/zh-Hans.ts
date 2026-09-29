/**
 * 参考文案（简体中文）。
 *
 * 这是**唯一**的键清单：其它语言的目录必须与它同构，由
 * `tests/i18n-contract.test.ts` 断言扁平化后的键集合完全一致。
 *
 * 组织方式按界面区域分组，与 `features/` 的划分一致，便于定位。
 * 同一区域内标点风格保持一致（句末带不带句号），否则翻译时无从判断哪种是刻意的。
 */
import type { Locale } from '@shared/ipc'

export const zhHans = {
  /** 语言的自称。刻意不做翻译：切到英文界面后仍要能找到"繁體中文"。 */
  localeNames: {
    'zh-Hans': '简体中文'
  } satisfies Record<Locale, string>,

  app: {
    title: '万年历',
    /** 标题行 + 版本号，如「万年历 v0.1.3」。 */
    titleWithVersion: ({ version }: { version: string }): string => `万年历 v${version}`,
    loading: '正在载入…',
    /** 副标题里"星期"的前缀，后接星期名（日/一/…）。 */
    weekdayPrefix: '星期',
    /** 读屏器播报当前选中日期时的前缀。 */
    currentSelectionPrefix: '当前选中'
  },

  nav: {
    /** 视图切换导航的无障碍名称。 */
    label: '主视图切换',
    month: '月视图',
    year: '年视图',
    timeline: '时间轴',
    tools: '工具'
  },

  toolbar: {
    shortcuts: '快捷键',
    settings: '设置'
  },

  shortcuts: {
    /** 快捷键面板的区域名称，兼作无障碍标签。 */
    label: '键盘快捷键'
  },

  glossary: {
    /** 只有缺口说明时的浮层标题。有释义时显示的是释义本身。 */
    missing: '暂无释义',
    /** 引文前的小标题。 */
    quote: '原文',
    /** 出处前的小标题。 */
    source: '出处',
    /** 关闭已固定详情的无障碍名称。 */
    close: '关闭'
  },

  settings: {
    /** 设置页的区域名称，读屏器靠它识别该页。 */
    label: '设置',
    title: '设置',
    close: '返回',

    appearance: {
      title: '外观',
      description: '主题决定配色与字体，外观决定使用浅色还是深色变体。',
      themeLabel: '主题',
      modeLabel: '外观',
      /** 「当前生效：现代简约 · minimal」。 */
      current: ({ theme, resolved }: { theme: string; resolved: string }): string =>
        `当前生效：${theme} · ${resolved}`,
      system: '跟随系统',
      light: '浅色',
      dark: '深色'
    },

    language: {
      title: '语言',
      description: '界面文案的语言。历法与黄历数据来自引擎，其术语不随此设置变化。'
    },

    display: {
      title: '显示',
      description: '影响日历网格与黄历内容的呈现。',
      weekStart: '周一为一周首日',
      almanac: '显示黄历（宜忌 / 神煞 / 胎神等）',
      glossary: '术语说明（悬停看释义，点击看出处）',
      startViewLabel: '启动时打开'
    },

    data: {
      title: '数据',
      description: '所有设置只保存在本机，不会上传。',
      dir: '数据目录',
      file: '设置文件'
    },

    author: {
      title: '作者信息',
      app: '应用',
      name: '作者',
      /** package.json 里没写作者时的占位。 */
      missing: '（package.json 未填写）'
    },

    thirdParty: {
      title: '第三方许可',
      description: '本应用基于以下开源项目与资产构建。'
    },

    assets: {
      title: '资产署名',
      description: '应用图标等美术资源的来源与作者。',
      /** 资产条目里代替具体许可的说明，因为授权条款在来源页。 */
      licenceSeeSource: '来源授权见下',
      authorLabel: '作者',
      licenceLabel: '许可',
      fileLabel: '文件'
    },

    runtime: {
      title: '运行环境'
    }
  },

  common: {
    /** 数据尚未从主进程返回时的占位。 */
    pending: '…',
    /** 无法计算时显示的占位符。 */
    unavailable: '—'
  }
}
