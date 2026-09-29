/**
 * 抓取公有领域的原文，生成 tests/fixtures/ 下的校验用文本。
 *
 *   node scripts/glossary/fetch-source.mjs          # 已有 fixture 就跳过
 *   node scripts/glossary/fetch-source.mjs --force  # 强制重新抓取
 *
 * 需要网络。**CI 不执行本脚本**——CI 只校验已提交的 fixture 与词条是否一致。
 * 词条里的 `quote` 必须逐字出现在这里的文本中，由 tests/glossary-contract.test.ts 守住。
 *
 * 源站是维基文库，有速率限制，所以每页之间退避，并且抓取结果会落盘当作缓存。
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeVariants } from './variants.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const API = 'https://zh.wikisource.org/w/api.php'
const USER_AGENT = 'tyme-app-glossary/1.0 (https://github.com/black067/tyme4ts-gui)'

/**
 * 一份要抓的原文。`pages` 是维基文库标题，`out` 决定 fixture 文件名。
 *
 * 协纪辨方书：卷三–卷八是「义例」，即神煞释义所在；卷一本原、卷二本原也一并入库，
 * 因为部分神煞名只在其中出现。实测这八卷覆盖 151 个日神里的 147 个。
 */
const SOURCES = [
  {
    id: 'xieji-bianfangshu',
    label: '《钦定协纪辨方书》四库全书本',
    dir: join(ROOT, 'tests', 'fixtures', 'xieji-bianfangshu'),
    pages: Array.from(
      { length: 8 },
      (_, i) => `欽定協紀辨方書 (四庫全書本)/卷${String(i + 1).padStart(2, '0')}`
    )
  }
]

/** 去掉 HTML 标签与实体，套异体字表，压平空白，按 ○ 断行便于人工核对。 */
function toPlainText(html) {
  const text = normalizeVariants(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&[a-z]+;/gi, ' ')
  )
  return (
    text
      .replace(/[ \t\r\n]+/g, ' ')
      .replace(/\s*○\s*/g, '\n○')
      .trim() + '\n'
  )
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

/** 抓一页，遇到限流或非 JSON 响应时退避重试。 */
async function fetchPage(title, attempt = 0) {
  const url = `${API}?action=parse&page=${encodeURIComponent(title)}&prop=text&format=json&variant=zh-hans&formatversion=2`
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  const body = await response.text()
  if (!body.startsWith('{')) {
    if (attempt >= 4) throw new Error(`${title}: 连续被限流，放弃`)
    const wait = 5000 * (attempt + 1)
    console.log(`    被限流，${wait / 1000}s 后重试（第 ${attempt + 1} 次）`)
    await sleep(wait)
    return fetchPage(title, attempt + 1)
  }
  const json = JSON.parse(body)
  if (json.error) throw new Error(`${title}: ${json.error.info}`)
  return toPlainText(json.parse.text)
}

const force = process.argv.includes('--force')
let written = 0
let skipped = 0

for (const source of SOURCES) {
  mkdirSync(source.dir, { recursive: true })
  console.log(`\n${source.label}`)
  for (const [index, title] of source.pages.entries()) {
    const name = `juan-${String(index + 1).padStart(2, '0')}.txt`
    const target = join(source.dir, name)
    if (existsSync(target) && !force) {
      console.log(`  ${name}  已存在，跳过`)
      skipped += 1
      continue
    }
    const text = await fetchPage(title)
    writeFileSync(target, text, 'utf8')
    console.log(`  ${name}  ${text.length.toLocaleString()} 字符`)
    written += 1
    await sleep(2500)
  }
}

console.log(`\n完成：写入 ${written} 个，跳过 ${skipped} 个`)
