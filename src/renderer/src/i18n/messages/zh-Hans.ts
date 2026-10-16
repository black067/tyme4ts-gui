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
    /**
     * 骨架屏文案。`index.html` 里有逐字一致的 `data-locale` 副本节点，由
     * `tests/splash-contract.test.ts` 钉住——改这里不同步改 HTML，测试会红。
     */
    splash: '正在载入…',
    /** 磁盘上还没有用户目录时的骨架文案（那一轮要解包、要初始化，明显更慢）。 */
    splashFirstRun: '正在准备你的日历…',
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
    /** 写设置失败。改动还在屏幕上，但下次启动会回到老样子——只说这一句，剩下让人自己判断。 */
    saveFailed: '这个改动没存下来',

    appearance: {
      title: '外观',
      themeLabel: '主题',
      modeLabel: '外观',
      /** 主题族的显示名，按 `ThemeDefinition.id` 取。 */
      themeNames: {
        minimal: '现代简约',
        classic: '中国传统'
      },
      /** 主题族的说明。两句都要在"换了之后看得出来"这个范围内说话，不写观感形容词。 */
      themeDescriptions: {
        minimal: '浅色卡片、朱红点缀，密度高，适合长时间看',
        classic: '宣纸底、朱红与墨色，衬线字，更像老黄历'
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
      /** 下载完成。紧挨着就是"重启并安装"那颗按钮，不必再复述它能干什么。 */
      ready: '下载完成',
      /**
       * 便携版没有"装到哪里"的选择：更新就是替换用户双击的那个文件，
       * 所以这个路径必须在按下之前说出来，而不是事后让人去找。
       */
      installTarget: ({ path }: { path: string }): string => `安装位置：${path}`,
      /** 原地替换之后唯一的自证：这次启动是从哪个版本换过来的。 */
      updated: ({ version }: { version: string }): string => `已更新到 v${version}`,
      autoCheck: '启动时自动检查更新',
      /**
       * 各错误码的说法，一个错误码一句，不拼接。
       *
       * 都是 toast，所以统一不带句号，也只说"发生了什么、接下来该干什么"：一次失败不需要
       * 复述一遍程序的内部策略（"已保持原版本不变"这类话是写给开发者看的，用户看得见的是
       * 应用还在跑）。
       */
      error: {
        network: '连不上 GitHub，稍后再试',
        rateLimited: 'GitHub 请求太频繁，稍后再试',
        noCompatibleAsset: '这个版本没有适合本机的文件',
        checksumMismatch: '校验不符，已丢弃',
        disk: '下载没完成',
        targetNotWritable: '程序所在位置不能写，换个文件夹再更新',
        installFailed: '替换失败，仍在当前版本',
        unknown: '更新失败'
      }
    },

    holidays: {
      title: '节假日数据',
      autoUpdate: '启动时更新节假日数据',
      refresh: '立即更新',
      refreshing: '正在更新…',
      /** 最近一次成功更新的时间。 */
      lastUpdated: ({ time }: { time: string }): string => `上次更新：${time}`,
      /** 还没有数据时的状态。 */
      never: '还没有数据',
      /** 覆盖了哪些年份。 */
      years: ({ years }: { years: string }): string => `已覆盖年份：${years}`,
      /** 各错误码的说法。都是 toast，所以不带句号；"仍用本地这份"是用户最想知道的那半句。 */
      error: {
        network: '没取到节假日数据，仍用本地这份',
        invalidData: '数据格式不认识，仍用本地这份',
        disk: '缓存没写进去',
        unknown: '更新失败'
      }
    },

    /**
     * 关于：应用名、版本、作者、运行时与数据位置。
     *
     * 这些原本分成四个区块（作者信息 / 运行环境 / 数据…），每个只装一两行内容，
     * 却各占一整行标题加上下间距，页面显得很空。并成一个区块、用紧凑的键值列表。
     * 版本号只在这里出现一次——「更新」区块里已有它自己的版本号。
     */
    about: {
      title: '关于',
      versionLabel: '版本',
      authorLabel: '作者',
      runtimeLabel: '运行时',
      dataDirLabel: '数据目录',
      settingsFileLabel: '设置文件',
      /** package.json 里没写作者时的占位。 */
      missingAuthor: '（package.json 未填写）'
      // 运行时那一行由宿主直接给字符串（`Tauri 2.12.4 · WebView2 154…`）：
      // 旧版这里有三个版本号要并成一行，所以文案里带一个拼装函数；现在只剩一个值，
      // 没有文案可组装，格式属于运行时事实，不属于界面文案。
    },

    thirdParty: {
      title: '第三方许可',
      usage: {
        tyme4ts: '全部历法、节假日与黄历数据（公历 / 农历 / 藏历 / 回历 / 节气 / 宜忌 / 八字）',
        tauri:
          '桌面宿主：窗口、单实例、文件与网络能力的来源（含 fs / http / opener / dialog 四个官方插件）',
        webview2: '系统提供的浏览器引擎，界面与推算都跑在它里面；缺失时联网安装官方运行库',
        rustCrates: '宿主侧的下载、校验与注册表读取；完整清单见 src-tauri/Cargo.lock',
        react: '界面渲染',
        tanstackVirtual: '时间轴视图的虚拟滚动',
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
    }
  },

  /**
   * 数据目录那一行的动作与结果。
   *
   * 原来这批文案挂在 `settings.about.dataDir` 底下。"关于"只是提一下数据目录在哪，而这几个
   * 键讲的是"东西放在哪儿、能不能改、改完怎么说"——那是用户自己的地盘，不该埋在版本号旁边。
   *
   * 三组话不能混：`rejected*` 是"这个位置不行，换一个"，`move*`/`delete*` 的失败是"位置没
   * 问题，这次没成"，而两句成功都带"正在重启"——指向只能在进程开始之前改
   * （`src-tauri/src/paths.rs` 的头部记着这件事），不写这半句，用户会以为搬完了，
   * 然后在新位置找不到东西。
   */
  dataDir: {
    browse: '浏览',
    change: '修改',
    delete: '删除',
    /** 第二下才是不可逆的那一下，按钮上得写清楚现在按下去会发生什么。 */
    confirmDelete: '确认删除',
    /** 删除按钮旁边的说明。整屏只留这一句解释，所以它是唯一带句号的一句。 */
    deleteNote: '把整个目录移到回收站，重启后回到选择位置那一屏。',
    moved: ({ to }: { to: string }): string => `已搬到 ${to}，正在重启`,
    /** 两边都留一份不算失败，只是没打扫干净：报个数就够，不解释来龙去脉。 */
    leftBehind: ({ count }: { count: number }): string => `旧目录还剩 ${count} 个文件`,
    rejectedSame: '这就是当前目录',
    rejectedNested: '不能选它自己的子目录',
    rejectedRoot: '不能选磁盘根目录',
    rejectedNotDedicated: '换一个空文件夹，或本应用用过的文件夹',
    rejectedNotWritable: '这个文件夹写不进去',
    /** 校验不符、磁盘不行、认不出来——对用户是同一件事，不必分成三句话骗人。 */
    moveFailed: '搬运失败，数据还在原处',
    /** 选定位置时"地方没错、这次没成"那一种。首启那一屏与设置里那行共用。 */
    chooseFailed: '这个位置建不起来，换个地方再试',
    revealFailed: '打不开这个文件夹',
    deleted: '数据已移到回收站，正在重启',
    deleteNoBin: '这个位置没有回收站，先把程序移到本机硬盘再删',
    deleteBusy: '有文件正被占用，关掉占用它的程序再删',
    deleteMissing: '这个目录已经不在了',
    deleteFailed: '没能移到回收站，数据还在原处',
    /** 调试版按规矩不自动重启：位置已经记下，自己重开一次就生效。这不是失败，所以另有那句话。 */
    restartLater: '位置已经记下，重启后生效'
  },

  /** 首启那一屏：盘上还没有选定的用户目录，先请用户挑一个位置。 */
  setup: {
    title: '选择用户目录',
    intro: '日历的设置和数据都放在这一个目录里。选一个位置，或者自己填一个。',
    /** 选项标题。完整路径显示在它旁边：按下确定之前该知道东西会落在哪儿。 */
    userDir: '用户目录',
    exeDir: '可执行文件所在目录',
    custom: '自定义',
    customPlaceholder: '粘贴，或浏览选一个文件夹',
    browse: '浏览…',
    confirm: '确定',
    /** 按下去之后到重启之间的那句话：这一轮会建目录、写标记，然后整个程序重开。 */
    preparing: '正在准备…',
    /** 指针记着的位置不在盘上了（U 盘被拔走）。把原路径显示出来，让人知道不是丢了。 */
    recordedMissing: '上次记在这里：',
    /** 选项旁的小标记：这里已经有东西，选它不会动别人的文件。 */
    hasData: '已有数据',
    /** 灰掉那一项的原因。 */
    unwritable: '不能写',
    /** 连"有哪些位置可选"都问不到。这时这一屏什么都做不了，只能重开。 */
    loadFailed: '问不到可用的位置，重开一次试试'
  },

  /** 应用内提示。自己会消失，但读屏器与键盘用户需要一条立刻关掉的退路。 */
  toast: {
    dismiss: '关闭'
  },

  common: {
    /** 数据尚未取到时的占位。 */
    pending: '…',
    /** 无法计算时显示的占位符。 */
    unavailable: '—',
    /** 多选组件里清空已选项。 */
    clear: '清除'
  }
}
