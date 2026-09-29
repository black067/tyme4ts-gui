/**
 * 从 tests/fixtures/ 的公版原文里抽出每个术语的定义句，供人工撰写词条时参考。
 *
 *   node scripts/glossary/extract-quotes.mjs
 *
 * 输出是 `名称 <TAB> 卷 <TAB> 引文` 的清单，写到 stdout。
 * 本脚本**不写任何文件**，只是一个查证工具——词条里的 quote 必须逐字（忽略标点）
 * 出现在 fixture 中，由 tests/glossary-contract.test.ts 守住。
 *
 * 注意：本脚本只能保证"这句话确实在原文里"，不能保证"这句话是这个词条的正确定义"。
 * 单字名（建、角）尤其容易误命中，撰写词条时必须逐条人工核对。
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Duty, God, Phase, SolarTerm, TwelveStar, TwentyEightStar } from 'tyme4ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const FIXTURE_DIR = join(ROOT, 'tests', 'fixtures', 'xieji-bianfangshu')

/** 归一化：去掉空白与标点，只留文字。用于定位与比对。 */
export function foldText(text) {
  return text.replace(/[\s，。、；：！？「」『』（）〈〉《》·—○]/g, '')
}

const volumes = readdirSync(FIXTURE_DIR)
  .filter((name) => name.endsWith('.txt'))
  .sort()
  .map((name) => ({
    name,
    juan: name.replace(/^juan-(\d+)\.txt$/, '$1'),
    folded: foldText(readFileSync(join(FIXTURE_DIR, name), 'utf8'))
  }))

/**
 * 在全部卷里找第一个匹配 `pattern` 的片段。
 *
 * `pattern` 用 `%s` 占位术语名。在**去标点后**的文本上匹配，所以标点不会挡住命中。
 *
 * 返回 `tier`：`1` 表示命中第一条句型（`X者…也` 这类定义句，可信度高）；
 * `2` 表示只命中了后面的宽松句型——**这类必须逐条人工核对上下文**，
 * 因为同一个词在别的篇章里可能是完全不同的概念（例如「青龙」既指黄道神，
 * 也指纳甲六神、大游年卦）。
 */
export function findQuote(name, patterns) {
  for (const { juan, folded } of volumes) {
    for (const [index, pattern] of patterns.entries()) {
      const regex = new RegExp(pattern.replace('%s', name))
      const match = regex.exec(folded)
      if (match) return { juan, quote: match[0], tier: index === 0 ? 1 : 2 }
    }
  }
  return null
}

/** 每个家族的候选句型。顺序即优先级。 */
const FAMILIES = [
  {
    key: 'god',
    names: God.NAMES,
    patterns: [
      '%s者(.{2,60}?)也',
      '曰%s者(.{2,60}?)也',
      '又名%s',
      '又曰%s',
      '名之曰%s',
      '为%s(.{4,40}?)也',
      '有%s(.{4,40}?)是',
      '(%s者.{2,40}?)者是也'
    ]
  },
  {
    key: 'duty',
    names: Duty.NAMES,
    // 建除是单字名，只认定义段（卷四「建者一月之主…」那一段）里的固定句式，避免误命中。
    patterns: [
      '%s者(.{4,50}?)也',
      '继之以%s',
      '故继之以%s',
      '次为%s(.{4,40}?)也',
      '受之以%s',
      '既成必%s',
      '故曰%s',
      '救破以%s'
    ]
  },
  {
    key: 'twelveStar',
    names: TwelveStar.NAMES,
    patterns: [
      '%s者(.{4,60}?)也',
      '%s(.{4,40}?)之神也',
      '曰%s(.{4,40}?)也',
      '有%s(.{4,40}?)也',
      '为%s(.{4,40}?)也'
    ]
  },
  {
    key: 'star28',
    names: TwentyEightStar.NAMES,
    // 宿名是单字，只认「X者…也」「故曰X」这两种律书句型。
    patterns: ['%s者(.{3,40}?)也', '故曰%s', '至于%s(.{3,30}?)也']
  },
  { key: 'phase', names: Phase.NAMES, patterns: ['%s者(.{4,60}?)也'] },
  { key: 'term', names: SolarTerm.NAMES, patterns: ['%s者(.{4,60}?)也'] }
]

let totalFound = 0
let totalNames = 0

for (const family of FAMILIES) {
  console.log(`\n########## ${family.key} (${family.names.length}) ##########`)
  const missing = []
  let tier1 = 0
  for (const name of family.names) {
    totalNames += 1
    const hit = findQuote(name, family.patterns)
    if (hit) {
      totalFound += 1
      if (hit.tier === 1) tier1 += 1
      console.log(`${name}\t卷${hit.juan}\tT${hit.tier}\t${hit.quote}`)
    } else {
      missing.push(name)
    }
  }
  console.log(
    `# ${family.key}: 命中 ${family.names.length - missing.length}/${family.names.length}（其中严格句型 ${tier1}，宽松句型 ${family.names.length - missing.length - tier1}）`
  )
  if (missing.length > 0) console.log(`# 未命中: ${missing.join(' ')}`)
}

console.log(`\n########## 合计 ##########`)
console.log(`命中 ${totalFound}/${totalNames}`)
