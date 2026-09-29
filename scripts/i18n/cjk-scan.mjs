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

/**
 * 数「注释以外的代码行」里含汉字的行数。
 *
 * 注释里的中文不是待翻译的文案——它是给读代码的人看的，而且往往是刻意写中文的
 * （本仓库的注释风格）。把注释算进来会让「加一段中文注释」也触发失败，那样这条
 * 规则就会被人用加基线的方式绕过去，反而失去意义。
 *
 * 处理方式是逐行剥掉块注释与整行注释，再看剩下的代码里有没有汉字。字符串里的
 * 中文照数——那才是要迁进文案目录的东西。
 */
function countCodeLines(source) {
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
    const hit = countCodeLines(readFileSync(file, 'utf8'))
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
