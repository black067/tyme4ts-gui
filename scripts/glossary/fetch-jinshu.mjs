/**
 * One-off: fetch the 二十八宿 definitions from 《晉書·天文志》 into a fixture.
 *
 * Not part of `scripts/glossary/fetch-source.mjs` yet — that script is driven by
 * a SOURCES list of zh.wikisource titles, and this is the same mechanism; it will
 * be folded in once the family it feeds is in place. Kept as a file so the
 * retrieval is reproducible rather than a paste.
 *
 *   node scripts/glossary/fetch-jinshu.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeVariants } from './variants.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const API = 'https://zh.wikisource.org/w/api.php'
const USER_AGENT = 'tyme-app-glossary/1.0 (https://github.com/black067/tyme4ts-gui)'

/** 天文志在中志（卷十一–十三）；二十八宿的逐宿叙述在卷十一。 */
const PAGES = [
  { title: '晉書/卷011', name: 'juan-11.txt' },
  { title: '晉書/卷012', name: 'juan-12.txt' },
  { title: '晉書/卷013', name: 'juan-13.txt' }
]

const dir = join(ROOT, 'tests', 'fixtures', 'jinshu-tianwenzhi')

/** 去标签、套异体字表、压平空白；与 fetch-source.mjs 的 toPlainText 同一口径。 */
function toPlainText(html) {
  const text = normalizeVariants(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&[a-z]+;/gi, ' ')
  )
  return `${text
    .replace(/[ \t\r\n]+/g, ' ')
    .replace(/\s*○\s*/g, '\n○')
    .trim()}\n`
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

async function fetchPage(title, attempt = 0) {
  const url = `${API}?action=parse&page=${encodeURIComponent(title)}&prop=text&format=json&variant=zh-hans&formatversion=2`
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  const body = await response.text()
  if (!body.startsWith('{')) {
    if (attempt >= 4) throw new Error(`${title}: 连续被限流，放弃`)
    const wait = 5000 * (attempt + 1)
    console.log(`    被限流，${wait / 1000}s 后重试`)
    await sleep(wait)
    return fetchPage(title, attempt + 1)
  }
  const json = JSON.parse(body)
  if (json.error) throw new Error(`${title}: ${json.error.info}`)
  return toPlainText(json.parse.text)
}

mkdirSync(dir, { recursive: true })
for (const page of PAGES) {
  const text = await fetchPage(page.title)
  writeFileSync(join(dir, page.name), text, 'utf8')
  console.log(`${page.name}  ${text.length.toLocaleString()} 字符`)
  await sleep(2500)
}
console.log(`\n写入 ${dir}`)
