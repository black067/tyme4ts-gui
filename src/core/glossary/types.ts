/**
 * 术语释义的数据契约。
 *
 * 这一层是**纯数据**：不 import tyme4ts、不碰 Electron / React / DOM。
 * 引擎的权威名单由 `tests/glossary-contract.test.ts` 交叉校验，词条里的 `quote`
 * 也必须逐字出现在 `tests/fixtures/` 的公版原文里——所以这里写错字或编造引文都会失败。
 */

/** 术语家族。每个家族对应界面上的一组同类标签。 */
export type GlossaryFamily = 'god' | 'duty' | 'twelveStar' | 'star28' | 'phase' | 'term'

/**
 * 依据分档。决定 `quote` 是否必需。
 *
 * - `xieji`   《钦定协纪辨方书》义例，有原文定义句
 * - `common`  天文/历法常识，不存在争议，无需典籍依据
 */
export type GlossaryBasis = 'xieji' | 'common'

export interface GlossaryEntry {
  /**
   * 一句白话释义，浮层正文。上限 60 字，由测试守住。
   * 依据原文定义句改写，不做自由创作。
   */
  summary: string
  /**
   * 公版原文定义句。`basis === 'xieji'` 时必需。
   *
   * 引文保留四库本的用字（异体字除外，见 scripts/glossary/variants.mjs），
   * 显示时补的标点不参与校验——测试比较时会同时忽略空白与标点。
   */
  quote?: string
  /** 出处，如「《协纪辨方书》卷四·义例二」。`basis === 'xieji'` 时必需。 */
  source?: string
}

export interface GlossaryFamilyData {
  /** 家族显示名，用于详情标题与文档。 */
  label: string
  basis: GlossaryBasis
  /** `basis === 'common'` 时必需：为什么这个概念不需要典籍依据。 */
  rationale?: string
  /** fixture 路径（相对仓库根），`basis === 'xieji'` 时必需，供引文逐字校验。 */
  fixture?: string
  entries: Readonly<Record<string, GlossaryEntry>>
}
