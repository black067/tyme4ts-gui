/**
 * 术语释义的查表入口。
 *
 * 纯数据 + 纯函数：不 import tyme4ts，不碰 Electron / React / DOM。
 * 引擎的权威名单与引文的逐字真实性都由 `tests/glossary-contract.test.ts` 交叉校验。
 *
 * 约定：每个家族的 `entries` 与 `gaps` 合起来必须**恰好覆盖**引擎的名单。
 * 有释义的给释义，没有的老实说明缺什么——不留悬停时毫无反应的标签，也不编造出处。
 */
import type {
  GlossaryEntry,
  GlossaryFamily,
  GlossaryFamilyData,
  GlossaryGapNote,
  TermLookup
} from './types'
import { DUTY_ENTRIES } from './texts/duty'
import { EARTH_BRANCH_ENTRIES } from './texts/earth-branch'
import { FIVE_ELEMENT_ENTRIES } from './texts/elements'
import { GOD_ENTRIES } from './texts/gods'
import { HEAVEN_STEM_ENTRIES } from './texts/heaven-stem'
import { PHASE_ENTRIES } from './texts/phase'
import { STAR28_ENTRIES } from './texts/star28'
import { TABOO_ENTRIES } from './texts/taboo'
import { TERM_ENTRIES } from './texts/terms'
import { TWELVE_STAR_ENTRIES } from './texts/twelve-star'
import {
  GOD_GAPS,
  MINOR_REN_GAPS,
  NINE_STAR_GAPS,
  SIX_STAR_GAPS,
  STAR28_GAPS,
  TABOO_GAPS
} from './texts/gaps'

export type {
  GlossaryBasis,
  GlossaryEntry,
  GlossaryFamily,
  GlossaryFamilyData,
  GlossaryGapNote,
  TermLookup
} from './types'

/** 《协纪辨方书》义例（卷一–卷八）的 fixture。 */
const XIEJI_FIXTURE = 'tests/fixtures/xieji-bianfangshu'

export const GLOSSARY: Readonly<Record<GlossaryFamily, GlossaryFamilyData>> = {
  god: {
    label: '吉神凶煞',
    basis: 'xieji',
    fixture: XIEJI_FIXTURE,
    entries: GOD_ENTRIES,
    gaps: GOD_GAPS
  },
  duty: {
    label: '建除十二神',
    basis: 'xieji',
    fixture: XIEJI_FIXTURE,
    entries: DUTY_ENTRIES,
    gaps: {}
  },
  twelveStar: {
    label: '黄道黑道十二神',
    basis: 'xieji',
    fixture: XIEJI_FIXTURE,
    entries: TWELVE_STAR_ENTRIES,
    gaps: {}
  },
  star28: {
    label: '二十八宿',
    basis: 'xieji',
    fixture: XIEJI_FIXTURE,
    entries: STAR28_ENTRIES,
    gaps: STAR28_GAPS
  },
  phase: {
    label: '月相',
    basis: 'common',
    rationale: '月相是天文现象，八相的名称与含义没有异说。',
    entries: PHASE_ENTRIES,
    gaps: {}
  },
  term: {
    label: '二十四节气',
    basis: 'common',
    rationale: '节气按太阳黄经划分，名称即其含义。',
    entries: TERM_ENTRIES,
    gaps: {}
  },
  fiveElement: {
    label: '五行',
    // 引文取自卷一「本原一」的「五行」一节，逐字可验；但古籍不为单个字下定义句，
    // 所以各条的时令方位是通行配属，不是原文训诂——注释里说明这一点。
    basis: 'xieji',
    fixture: XIEJI_FIXTURE,
    entries: FIVE_ELEMENT_ENTRIES,
    gaps: {}
  },
  heavenStem: {
    label: '十干',
    basis: 'xieji',
    fixture: XIEJI_FIXTURE,
    entries: HEAVEN_STEM_ENTRIES,
    gaps: {}
  },
  earthBranch: {
    label: '十二支',
    basis: 'xieji',
    fixture: XIEJI_FIXTURE,
    entries: EARTH_BRANCH_ENTRIES,
    gaps: {}
  },
  nineStar: {
    label: '九星',
    basis: 'none',
    rationale: '玄空飞星的通行说法，《协纪辨方书》没有收录它。',
    entries: {},
    gaps: NINE_STAR_GAPS
  },
  sixStar: {
    label: '六曜',
    basis: 'none',
    rationale: '六曜自日本暦注传来，中国古籍里没有对它的解释。',
    entries: {},
    gaps: SIX_STAR_GAPS
  },
  minorRen: {
    label: '小六壬',
    basis: 'none',
    rationale: '民间占法，古籍里没有对它的解释。',
    entries: {},
    gaps: MINOR_REN_GAPS
  },
  taboo: {
    label: '宜忌用事',
    basis: 'authored',
    rationale: '古籍只规定这些事项的宜忌，不解释词义，所以释义由本应用撰写。',
    entries: TABOO_ENTRIES,
    gaps: TABOO_GAPS
  }
}

export const GLOSSARY_FAMILIES: readonly GlossaryFamily[] = [
  'god',
  'duty',
  'twelveStar',
  'star28',
  'phase',
  'term',
  'fiveElement',
  'heavenStem',
  'earthBranch',
  'nineStar',
  'sixStar',
  'minorRen',
  'taboo'
]

/**
 * 查一个术语。
 *
 * 返回 `null` 表示这个名字连引擎都不认识——界面上的值都来自引擎，正常不会发生。
 * 有释义返回 `entry`，只有缺口说明返回 `gap`；两种都该出浮层，区别只在内容。
 */
export function lookupTerm(family: GlossaryFamily, name: string): TermLookup | null {
  const data = GLOSSARY[family]
  const entry: GlossaryEntry | undefined = data.entries[name]
  if (entry !== undefined) return { kind: 'entry', entry }

  const note: GlossaryGapNote | undefined = data.gaps[name]
  if (note !== undefined) return { kind: 'gap', note }

  return null
}
