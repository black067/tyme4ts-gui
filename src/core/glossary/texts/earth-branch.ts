import type { GlossaryEntry } from '../types'

/**
 * 十二支（子丑寅卯辰巳午未申酉戌亥）。
 *
 * 词条的 key 必须是引擎 `EarthBranch.NAMES` 里的名字，由契约测试交叉校验。
 *
 * 引文取自 `tests/fixtures/xieji-bianfangshu/juan-01.txt` 卷一「本原一」所引
 * 《史记·律书》：律书逐月训诂十二支。句式以「X者…也」为主，寅作「寅言…」，
 * 卯作「卯之为言…也」——引文保留各自的句式，不改写。
 */
const SOURCE = '《协纪辨方书》卷一·本原一引《史记·律书》'

function entry(summary: string, quote: string): GlossaryEntry {
  return { summary, quote, source: SOURCE }
}

export const EARTH_BRANCH_ENTRIES: Readonly<Record<string, GlossaryEntry>> = {
  子: entry('言万物滋生于下。', '子者滋也滋者言万物滋于下也'),
  丑: entry('言阳气在上未降，万物纽结未敢出。', '丑者纽也言阳气在上未降万物厄纽未敢出'),
  寅: entry('言万物始生而螾然欲动。', '寅言万物始生螾然也故曰寅'),
  卯: entry('言万物茂盛。', '卯之为言茂也言万物茂也'),
  辰: entry('言万物之蜄（舒展）。', '辰者言万物之蜄也'),
  巳: entry('言阳气之已尽。', '巳者言阳气之已尽也'),
  午: entry('言阴阳相交。', '午者阴阳交故曰午'),
  未: entry('言万物皆成而有滋味。', '未者言万物皆成有滋味也'),
  申: entry('言阴气用事，申贼万物。', '申者言阴用事申贼万物故曰申'),
  酉: entry('言万物之老。', '酉者万物之老也故曰酉'),
  戌: entry('言万物尽灭。', '戌者言万物尽灭故曰戌'),
  亥: entry('言阳气藏于下，万物该藏。', '亥者该也言阳气藏于下故该也')
}
