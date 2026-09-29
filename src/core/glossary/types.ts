/**
 * 术语释义的数据契约。
 *
 * 这一层是**纯数据**：不 import tyme4ts、不碰 Electron / React / DOM。
 * 引擎的权威名单由 `tests/glossary-contract.test.ts` 交叉校验，词条里的 `quote`
 * 也必须逐字出现在 `tests/fixtures/` 的公版原文里——所以这里写错字或编造引文都会失败。
 */

/** 术语家族。每个家族对应界面上的一组同类标签。 */
export type GlossaryFamily =
  | 'god'
  | 'duty'
  | 'twelveStar'
  | 'star28'
  | 'phase'
  | 'term'
  | 'fiveElement'
  | 'heavenStem'
  | 'earthBranch'
  | 'nineStar'
  | 'sixStar'
  | 'minorRen'
  | 'taboo'

/**
 * 依据分档。决定 `quote` 是否必需，以及详情里怎么标出处。
 *
 * - `xieji`    《钦定协纪辨方书》义例，有原文定义句，可逐字校验
 * - `common`   天文/历法常识，不存在异说，无需典籍依据
 * - `authored` 本应用撰写的通俗释义——古籍里确实没有可引用的词义解释
 * - `none`     整族拿不到依据，全部是缺口
 */
export type GlossaryBasis = 'xieji' | 'common' | 'authored' | 'none'

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
  /**
   * 该校验这一条引文的 fixture 目录，覆盖家族级的 `fixture`。
   *
   * 一个家族可能引两部书（例如二十八宿：二十三宿引《协纪》、五宿引《晋书·天文志》），
   * 而引文必须分别回到**它自己那本书**里逐字校验。把两本书塞进同一个目录虽然也能过，
   * 但那样任何一条引文都能被另一本书"验"过，校验就失去意义了。
   *
   * 单书家族不必写：留空即用家族级的 `fixture`。
   */
  fixture?: string
}

/**
 * 缺口说明。
 *
 * 与其让一个标签悬停时毫无反应，不如老实说清楚缺什么；能找到位置的就把位置指出来，
 * 让读者自己去查。缺口说明不冒充释义——`reason` 的措辞是受控的几句话，不逐条编故事。
 */
export interface GlossaryGapNote {
  /** 为什么没有释义。 */
  reason: string
  /** 想自己查的话去哪儿找。确实没有可靠位置时省略。 */
  source?: string
}

export interface GlossaryFamilyData {
  /** 家族显示名，用于详情标题与文档。 */
  label: string
  basis: GlossaryBasis
  /** `basis` 非 `xieji` 时必填：为什么这一族不需要／拿不到典籍依据。 */
  rationale?: string
  /** fixture 路径（相对仓库根），`basis === 'xieji'` 时必填，供引文逐字校验。 */
  fixture?: string
  /** 有释义的名字。 */
  entries: Readonly<Record<string, GlossaryEntry>>
  /** 引擎会产出但没有释义的名字——两者合起来必须覆盖引擎的全部名单。 */
  gaps: Readonly<Record<string, GlossaryGapNote>>
}

/**
 * 一次查表的结果。
 *
 * `null` 表示这个名字连引擎都不认识（正常不会出现，界面上的值都来自引擎），
 * 调用方据此渲染纯文本。
 */
export type TermLookup =
  { kind: 'entry'; entry: GlossaryEntry } | { kind: 'gap'; note: GlossaryGapNote }
