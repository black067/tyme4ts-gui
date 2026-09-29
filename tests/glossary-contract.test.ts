/**
 * 术语释义的契约测试。
 *
 * 两条底线，任何一条被破坏都说明数据不可信：
 *
 * 1. **键必须真实存在**——每个词条的 key 都必须是引擎真会产出的名字。写错字、
 *    或 tyme4ts 升级后改名，都会在这里失败，而不是让用户悬停时看到空浮层。
 * 2. **引文必须逐字可查**——`quote` 必须出现在 tests/fixtures/ 的公版原文里。
 *    比较时忽略空白与标点，因为四库本原无句读，标点是后来补的；文字本身一个字
 *    都不能多、不能少、不能改。这条挡的是"编造引文"。
 *
 * 覆盖不到的条目显式列在 `KNOWN_GAPS` 里。它们不出浮层，而不是配上编造的出处。
 * 新增覆盖时这条断言会先失败，逼着把缺口清单一起改掉。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Duty, God, Phase, SolarTerm, TwelveStar, TwentyEightStar } from 'tyme4ts'
import { GLOSSARY, GLOSSARY_FAMILIES, lookupTerm } from '../src/core/glossary'
import type { GlossaryFamily } from '../src/core/glossary'

const ROOT = process.cwd()

/** 各家族在引擎里的权威名单。 */
const ENGINE_NAMES: Readonly<Record<GlossaryFamily, readonly string[]>> = {
  god: God.NAMES,
  duty: Duty.NAMES,
  twelveStar: TwelveStar.NAMES,
  star28: TwentyEightStar.NAMES,
  phase: Phase.NAMES,
  term: SolarTerm.NAMES
}

/**
 * 已知缺口：引擎会产出、但我们没有可靠原文出处、按「宁缺毋滥」不收录的名字。
 *
 * `god` 的缺口分三类：
 *   - 协纪辨方书本就删去或只在义例目录里列名、正文无释义（鬼哭、七符、大退…）
 *   - 只在他条之下作别名带过（时德在「四相」条下、解除在「解神」条下…）
 *   - 定义句夹在成组的阴阳诸神长文里，逐条切分不可靠（阴阳交破、单阴、纯阳…）
 * `star28` 的缺口是《史记·律书》那一段没有逐宿释义的五个宿。
 */
const KNOWN_GAPS: Readonly<Record<GlossaryFamily, readonly string[]>> = {
  god: [
    '鸣吠对',
    '生气',
    '福德',
    '六仪',
    '宝光',
    '阳德',
    '天医',
    '时德',
    '天符',
    '阴神',
    '解除',
    '致死',
    '大败',
    '咸池',
    '厌对',
    '招摇',
    '八专',
    '月刑',
    '四忌',
    '四穷',
    '八龙',
    '七鸟',
    '九虎',
    '六蛇',
    '岁薄',
    '逐阵',
    '三丧',
    '三阴',
    '阴道冲阳',
    '阴位',
    '阴阳交破',
    '阴阳俱错',
    '阴阳击冲',
    '鬼哭',
    '单阴',
    '绝阴',
    '纯阳',
    '阳错阴冲',
    '七符',
    '成日',
    '孤阳',
    '纯阴',
    '大退',
    '阴错',
    '阳错',
    '阳破阴冲'
  ],
  duty: [],
  twelveStar: [],
  star28: ['昴', '毕', '觜', '井', '鬼'],
  phase: [],
  term: []
}

/** 去掉空白与标点，只留文字。与 scripts/glossary/extract-quotes.mjs 的 fold 保持一致。 */
function foldText(text: string): string {
  return text.replace(/[\s，。、；：！？「」『』（）〈〉《》·—○]/g, '')
}

/** 读某个家族对应的 fixture 全文（去标点），结果按家族缓存。 */
const fixtureCache = new Map<string, string>()
function fixtureText(family: GlossaryFamily): string {
  const path = GLOSSARY[family].fixture
  if (!path) return ''
  const cached = fixtureCache.get(path)
  if (cached !== undefined) return cached

  const dir = join(ROOT, path)
  const joined = readdirSync(dir)
    .filter((name) => name.endsWith('.txt'))
    .sort()
    .map((name) => readFileSync(join(dir, name), 'utf8'))
    .join('\n')
  const folded = foldText(joined)
  fixtureCache.set(path, folded)
  return folded
}

