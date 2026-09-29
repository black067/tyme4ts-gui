import type { GlossaryEntry } from '../types'

/**
 * 五行。
 *
 * 界面上，日详情的「五行」与八字排盘的「五行统计」都只显示这五个字，此前**完全没有浮层**。
 * 词条的 key 必须是引擎 `Element.NAMES` 里的名字（木火土金水），由契约测试交叉校验。
 *
 * 引文逐字取自 `tests/fixtures/xieji-bianfangshu/juan-01.txt` 卷一「本原一」的「五行」一节：
 * 它先引《尚书·洪范》给出五行的名目与次序，再解释「五行」这一名目的来由。
 *
 * 要如实说明一件事：**古典文献并不为「木」单独下定义句**，凡是以「木者，……也」
 * 形式出现的说法都是后人的发挥。所以这里的 `quote` 引的是五行的名目与得名之由，
 * 而各条 summary 里的时令方位属五行配四时五方的通行说法。不把发挥冒充原文。
 */

const SOURCE = '《协纪辨方书》卷一·本原一'

/** 《尚书·洪范》给出五行的名目与次序，是全节立论的起点。 */
const ORIGIN = '六经论五行者始见于尚书洪范曰一五行一曰水二曰火三曰木四曰金五曰土'

function entry(summary: string): GlossaryEntry {
  return { summary, quote: ORIGIN, source: SOURCE }
}

export const FIVE_ELEMENT_ENTRIES: Readonly<Record<string, GlossaryEntry>> = {
  木: entry('五行之一。时令属春，方位属东，其性主生发。'),
  火: entry('五行之一。时令属夏，方位属南，其性主炎上。'),
  土: entry('五行之一。位居中央，不专主一时，四季之末各旺十八日。'),
  金: entry('五行之一。时令属秋，方位属西，其性主肃杀收敛。'),
  水: entry('五行之一。时令属冬，方位属北，其性主润下闭藏。')
}
