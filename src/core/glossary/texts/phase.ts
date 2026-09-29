import type { GlossaryEntry } from '../types'

/**
 * 月相。
 *
 * 纯天文现象，含义没有争议，也不需要典籍依据（`basis: 'common'`）。
 * 中文名取自引擎自带的八相表，日期为农历的约数。
 */
export const PHASE_ENTRIES: Readonly<Record<string, GlossaryEntry>> = {
  新月: { summary: '月球走到太阳与地球之间，整夜不可见。农历约在初一。' },
  蛾眉月: { summary: '新月之后细如蛾眉的月牙，日落后出现在西方低空。' },
  上弦月: { summary: '月面西半亮，天黑时位于南方天空。农历约在初七、初八。' },
  盈凸月: { summary: '上弦到满月之间，亮面已过半但还不足一整轮。' },
  满月: { summary: '地球走到太阳与月球之间，整夜可见。农历约在十五、十六。' },
  亏凸月: { summary: '满月之后，亮面开始亏缺，但仍大于半轮。' },
  下弦月: { summary: '月面东半亮，半夜才升起。农历约在廿二、廿三。' },
  残月: { summary: '下弦之后接近新月的月牙，黎明前见于东方低空。' }
}
