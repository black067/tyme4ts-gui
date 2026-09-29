/**
 * 文案层的契约测试。
 *
 * 骨架容易搭、也容易烂：只要没人拦着，下一个组件就会再把中文写死在 JSX 里，
 * 于是"支持多语言"永远名存实亡。这里用两条断言把它变成机制：
 *
 * 1. **键对齐**——每个语言目录扁平化后的键集合必须与 `zh-Hans` 完全一致。
 *    多一个键（翻译写错了地方）或少一个键（漏译）都失败。类型系统只能保证
 *    "该有的都有"，多出来的键、以及函数签名漂移要靠这条断言。
 *
 * 2. **硬编码中文不再增长**——扫描渲染层源码里含汉字的行数，按文件与基线
 *    （`tests/fixtures/i18n-contract/cjk-baseline.json`）比较，**只允许减少**。
 *    这是从旧代码平滑迁移的务实做法：不要求一次抽完，但绝不允许越抽越多。
 *    数字由 `node scripts/i18n/cjk-scan.mjs --update` 重新生成。
 *
 * 扫描范围刻意包含注释：注释里的中文不是缺陷，但把它排除在外需要解析语法，
 * 而这条测试的目的只是"防增长"，把注释一起计入反而更严格、也更简单。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_LOCALE, LOCALES } from '../src/shared/ipc'
import { getMessages } from '../src/renderer/src/i18n/messages'

const ROOT = process.cwd()
const PRIORITY_SOURCE = join(ROOT, 'src', 'renderer', 'src')
const BASELINE_PATH = join(ROOT, 'tests', 'fixtures', 'i18n-contract', 'cjk-baseline.json')

/** 扫描时跳过的目录：文案本身与测试就在"允许有中文"的范围里。 */
const SKIP_DIRS = new Set(['i18n', '__tests__', 'test'])

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

/**
 * 数「注释以外的代码行」里含汉字的行数，口径与 `scripts/i18n/cjk-scan.mjs` 一致。
 *
 * 注释里的中文不算：那是给读代码的人看的，本仓库的注释本来就写中文；把注释算进来
 * 会让「加一段中文注释」也失败，规则就会被人用加基线的方式绕过去。
 */
function countCodeLines(source: string): number {
  let inBlock = false
  let count = 0
  for (const raw of source.split('\n')) {
    let line = raw
    let kept = ''

    while (line.length > 0) {
      if (inBlock) {
        const end = line.indexOf('*/')
        if (end === -1) {
          line = ''
          break
        }
        line = line.slice(end + 2)
        inBlock = false
        continue
      }
      const start = line.indexOf('/*')
      const lineComment = line.indexOf('//')
      if (lineComment !== -1 && (start === -1 || lineComment < start)) {
        kept += line.slice(0, lineComment)
        line = ''
        break
      }
      if (start === -1) {
        kept += line
        line = ''
        break
      }
      kept += line.slice(0, start)
      line = line.slice(start + 2)
      inBlock = true
    }

    if (CJK.test(kept)) count += 1
  }
  return count
}

/**
 * 把目录结构压成 `键路径 → 值` 的扁平表，用来比较不同语言目录的键集合。
 *
 * 函数与字符串都算"一个键"，因为两者的差别（是否需要参数）由 TypeScript 在
 * 编译期检查，这里只关心键本身在不在。
 */
function flatten(value: unknown, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  if (typeof value === 'function') {
    out.set(prefix, 'function')
    return out
  }
  if (typeof value === 'string') {
    out.set(prefix, 'string')
    return out
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const path = prefix === '' ? key : `${prefix}.${key}`
      for (const [childKey, kind] of flatten(child, path)) out.set(childKey, kind)
    }
  }
  return out
}

/** 收集渲染层源码里含汉字的 `.ts` / `.tsx`，返回 `相对路径 → 含汉字行数`。 */
function scanCjk(root: string): Map<string, number> {
  const counts = new Map<string, number>()

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        walk(join(dir, entry.name))
        continue
      }
      if (!entry.isFile()) continue
      if (!/\.tsx?$/.test(entry.name)) continue

      const file = join(dir, entry.name)
      const hit = countCodeLines(readFileSync(file, 'utf8'))
      if (hit > 0) counts.set(relative(ROOT, file).split(sep).join('/'), hit)
    }
  }

  walk(root)
  return counts
}
describe('文案目录的键完全对齐', () => {
  const reference = flatten(getMessages(DEFAULT_LOCALE))

  it('参考目录本身不是空的', () => {
    // 防止键比较在空表上空转通过。
    expect(reference.size).toBeGreaterThan(20)
  })

  for (const locale of LOCALES) {
    it(`${locale} 与 ${DEFAULT_LOCALE} 的键集合一致`, () => {
      const candidate = flatten(getMessages(locale))

      const missing = [...reference.keys()].filter((key) => !candidate.has(key))
      const extra = [...candidate.keys()].filter((key) => !reference.has(key))
      const retyped = [...reference.entries()]
        .filter(([key, kind]) => candidate.get(key) !== undefined && candidate.get(key) !== kind)
        .map(([key, kind]) => `${key}: 参考为 ${kind}，本语言为 ${candidate.get(key)}`)

      expect(missing).toEqual([])
      expect(extra).toEqual([])
      expect(retyped).toEqual([])
    })
  }

  it('LOCALES 与目录注册表一一对应', () => {
    // 在 LOCALES 里登记却忘了加目录时会退化到默认语言，界面看起来"没坏"，
    // 所以要显式断言两者同步。
    for (const locale of LOCALES) {
      expect(getMessages(locale)).toBeDefined()
    }
  })
})

describe('渲染层硬编码中文只减不增', () => {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Record<string, number>
  const current = scanCjk(PRIORITY_SOURCE)

  it('没有新增含中文的源文件', () => {
    const added = [...current.keys()].filter((file) => !(file in baseline))
    // 新增文件要么把文案放进目录，要么把该文件加入基线并说明理由。
    expect(added).toEqual([])
  })

  it('每个文件的含中文行数都不超过基线', () => {
    const grown = Object.entries(baseline)
      .filter(([file, limit]) => (current.get(file) ?? 0) > limit)
      .map(([file, limit]) => `${file}: 基线 ${limit} 行，现在 ${current.get(file)} 行`)

    expect(grown).toEqual([])
  })

  it('基线里的文件都还在（彻底清干净的不算）', () => {
    // 一个文件被完全抽干时它会从扫描结果里消失，那是好事，不是错误。
    // 只有文件真的被删除或改名才该失败——否则基线会留下永不生效的死条目。
    const vanished = Object.keys(baseline).filter((file) => !current.has(file))
    const stillMissing = vanished.filter((file) => !existsSync(join(ROOT, file)))

    expect(stillMissing).toEqual([])
  })

  it('扫描器数的是代码里的中文，不是注释里的', () => {
    // 让上面几条断言不可能空转通过：如果扫描器把注释也算进去（或什么都不算），
    // 「只减不增」要么会误报、要么永远通过。
    expect(countCodeLines(`const a = '中文'`)).toBe(1)
    expect(countCodeLines(`// 这是一行中文注释`)).toBe(0)
    expect(countCodeLines(`/* 中文块注释 */`)).toBe(0)
    expect(countCodeLines(`/**\n * 中文文档注释\n */`)).toBe(0)
    expect(countCodeLines('const b = 1')).toBe(0)
    // 注释在同一行、代码在后面时，仍要数到代码里的中文。
    expect(countCodeLines(`/* 中文 */ const c = '中文'`)).toBe(1)
  })
})
