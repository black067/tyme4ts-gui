/**
 * 术语释义的契约测试。
 *
 * 三条底线，任何一条被破坏都说明数据不可信：
 *
 * 1. **每个引擎名都要有交代**——要么有释义，要么有缺口说明。两者合起来必须恰好
 *    覆盖引擎的名单：不能有名字被悄悄漏掉（用户悬停毫无反应），也不能有引擎不认识的
 *    名字（多半是写错字或 tyme4ts 升级后改了名）。
 * 2. **引文必须逐字可查**——`quote` 必须出现在 tests/fixtures/ 的公版原文里。
 *    比较时忽略空白与标点，因为四库本原无句读、标点是后来补的；文字本身一个字
 *    都不能多、不能少、不能改。这条挡的是「编造引文」。
 * 3. **缺口说明不能冒充释义**——理由必须写清楚，措辞来自受控的几句话。
 *
 * 有释义的和没释义的都会出浮层，区别只在浮层内容；所以「覆盖率」不再是体验问题，
 * 而是诚实问题：缺了就说明缺了。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  Duty,
  Element,
  God,
  MinorRen,
  NineStar,
  Phase,
  SixStar,
  SolarTerm,
  Taboo,
  TwelveStar,
  TwentyEightStar
} from 'tyme4ts'
import { GLOSSARY, GLOSSARY_FAMILIES, lookupTerm } from '../src/core/glossary'
import type { GlossaryFamily } from '../src/core/glossary'

const ROOT = process.cwd()

/**
 * 九星的引擎名是 `toString()` 的结果（一白水…九紫火），不是 `NineStar.NAMES`（一…九）——
 * 界面上显示的是前者，所以词条的键也必须是前者。
 */
const NINE_STAR_NAMES = Array.from({ length: 9 }, (_, index) =>
  NineStar.fromIndex(index).toString()
)

/** 各家族在引擎里的权威名单。 */
const ENGINE_NAMES: Readonly<Record<GlossaryFamily, readonly string[]>> = {
  god: God.NAMES,
  duty: Duty.NAMES,
  twelveStar: TwelveStar.NAMES,
  star28: TwentyEightStar.NAMES,
  phase: Phase.NAMES,
  term: SolarTerm.NAMES,
  fiveElement: Element.NAMES,
  nineStar: NINE_STAR_NAMES,
  sixStar: SixStar.NAMES,
  minorRen: MinorRen.NAMES,
  taboo: Taboo.NAMES
}

/** 去掉空白与标点，只留文字。与 scripts/glossary/extract-quotes.mjs 的 fold 保持一致。 */
function foldText(text: string): string {
  return text.replace(/[\s，。、；：！？「」『』（）〈〉《》·—○]/g, '')
}

const SUMMARY_MAX = 60

/** fixture 全文（去标点），按路径缓存。 */
const fixtureCache = new Map<string, string>()
function fixtureText(path: string): string {
  const cached = fixtureCache.get(path)
  if (cached !== undefined) return cached
  const dir = join(ROOT, path)
  const folded = foldText(
    readdirSync(dir)
      .filter((name) => name.endsWith('.txt'))
      .sort()
      .map((name) => readFileSync(join(dir, name), 'utf8'))
      .join('\n')
  )
  fixtureCache.set(path, folded)
  return folded
}

describe('引擎的每个名字都有交代', () => {
  for (const family of GLOSSARY_FAMILIES) {
    it(`${family}：释义 + 缺口恰好覆盖引擎名单`, () => {
      const engine = ENGINE_NAMES[family]
      const known = new Set(engine)
      const data = GLOSSARY[family]

      const unaccounted = engine.filter((name) => !(name in data.entries) && !(name in data.gaps))
      const unknown = [...Object.keys(data.entries), ...Object.keys(data.gaps)].filter(
        (name) => !known.has(name)
      )

      expect(unaccounted).toEqual([])
      expect(unknown).toEqual([])
      expect(engine.length).toBeGreaterThan(0)
    })

    it(`${family}：同一个名字不同时有释义又有缺口`, () => {
      const data = GLOSSARY[family]
      const both = Object.keys(data.entries).filter((name) => name in data.gaps)
      expect(both).toEqual([])
    })
  }

  it('确实扫到了引擎的名单', () => {
    // 防止 ENGINE_NAMES 写错导致上面几条空转通过。
    expect(God.NAMES.length).toBeGreaterThan(100)
    expect(ENGINE_NAMES.star28).toHaveLength(28)
    expect(ENGINE_NAMES.term).toHaveLength(24)
    expect(ENGINE_NAMES.nineStar).toHaveLength(9)
  })
})

