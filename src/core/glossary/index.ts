/**
 * 术语释义的查表入口。
 *
 * 纯数据 + 纯函数：不 import tyme4ts，不碰 Electron / React / DOM。
 * 引擎的权威名单与引文的逐字真实性都由 `tests/glossary-contract.test.ts` 交叉校验。
 */
import type { GlossaryEntry, GlossaryFamily, GlossaryFamilyData } from './types'
import { DUTY_ENTRIES } from './texts/duty'
import { GOD_ENTRIES } from './texts/gods'
import { PHASE_ENTRIES } from './texts/phase'
import { STAR28_ENTRIES } from './texts/star28'
import { TERM_ENTRIES } from './texts/terms'
import { TWELVE_STAR_ENTRIES } from './texts/twelve-star'

export type { GlossaryBasis, GlossaryEntry, GlossaryFamily, GlossaryFamilyData } from './types'

/** 《协纪辨方书》义例（卷三–卷八）的 fixture，五部共有。 */
const XIEJI_FIXTURE = 'tests/fixtures/xieji-bianfangshu'

export const GLOSSARY: Readonly<Record<GlossaryFamily, GlossaryFamilyData>> = {
  god: {
    label: '吉神凶煞',
    basis: 'xieji',
    fixture: XIEJI_FIXTURE,
    entries: GOD_ENTRIES
  },
  duty: {
    label: '建除十二神',
    basis: 'xieji',
    fixture: XIEJI_FIXTURE,
    entries: DUTY_ENTRIES
  },
  twelveStar: {
    label: '黄道黑道十二神',
    basis: 'xieji',
    fixture: XIEJI_FIXTURE,
    entries: TWELVE_STAR_ENTRIES
  },
  star28: {
    label: '二十八宿',
    basis: 'xieji',
    fixture: XIEJI_FIXTURE,
    entries: STAR28_ENTRIES
  },
  phase: {
    label: '月相',
    basis: 'common',
    rationale: '月相是纯天文现象，八相的名称与含义不存在异说，不需要典籍依据。',
    entries: PHASE_ENTRIES
  },
  term: {
    label: '二十四节气',
    basis: 'common',
    rationale: '节气按太阳黄经划分，名称即其含义，不存在异说，不需要典籍依据。',
    entries: TERM_ENTRIES
  }
}

export const GLOSSARY_FAMILIES: readonly GlossaryFamily[] = [
  'god',
  'duty',
  'twelveStar',
  'star28',
  'phase',
  'term'
]

/**
 * 查一个术语的释义。
 *
 * 没有收录时返回 `null`——调用方据此渲染纯文本，不出浮层。
 * 引擎会产出的名字与实际收录的名字是两回事，缺口由契约测试显式列出。
 */
export function lookupTerm(family: GlossaryFamily, name: string): GlossaryEntry | null {
  return GLOSSARY[family].entries[name] ?? null
}
