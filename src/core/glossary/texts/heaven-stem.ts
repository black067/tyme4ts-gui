import type { GlossaryEntry } from '../types'

/**
 * 十干（甲乙丙丁戊己庚辛壬癸）。
 *
 * 词条的 key 必须是引擎 `HeavenStem.NAMES` 里的名字，由契约测试交叉校验。
 *
 * 引文取自 `tests/fixtures/xieji-bianfangshu/juan-01.txt` 卷一「本原一」所引
 * 《史记·律书》的训诂。两处要注意：
 *
 * - **戊、己在律书那段里没有训诂**。律书把十干两两配在月下（甲乙、丙丁、庚辛、壬癸），
 *   独缺戊己。所以这两条改引同卷所录《尔雅》的「岁阳」别名（在戊曰著雍、在已曰屠维），
 *   引文是别名而非字义——summary 里如实说明。
 * - 四库本「己」写作「已」（同形异码），引文保留原写法。
 */

const LVSHU = '《协纪辨方书》卷一·本原一引《史记·律书》'
const ERYA = '《协纪辨方书》卷一·本原一引《尔雅》'

function entry(summary: string, quote: string, source: string): GlossaryEntry {
  return { summary, quote, source }
}

export const HEAVEN_STEM_ENTRIES: Readonly<Record<string, GlossaryEntry>> = {
  甲: entry('言万物剖符甲而出。', '甲者言万物剖符甲而出也', LVSHU),
  乙: entry('言万物生长受阻于轧轧之状。', '乙者言万物生轧轧也', LVSHU),
  丙: entry('言阳道著明。', '丙者言阳道著明故曰丙', LVSHU),
  丁: entry('言万物之壮盛。', '丁者言万物之丁壮也故曰丁', LVSHU),
  戊: entry('岁阳别名「著雍」。律书未训其义，此引《尔雅》别名。', '在戊曰著雍', ERYA),
  己: entry('岁阳别名「屠维」。律书未训其义，此引《尔雅》别名。', '在已曰屠维', ERYA),
  庚: entry('言阴气更革万物。', '庚者言阴气庚万物故曰庚', LVSHU),
  辛: entry('言万物之新生。', '辛者言万物之辛生故曰辛', LVSHU),
  壬: entry('言阳气任养万物于下。', '壬之为言任也言阳气任养万物于下也', LVSHU),
  癸: entry('言万物可以揆度。', '癸之为言揆也言万物可揆度故曰癸', LVSHU)
}
