/**
 * 统计渲染层源码里含汉字的行数，生成"硬编码中文基线"。
 *
 *   node scripts/i18n/cjk-scan.mjs            # 只报告，不写文件
 *   node scripts/i18n/cjk-scan.mjs --update   # 重新生成基线
 *
 * 基线的用途见 `tests/i18n-contract.test.ts`：它把"硬编码中文不再增长"变成
 * 可执行的断言，于是从旧代码迁移文案可以分批进行——**只许减少，不许增加**。
 *
 * 判定口径必须与测试保持一致：按行统计、包含注释、跳过 `i18n/` 与测试目录。
 * 修改这里的口径就要同步改测试，否则两边会对不上。
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SOURCE = join(ROOT, 'src', 'renderer', 'src')
const BASELINE = join(ROOT, 'tests', 'fixtures', 'i18n-contract', 'cjk-baseline.json')

const SKIP_DIRS = new Set(['i18n', '__tests__', 'test'])
const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

/** 返回 `相对路径 → 含汉字行数`，按路径排序，便于 diff 稳定。 */
function scan(dir) {
  const counts = new Map()
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      for (const [file, hit] of scan(join(dir, entry.name))) counts.set(file, hit)
      continue
    }
    if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue

    const file = join(dir, entry.name)
    const lines = readFileSync(file, 'utf8').split('\n')
    const hit = lines.filter((line) => CJK.test(line)).length
    if (hit > 0) counts.set(relative(ROOT, file).split(sep).join('/'), hit)
  }
  return counts
}

const counts = scan(SOURCE)
const sorted = Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)))
const total = Object.values(sorted).reduce((sum, hit) => sum + hit, 0)

if (process.argv.includes('--update')) {
  mkdirSync(dirname(BASELINE), { recursive: true })
  writeFileSync(BASELINE, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8')
  console.log(
    `已写入 ${relative(ROOT, BASELINE)}：${Object.keys(sorted).length} 个文件，${total} 行`
  )
} else {
  console.log(`当前：${Object.keys(sorted).length} 个文件，${total} 行含中文`)
  for (const [file, hit] of Object.entries(sorted))
    console.log(`  ${String(hit).padStart(4)}  ${file}`)
}
