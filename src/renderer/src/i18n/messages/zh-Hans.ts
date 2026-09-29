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
    label: '键盘快捷键',
    items: {
      shiftDay: '前一天 / 后一天',
      shiftWeek: '前一周 / 后一周',
      shiftMonth: '前一个月 / 后一个月',
      shiftYear: '前一年 / 后一年',
      goToday: '回到今天',
      switchView: '切换月 / 年 / 时间轴 / 工具',
      toggleHelp: '显示或隐藏本说明',
      closeHelp: '关闭说明'
    }
  },

  dayCell: {
    /** 法定节假日的角标：调休上班。 */
    workBadge: '班',
    /** 法定节假日的角标：放假。 */
    restBadge: '休'
  },

  tools: {
    /** 工具页的子工具选择。 */
    label: '工具',
    converter: '日期换算',
    search: '择日检索',
    pillars: '八字排盘'
  },

  converter: {
    /** 区域名称与标题共用。 */
    title: '日期换算器',
    useBrowsed: '用浏览中的日期',
    /** 输入历法的分段控件标签。 */
    inputKind: '输入历法',
    /** 各历法的名字。 */
    calendars: {
      solar: '公历',
      lunar: '农历',
      hijri: '回历',
      rabByung: '藏历',
      julianDay: '儒略日'
    },
    /** 字段标签。 */
    field: {
      year: '年',
      month: '月',
      day: '日',
      leap: '闰月',
      julianDay: '儒略日'
    },
    resultTitle: '换算结果',
    /** 结果行里独有的标签；历法名复用上方的 `calendars`。 */
    result: {
      solarWithWeekday: ({ solar, weekday }: { solar: string; weekday: string }): string =>
        `${solar} 星期${weekday}`,
      ganzhi: '干支',
      zodiac: '生肖',
      constellation: '星座'
    },
    /** 藏历的年份范围提示。范围是引擎的能力边界，所以由参数传入。 */
    rabByungRange: ({ from, to }: { from: number; to: number }): string =>
      `藏历仅支持 ${from}–${to} 饶迥年。`
  },

  dayPanel: {
    /** 日详情侧栏的区域名称。 */
    title: '日详情',
    /** 星期前缀，后接星期名。 */
    weekdayPrefix: '星期',
    /** 标签后缀：调休上班 / 放假。 */
    holidayWork: '班',
    holidayRest: '休',
    /** 黄历各小节标题。 */
    recommends: '宜',
    avoids: '忌',
    almanac: '黄历',
    gods: '吉神凶煞',
    /** 引擎推不出的日期（超出历法范围）时的说明。 */
    outOfRange: '该日期超出历法可推算范围。',
    /**
     * 黄历各行的标签。
     *
     * 这些名字同时是术语名（干支、纳音、五行…），属于历法数据而非界面文案：
     * 它们不随界面语言变化，正如术语释义的正文也不翻译。集中放在这里是为了
     * 便于查阅，而不是为了将来翻译。
     */
    facts: {
      ganzhi: '干支',
      sound: '纳音',
      element: '五行',
      zodiac: '生肖',
      constellation: '星座',
      phase: '月相',
      term: '节气',
      phenology: '物候',
      nineDay: '数九',
      dogDay: '三伏',
      plumRain: '梅雨',
      duty: '建除',
      twelveStar: '十二神',
      sixStar: '六曜',
      nineStar: '九星',
      fetus: '胎神',
      star28: '二十八宿',
      minorRen: '小六壬',
      pengZu: '彭祖百忌'
    }
  },

  year: {
    /** 年视图的区域名称。 */
    title: '年视图',
    prevYear: '上一年',
    nextYear: '下一年',
    goThisYear: '回到今年',
    /** 年标题，如「2024年」。 */
    heading: ({ year }: { year: number }): string => `${year}年`,
    /** 全年天数。 */
    dayCount: ({ days }: { days: number }): string => `共 ${days} 天`,
    /** 缩略月标题，如「6月」。 */
    monthHeading: ({ month }: { month: number }): string => `${month}月`,
    /** 缩略月的无障碍名称与展开按钮。 */
    monthLabel: ({ year, month }: { year: number; month: number }): string => `${year}年${month}月`,
    openMonth: '展开',
    openMonthLabel: ({ year, month }: { year: number; month: number }): string =>
      `在月视图中打开${year}年${month}月`,
    /** 日期展示，如「6月26日」。 */
    monthDay: ({ month, day }: { month: number; day: number }): string => `${month}月${day}日`,
    terms: '二十四节气',
    holidays: '法定假日',
    /**
     * 该年份没有内置节假日数据时的说明。
     *
     * 刻意不写出具体覆盖区间：区间随后续的在线数据更新而变，写进文案就一定会过期，
     * 而且这条提示只在引擎表没有该年数据时出现。覆盖范围见 data-boundaries.md。
     */
    noHolidayData: 'tyme4ts 内置的法定假日数据不覆盖该年份。',
    /** 假期统计角标：休 / 班。 */
    holidayBadge: ({ rest, work }: { rest: number; work: number }): string =>
      `休 ${rest} 天 · 班 ${work} 天`,
    /** 假期列表条目角标。 */
    workBadge: '班',
    restBadge: '休'
  },

  month: {
    /** 月视图的区域名称。 */
    title: '月视图',
    prevMonth: '上一个月',
    nextMonth: '下一个月',
    goToday: '回到今天',
    /** 月标题，如「2024年6月」。 */
    heading: ({ year, month }: { year: number; month: number }): string => `${year}年${month}月`,
    /** 网格的无障碍标签。 */
    gridLabel: ({ year, month, weeks }: { year: number; month: number; weeks: number }): string =>
      `${year}年${month}月，共 ${weeks} 周`
  },

  timeline: {
    /** 时间轴视图的区域名称，兼作标题。 */
    title: '时间轴',
    /** 日期行：月份 + 星期。 */
    monthWithWeekday: ({ month, weekday }: { month: number; weekday: string }): string =>
      `${month}月 · 星期${weekday}`,
    /** 假期标签后缀：调休上班 / 放假。 */
    holidayWork: '(班)',
    holidayRest: '(休)',
    /** 黄历两行的行首标签。 */
    recommends: '宜',
    avoids: '忌',
    /** 工具栏：窗口起点与跨度。 */
    span: ({ from, days }: { from: string; days: number }): string => `${from} 起 · 共 ${days} 天`,
    goToday: '回到今天'
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
      description: '本应用基于以下开源项目与资产构建。',
      usage: {
        tyme4ts: '全部历法、节假日与黄历数据（公历 / 农历 / 藏历 / 回历 / 节气 / 宜忌 / 八字）',
        electron: '桌面应用运行时（Chromium + Node.js）',
        react: '界面渲染',
        tanstackVirtual: '时间轴视图的虚拟滚动',
        electronToolkit: '主进程开发期辅助（开发者快捷键等）'
      }
    },

    assets: {
      title: '资产署名',
      description: '应用图标等美术资源的来源与作者。',
      /** 资产条目里代替具体许可的说明，因为授权条款在来源页。 */
      licenceSeeSource: '来源授权见下',
      authorLabel: '作者',
      licenceLabel: '许可',
      fileLabel: '文件',
      names: {
        calendarIcon: '应用图标（日历）'
      }
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
