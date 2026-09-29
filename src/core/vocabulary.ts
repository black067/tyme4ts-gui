import { EarthBranch, HeavenStem, SolarTerm, Taboo } from 'tyme4ts'

/**
 * The almanac vocabulary the tools let users pick from.
 *
 * These are curated subsets of tyme4ts's own tables rather than hand-typed
 * lists: the tests assert every entry exists in the engine's table, so a typo
 * or an upstream rename fails loudly instead of silently matching nothing.
 */

/** Every 宜/忌 item tyme4ts knows about. */
export const ALL_TABOO_ITEMS: readonly string[] = Taboo.NAMES

/**
 * 十干与十二支。
 *
 * 界面按字把干支串拆开挂术语浮层（`GanzhiText`），需要能判断某个字是干还是支；
 * 从引擎的表派生而不是手抄，理由同上面：引擎改名时这里会跟着变，不会静默失配。
 */
export const HEAVEN_STEMS: ReadonlySet<string> = new Set(HeavenStem.NAMES)
export const EARTH_BRANCHES: ReadonlySet<string> = new Set(EarthBranch.NAMES)

/** The items offered first in the picker — the ones people actually search for. */
export const COMMON_TABOO_ITEMS: readonly string[] = [
  '嫁娶',
  '祭祀',
  '祈福',
  '求嗣',
  '开光',
  '出行',
  '移徙',
  '入宅',
  '安床',
  '开市',
  '交易',
  '立券',
  '纳财',
  '纳采',
  '订盟',
  '动土',
  '修造',
  '上梁',
  '破土',
  '安葬',
  '栽种',
  '解除',
  '沐浴',
  '理发',
  '会亲友',
  '竖柱',
  '拆卸',
  '开仓'
]

/** A reasonable shortlist for the 忌 side of the picker. */
export const COMMON_AVOID_ITEMS: readonly string[] = [
  '嫁娶',
  '出行',
  '开市',
  '动土',
  '破土',
  '安葬',
  '移徙',
  '入宅',
  '作灶',
  '栽种',
  '修造',
  '开仓',
  '词讼',
  '赴任',
  '祈福',
  '求嗣',
  '安床',
  '伐木',
  '针灸',
  '掘井'
]

/** The 24 solar terms in calendar order (tyme4ts's own table starts at 冬至). */
export const SOLAR_TERM_NAMES: readonly string[] = [
  '小寒',
  '大寒',
  '立春',
  '雨水',
  '惊蛰',
  '春分',
  '清明',
  '谷雨',
  '立夏',
  '小满',
  '芒种',
  '夏至',
  '小暑',
  '大暑',
  '立秋',
  '处暑',
  '白露',
  '秋分',
  '寒露',
  '霜降',
  '立冬',
  '小雪',
  '大雪',
  '冬至'
]

/** The engine's own term table, exposed for the conformance test. */
export const ENGINE_TERM_NAMES: readonly string[] = SolarTerm.NAMES
