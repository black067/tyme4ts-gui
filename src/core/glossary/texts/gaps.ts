import type { GlossaryGapNote } from '../types'

/**
 * 缺口说明：引擎会产出、但我们拿不到可逐字引用的释义的名字。
 *
 * 这些名字在界面上**照样可以悬停**：浮层老实说清楚为什么没有释义，
 * 并且在原文里确实提到过的时候，把位置指给读者自己去查。
 *
 * `reason` 只有下面四种措辞，不逐条编故事。
 */

/** 义例里提到过，但没有为它单独释义——能指位置，不能当解释用。 */
const MENTIONED_ONLY = '《协纪辨方书》提到过这个名字，但没有单独解释它的含义。'

/** 连义例都没收。 */
const NOT_IN_SOURCE = '《协纪辨方书》没有收录它，我们也没有找到其他可靠的古籍解释。'

/** 卷一引《史记·律书》逐宿释义，缺的五个宿不在那一段里。 */
const NOT_IN_LVSHU = '《协纪辨方书》引《史记·律书》解释二十八宿，但没有讲到这个宿。'

/** 民间说法，古籍里没有解释。 */
const FOLK_ONLY = '这是民间流传的说法，古籍里没有解释。'

/** 宜忌里生僻到我们自己也不敢下定义的名目。 */
const UNCLEAR_ITEM = '这个名目比较生僻，我们暂时不确定它的准确含义。'

/** 每日吉神凶煞的缺口。 */
export const GOD_GAPS: Readonly<Record<string, GlossaryGapNote>> = {
  鸣吠对: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷五·义例三' },
  生气: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷四·义例二、卷六·义例四' },
  福德: {
    reason: MENTIONED_ONLY,
    source: '《协纪辨方书》卷四·义例二、卷五·义例三、卷八·义例六'
  },
  六仪: {
    reason: MENTIONED_ONLY,
    source: '《协纪辨方书》卷三·义例一、卷四·义例二、卷五·义例三、卷七·义例五、卷八·义例六'
  },
  宝光: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷七·义例五' },
  阳德: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷五·义例三、卷六·义例四' },
  天医: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷四·义例二' },
  时德: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷五·义例三' },
  天符: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷七·义例五' },
  阴神: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷四·义例二' },
  解除: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷五·义例三' },
  致死: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷六·义例四' },
  大败: {
    reason: MENTIONED_ONLY,
    source: '《协纪辨方书》卷五·义例三、卷六·义例四、卷七·义例五'
  },
  咸池: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷五·义例三、卷六·义例四' },
  厌对: {
    reason: MENTIONED_ONLY,
    source: '《协纪辨方书》卷三·义例一、卷四·义例二、卷七·义例五'
  },
  招摇: {
    reason: MENTIONED_ONLY,
    source: '《协纪辨方书》卷四·义例二、卷五·义例三、卷七·义例五'
  },
  八专: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷五·义例三' },
  月刑: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷六·义例四、卷七·义例五' },
  四忌: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷五·义例三' },
  四穷: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷五·义例三' },
  阴错: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷四·义例二' },
  阳错: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷四·义例二' },
  八龙: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷五·义例三、卷八·义例六' },
  七鸟: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷五·义例三' },
  九虎: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷五·义例三' },
  六蛇: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷五·义例三' },
  岁薄: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷四·义例二' },
  逐阵: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷四·义例二' },
  三丧: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷八·义例六' },
  三阴: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷四·义例二' },
  阴道冲阳: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷四·义例二' },
  阴位: {
    reason: MENTIONED_ONLY,
    source: '《协纪辨方书》卷四·义例二、卷六·义例四、卷七·义例五'
  },
  阴阳交破: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷四·义例二' },
  阴阳俱错: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷四·义例二' },
  阴阳击冲: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷四·义例二' },
  单阴: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷四·义例二' },
  绝阴: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷三·义例一、卷四·义例二' },
  纯阳: {
    reason: MENTIONED_ONLY,
    source: '《协纪辨方书》卷四·义例二、卷五·义例三、卷六·义例四'
  },
  成日: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷四·义例二、卷六·义例四' },
  孤阳: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷四·义例二' },
  纯阴: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷四·义例二' },
  阳破阴冲: { reason: MENTIONED_ONLY, source: '《协纪辨方书》卷四·义例二' },
  鬼哭: { reason: NOT_IN_SOURCE },
  阳错阴冲: { reason: NOT_IN_SOURCE },
  七符: { reason: NOT_IN_SOURCE },
  大退: { reason: NOT_IN_SOURCE }
}

/** 二十八宿的缺口。 */
export const STAR28_GAPS: Readonly<Record<string, GlossaryGapNote>> = {
  昴: { reason: NOT_IN_LVSHU, source: '《协纪辨方书》卷一·本原一' },
  毕: { reason: NOT_IN_LVSHU, source: '《协纪辨方书》卷一·本原一' },
  觜: { reason: NOT_IN_LVSHU, source: '《协纪辨方书》卷一·本原一' },
  井: { reason: NOT_IN_LVSHU, source: '《协纪辨方书》卷一·本原一' },
  鬼: { reason: NOT_IN_LVSHU, source: '《协纪辨方书》卷一·本原一' }
}

/**
 * 九星（一白水…九紫火）。
 *
 * 玄空飞星的通行说法，没有可逐字引用的公版依据；《协纪辨方书》义例里也没有它的释义。
 */
export const NINE_STAR_GAPS: Readonly<Record<string, GlossaryGapNote>> = {
  一白水: { reason: FOLK_ONLY },
  二黑土: { reason: FOLK_ONLY },
  三碧木: { reason: FOLK_ONLY },
  四绿木: { reason: FOLK_ONLY },
  五黄土: { reason: FOLK_ONLY },
  六白金: { reason: FOLK_ONLY },
  七赤金: { reason: FOLK_ONLY },
  八白土: { reason: FOLK_ONLY },
  九紫火: { reason: FOLK_ONLY }
}

/** 六曜（先胜…赤口）。日本暦注传来，无中国公版典籍依据。 */
export const SIX_STAR_GAPS: Readonly<Record<string, GlossaryGapNote>> = {
  先胜: { reason: FOLK_ONLY },
  友引: { reason: FOLK_ONLY },
  先负: { reason: FOLK_ONLY },
  佛灭: { reason: FOLK_ONLY },
  大安: { reason: FOLK_ONLY },
  赤口: { reason: FOLK_ONLY }
}

/** 小六壬（大安…空亡）。民间占法，无公版典籍依据。 */
export const MINOR_REN_GAPS: Readonly<Record<string, GlossaryGapNote>> = {
  大安: { reason: FOLK_ONLY },
  留连: { reason: FOLK_ONLY },
  速喜: { reason: FOLK_ONLY },
  赤口: { reason: FOLK_ONLY },
  小吉: { reason: FOLK_ONLY },
  空亡: { reason: FOLK_ONLY }
}

/**
 * 宜忌里我们自己也不敢下定义的名目。
 *
 * 这一族的释义是本应用写的，所以这里的缺口不是"古籍没有"，而是"我们不确定"——
 * 与其猜一个可能错的解释，不如说清楚。
 */
export const TABOO_GAPS: Readonly<Record<string, GlossaryGapNote>> = {
  归岫: { reason: UNCLEAR_ITEM }
}
