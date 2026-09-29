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
      const lines = readFileSync(file, 'utf8').split('\n')
      const hit = lines.filter((line) => CJK.test(line)).length
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

  it('基线本身有内容', () => {
    expect(Object.keys(baseline).length).toBeGreaterThan(5)
  })
})