const SUMMARY_MAX = 60

describe('词条的键必须真实存在于引擎的表里', () => {
  for (const family of GLOSSARY_FAMILIES) {
    it(`${family} 没有引擎不认识的名字`, () => {
      const known = new Set(ENGINE_NAMES[family])
      const unknown = Object.keys(GLOSSARY[family].entries).filter((name) => !known.has(name))
      expect(unknown).toEqual([])
    })
  }

  it('确实扫到了引擎的名单', () => {
    // 防止 ENGINE_NAMES 写错导致上面几条空转通过。
    for (const family of GLOSSARY_FAMILIES) {
      expect(ENGINE_NAMES[family].length).toBeGreaterThan(0)
    }
    expect(God.NAMES.length).toBeGreaterThan(100)
    expect(ENGINE_NAMES.star28).toHaveLength(28)
    expect(ENGINE_NAMES.term).toHaveLength(24)
  })
})

describe('引文必须逐字出现在公版原文里', () => {
  for (const family of GLOSSARY_FAMILIES) {
    const data = GLOSSARY[family]
    if (data.basis !== 'xieji') continue

    it(`${family} 的每条引文都能在 fixture 中找到`, () => {
      const haystack = fixtureText(family)
      expect(haystack.length).toBeGreaterThan(1000)

      const offenders: string[] = []
      for (const [name, entry] of Object.entries(data.entries)) {
        if (!entry.quote) {
          offenders.push(`${name}: 缺少 quote`)
          continue
        }
        if (!haystack.includes(foldText(entry.quote))) {
          offenders.push(`${name}: 引文不在原文中 → ${entry.quote}`)
        }
        if (!entry.source) offenders.push(`${name}: 缺少 source`)
      }
      expect(offenders).toEqual([])
    })
  }

  it('检测得出来自编造的引文', () => {
    // 让上面那条断言不可能空转通过。
    const haystack = fixtureText('god')
    expect(haystack.includes(foldText('天恩者施德宽下之辰也'))).toBe(true)
    expect(haystack.includes(foldText('天恩者是编造的引文也'))).toBe(false)
  })
})

describe('每条词条都完整且简短', () => {
  it('summary 非空、不超长，来源分档的字段齐全', () => {
    const offenders: string[] = []
    for (const family of GLOSSARY_FAMILIES) {
      const data = GLOSSARY[family]
      if (data.basis === 'common' && !data.rationale) {
        offenders.push(`${family}: basis 为 common 但没有 rationale`)
      }
      if (data.basis === 'xieji' && !data.fixture) {
        offenders.push(`${family}: basis 为 xieji 但没有 fixture`)
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

  it('没有空家族，总量符合预期', () => {
    for (const family of GLOSSARY_FAMILIES) {
      expect(Object.keys(GLOSSARY[family].entries).length).toBeGreaterThan(0)
    }
    const total = GLOSSARY_FAMILIES.reduce(
      (sum, family) => sum + Object.keys(GLOSSARY[family].entries).length,
      0
    )
    expect(total).toBeGreaterThanOrEqual(180)
  })
})

describe('缺口是显式的', () => {
  for (const family of GLOSSARY_FAMILIES) {
    it(`${family} 的未收录名单与 KNOWN_GAPS 一致`, () => {
      const covered = new Set(Object.keys(GLOSSARY[family].entries))
      const gaps = ENGINE_NAMES[family].filter((name) => !covered.has(name))
      expect([...gaps].sort()).toEqual([...KNOWN_GAPS[family]].sort())
    })
  }
})

describe('查表接口', () => {
  it('命中返回词条，未命中返回 null', () => {
    expect(lookupTerm('god', '天恩')?.summary).toBeTruthy()
    expect(lookupTerm('duty', '建')?.quote).toBeTruthy()
    expect(lookupTerm('god', '这个名字不存在')).toBeNull()
  })
})