describe('引文必须逐字出现在公版原文里', () => {
  for (const family of GLOSSARY_FAMILIES) {
    const data = GLOSSARY[family]
    if (data.basis !== 'xieji') continue

    it(`${family} 的每条引文都能在 fixture 中找到`, () => {
      const familyFixture = data.fixture as string
      expect(fixtureText(familyFixture).length).toBeGreaterThan(1000)

      const offenders: string[] = []
      for (const [name, entry] of Object.entries(data.entries)) {
        if (!entry.quote) {
          offenders.push(`${name}: 缺少 quote`)
          continue
        }
        // 一条引文只回到它自己那本书里校验：家族引了第二部书时，
        // 用别的书"验"过就等于没验。
        const fixture = entry.fixture ?? familyFixture
        if (!fixtureText(fixture).includes(foldText(entry.quote))) {
          offenders.push(`${name}: 引文不在 ${fixture} 中 → ${entry.quote}`)
        }
        if (!entry.source) offenders.push(`${name}: 缺少 source`)
      }
      expect(offenders).toEqual([])
    })
  }

  it('检测得出来自编造的引文', () => {
    // 让上面那条断言不可能空转通过。
    const haystack = fixtureText('tests/fixtures/xieji-bianfangshu')
    expect(haystack.includes(foldText('天恩者施德宽下之辰也'))).toBe(true)
    expect(haystack.includes(foldText('天恩者是编造的引文也'))).toBe(false)
  })
})

describe('缺口说明写得清楚', () => {
  it('每条缺口都有非空的理由', () => {
    const offenders: string[] = []
    for (const family of GLOSSARY_FAMILIES) {
      for (const [name, note] of Object.entries(GLOSSARY[family].gaps)) {
        if (!note.reason.trim()) offenders.push(`${family}/${name}: reason 为空`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('缺口理由只用受控的几种措辞，不逐条编故事', () => {
    const reasons = new Set<string>()
    for (const family of GLOSSARY_FAMILIES) {
      for (const note of Object.values(GLOSSARY[family].gaps)) reasons.add(note.reason)
    }
    expect([...reasons].length).toBeLessThanOrEqual(6)
  })

  it('确实存在缺口——否则这套说明是多余的分支', () => {
    const total = GLOSSARY_FAMILIES.reduce(
      (sum, family) => sum + Object.keys(GLOSSARY[family].gaps).length,
      0
    )
    expect(total).toBeGreaterThan(50)
  })
})

describe('每条词条都完整且简短', () => {
  it('summary 非空、不超长，来源分档的字段齐全', () => {
    const offenders: string[] = []
    for (const family of GLOSSARY_FAMILIES) {
      const data = GLOSSARY[family]
      if (data.basis !== 'xieji' && !data.rationale) {
        offenders.push(`${family}: basis 为 ${data.basis} 但没有 rationale`)
      }
      if (data.basis === 'xieji' && !data.fixture) {
        offenders.push(`${family}: basis 为 xieji 但没有 fixture`)
      }
      if (data.basis === 'none' && Object.keys(data.entries).length > 0) {
        offenders.push(`${family}: basis 为 none 却有释义条目`)
      }
      for (const [name, entry] of Object.entries(data.entries)) {
        const where = `${family}/${name}`
        if (!entry.summary.trim()) offenders.push(`${where}: summary 为空`)
        if ([...entry.summary].length > SUMMARY_MAX) {
          offenders.push(`${where}: summary 超过 ${SUMMARY_MAX} 字`)
        }
        if (data.basis === 'xieji' && !entry.quote) offenders.push(`${where}: 缺少 quote`)
        if (data.basis === 'xieji' && !entry.source) offenders.push(`${where}: 缺少 source`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('每个家族都有名字，总量符合预期', () => {
    let total = 0
    for (const family of GLOSSARY_FAMILIES) {
      const data = GLOSSARY[family]
      const count = Object.keys(data.entries).length + Object.keys(data.gaps).length
      expect(count).toBeGreaterThan(0)
      total += Object.keys(data.entries).length
    }
    expect(total).toBeGreaterThanOrEqual(180)
  })
})

describe('查表接口', () => {
  it('有释义返回 entry，只有缺口返回 gap，完全不认识返回 null', () => {
    expect(lookupTerm('god', '天恩')?.kind).toBe('entry')
    expect(lookupTerm('duty', '建')?.kind).toBe('entry')
    expect(lookupTerm('god', '咸池')).toEqual({
      kind: 'gap',
      note: expect.objectContaining({ reason: expect.any(String) })
    })
    expect(lookupTerm('sixStar', '友引')?.kind).toBe('gap')
    expect(lookupTerm('god', '这个名字不存在')).toBeNull()
  })

  it('缺口说明指得出位置时就带上出处', () => {
    const found = lookupTerm('god', '时德')
    expect(found?.kind).toBe('gap')
    if (found?.kind === 'gap') expect(found.note.source).toContain('卷五')
  })
})
