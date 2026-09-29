/**
 * One-off: refresh the holiday fixtures from the chinese-days npm package.
 *
 *   node scripts/glossary/fetch-holidays.mjs
 *
 * Kept as a script rather than a paste so the snapshots are reproducible and
 * their provenance is recorded next to them.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = join(ROOT, 'tests', 'fixtures', 'chinese-days')
const YEARS = [2025, 2026, 2027]

const url = (year) => `https://cdn.jsdelivr.net/npm/chinese-days/dist/years/${year}.json`

mkdirSync(OUT, { recursive: true })
for (const year of YEARS) {
  const response = await fetch(url(year))
  if (response.status === 404) {
    // 未公布的年份没有文件——这本身就是要记录的状态，不是失败。
    console.log(`${year}.json  404（该年安排尚未公布）`)
    continue
  }
  if (!response.ok) throw new Error(`${year}: HTTP ${response.status}`)
  const raw = await response.text()
  // 原样保存：fixture 要能证明「我们读的就是发布出去的那份 JSON」。
  JSON.parse(raw)
  writeFileSync(join(OUT, `${year}.json`), raw, 'utf8')
  console.log(`${year}.json  ${raw.length} 字节`)
}
console.log(`\n写入 ${OUT}`)
