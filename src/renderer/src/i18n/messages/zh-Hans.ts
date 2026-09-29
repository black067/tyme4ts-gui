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

  /**
   * 法定节假日角标。
   *
   * 月视图、年视图、检索结果三处都显示同一对字，所以放在共享位置：
   * 各写一份会在改动时漏掉其中一处。
   */
  badges: {
    /** 调休上班。 */
    work: '班',
    /** 放假。 */
    rest: '休'
  },

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

  pillars: {
    /** 区域名称与标题共用。 */
    title: '八字排盘',
    genderLabel: '性别',
    male: '男',
    female: '女',
    birthTimeLabel: '出生时刻',
    /** 晚子时规则：23:00–23:59 出生时，日柱进位到次日。 */
    ruleNote: '23:00–23:59 出生时，日柱进位到次日（晚子时）。',
    /** 四柱表的列头。 */
    columns: {
      year: '年柱',
      month: '月柱',
      day: '日柱',
      hour: '时柱'
    },
    /** 四柱表的行头。这些同时是术语名，属于历法数据而非界面文案。 */
    rows: {
      cycle: '干支',
      tenStar: '十神',
      hiddenStems: '藏干',
      elements: '五行',
      nayin: '纳音'
    },
    /** 四柱表的无障碍名称。 */
    chartLabel: '四柱',
    /** 日主一行，如「日主 乙木」。 */
    dayMaster: ({ stem }: { stem: string }): string => `日主 ${stem}`,
    /** 五行统计的无障碍名称，也是小节标题。 */
    elementTally: '五行统计',
    /** 起运小节。 */
    childLimit: {
      title: '起运',
      /** 阳年生男/阴年生女顺行，其余逆行。 */
      directionLabel: '阳顺阴逆',
      forward: '顺行',
      backward: '逆行',
      /** 起运所需时长的行标签。 */
      durationLabel: '起运',
      /** 具体起运时刻的行标签。 */
      startLabel: '起运时刻',
      /** 起运年龄，如「5 年 6 个月 21 天」。 */
      years: ({ years, months, days }: { years: number; months: number; days: number }): string =>
        `${years} 年 ${months} 个月 ${days} 天`,
      /** 引擎推不出起运时的说明。 */
      unavailable: '该日期无法推算起运。'
    },
    /** 大运小节。 */
    decades: {
      title: '大运',
      /** 年龄区间，如「6–15 岁」。 */
      ageRange: ({ from, to }: { from: number; to: number }): string => `${from}–${to} 岁`,
      /** 起始年份，如「1995 起」。 */
      startYear: ({ year }: { year: number }): string => `${year} 起`
    },
    /** 流年小节。 */
    fortunes: {
      title: '流年（起运后）',
      age: ({ age }: { age: number }): string => `${age} 岁`
    }
  },

  search: {
    /** 区域名称与标题共用。 */
    title: '择日检索',
    clear: '清空条件',
    rangeLabel: '起始',
    rangeEndLabel: '结束',
    presets: {
      days30: '未来 30 天',
      days90: '未来 90 天',
      year: '未来一年'
    },
    /** 从多个选项里挑的标签：「宜（需同时包含）」等。 */
    pickers: {
      recommends: '宜（需同时包含）',
      avoids: '忌（需同时包含）',
      terms: '节气（任一）'
    },
    switches: {
      weekendsOnly: '仅周末',
      restDaysOnly: '仅法定休息日',
      excludeMakeupDays: '排除调休上班'
    },
    run: '开始检索',
    running: '检索中…',
    /** 扫描范围摘要；被上限截断时补一句。 */
    span: ({ days, clipped, max }: { days: number; clipped: boolean; max: number }): string =>
      `共 ${days} 天${clipped ? `（已截断至上限 ${max} 天）` : ''}`,
    errors: {
      invalidRange: '日期范围无效，请检查起止日期。',
      reversedRange: '起始日期不能晚于结束日期。'
    },
    progress: '正在检索，请稍候…',
    empty: '没有符合条件的日期。',
    /** 结果摘要。 */
    summary: ({
      hits,
      scanned,
      limitReached
    }: {
      hits: number
      scanned: number
      limitReached: boolean
    }): string =>
      `命中 ${hits} 天${limitReached ? '（已达结果上限，请缩小范围）' : ''}，共扫描 ${scanned} 天。`,
    hint: '设置条件后点击「开始检索」。',
    /** 命中条目：在月视图中打开某天。 */
    openInMonth: '在月视图中打开',
    openInMonthLabel: ({ iso }: { iso: string }): string => `在月视图中打开 ${iso}`
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
    /** 当前节气已过几天，如「立春 第3天」。 */
    termDay: ({ name, day }: { name: string; day: number }): string => `${name} 第${day}天`,
    /** 二十八宿的值，如「角宿（东方蛟）· 吉」。 */
    starDetail: ({
      name,
      zone,
      beast,
      luck
    }: {
      name: string
      zone: string
      beast: string
      luck: string
    }): string => `${name}宿（${zone}方${beast}）· ${luck}`,
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
     * 该年份没有放假安排数据时的说明。
     *
     * 不提引擎名字，也不写死覆盖区间——那是实现细节，且区间会随在线数据更新而变化。
     */
    noHolidayData: '该年份暂无放假安排数据。',
    /** 假期统计角标：休 / 班。 */
    holidayBadge: ({ rest, work }: { rest: number; work: number }): string =>
      `休 ${rest} 天 · 班 ${work} 天`
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
      themeLabel: '主题',
      modeLabel: '外观',
      /** 主题族的显示名，按 `ThemeDefinition.id` 取。 */
      themeNames: {
        minimal: '现代简约',
        classic: '中国传统'
      },
      /** 主题族的说明。 */
      themeDescriptions: {
        minimal: '浅色卡片、克制的朱红点缀，信息密度高，长时间阅读不累眼。',
        classic: '宣纸底色、朱红与墨色，衬线字体与更宽的留白，更接近老黄历的观感。'
      },
      /** 「当前生效：现代简约 · minimal」。 */
      current: ({ theme, resolved }: { theme: string; resolved: string }): string =>
        `当前生效：${theme} · ${resolved}`,
      system: '跟随系统',
      light: '浅色',
      dark: '深色'
    },

    language: {
      title: '语言'
    },

    display: {
      title: '显示',
      weekStart: '周一为一周首日',
      almanac: '显示黄历（宜忌 / 神煞 / 胎神等）',
      glossary: '术语说明（悬停看释义，点击看出处）',
      startViewLabel: '启动时打开'
    },

    updates: {
      title: '更新',
      /** 版本号旁边的小标记：已是最新。 */
      latest: '最新',
      /** 当前版本，如「v0.1.3」。 */
      current: ({ version }: { version: string }): string => `v${version}`,
      /** 最近一次检查的时间；从未检查过时用 neverChecked。 */
      lastChecked: ({ time }: { time: string }): string => `上次检查 ${time}`,
      neverChecked: '尚未检查过',
      check: '检查更新',
      checking: '检查中…',
      download: '下载',
      downloading: ({ percent }: { percent: number }): string => `下载中 ${percent}%`,
      cancel: '取消',
      install: '重启并安装',
      /** 下载完成后的提示。 */
      ready: '下载完成，重启后生效。',
      autoCheck: '启动时自动检查更新',
      /** 各错误码的说法，一个错误码一句，不拼接。 */
      error: {
        network: '无法连接到 GitHub，请检查网络后重试。',
        rateLimited: 'GitHub 接口访问次数已达上限，请稍后再试。',
        noCompatibleAsset: '该版本没有适用于本机的安装文件。',
        checksumMismatch: '下载文件的校验值不符，已丢弃，请重试。',
        disk: '下载失败或写入磁盘出错，请重试。',
        installFailed: '无法启动新版本，已为你打开文件所在位置。',
        unknown: '更新过程中出现未知错误。'
      }
    },

    data: {
      title: '数据',
      dir: '数据目录',
      file: '设置文件'
    },

    holidays: {
      title: '节假日数据',
      autoUpdate: '启动时更新节假日数据',
      refresh: '立即更新',
      refreshing: '正在更新…',
      /** 最近一次成功更新的时间。 */
      lastUpdated: ({ time }: { time: string }): string => `上次更新：${time}`,
      /** 还没有数据时的状态。 */
      never: '尚未更新过。',
      /** 覆盖了哪些年份。 */
      years: ({ years }: { years: string }): string => `已覆盖年份：${years}`,
      /** 各错误码的说法。 */
      error: {
        network: '无法获取节假日数据，将继续使用已有数据。',
        invalidData: '节假日数据格式无法识别，已保留原有数据。',
        disk: '写入节假日缓存失败。',
        unknown: '更新节假日数据时出现未知错误。'
      }
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
      usage: {
        tyme4ts: '全部历法、节假日与黄历数据（公历 / 农历 / 藏历 / 回历 / 节气 / 宜忌 / 八字）',
        electron: '桌面应用运行时（Chromium + Node.js）',
        react: '界面渲染',
        tanstackVirtual: '时间轴视图的虚拟滚动',
        electronToolkit: '主进程开发期辅助（开发者快捷键等）',
        chineseDays: '在线更新的法定节假日数据（抓取自国务院公告）'
      }
    },

    assets: {
      title: '资产署名',
      authorLabel: '作者',
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
    unavailable: '—',
    /** 多选组件里清空已选项。 */
    clear: '清除'
  }
}
