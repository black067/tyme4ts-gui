/**
 * One-off: snapshot the repository's own releases API response into a fixture.
 *
 *   node scripts/fetch-releases-fixture.mjs
 *
 * The update-check rules are pure (`src/core/update.ts`) and tested against
 * hand-written shapes; this fixture lets those tests also run against the real
 * GitHub response, which is what proves the parser matches the actual API
 * (field names, `digest` format, asset naming) rather than my idea of it.
 *
 * Trimmed to the fields the parser reads, but the *values* are verbatim,
 * including the full asset `digest` strings.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'tests', 'fixtures', 'github-releases', 'releases.json')
const URL = 'https://api.github.com/repos/black067/tyme4ts-gui/releases'

const response = await fetch(URL, {
  headers: { 'User-Agent': 'tyme-app-dev', Accept: 'application/vnd.github+json' }
})
if (!response.ok) throw new Error(`HTTP ${response.status}`)
const releases = await response.json()

/** 只保留解析器读的字段；值是原样的。 */
const trimmed = releases.map((release) => ({
  tag_name: release.tag_name,
  name: release.name,
  html_url: release.html_url,
  body: release.body,
  published_at: release.published_at,
  draft: release.draft,
  prerelease: release.prerelease,
  assets: (release.assets ?? []).map((asset) => ({
    name: asset.name,
    browser_download_url: asset.browser_download_url,
    size: asset.size,
    digest: asset.digest
  }))
}))

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, `${JSON.stringify(trimmed, null, 2)}\n`, 'utf8')
console.log(`${trimmed.length} 个 release → ${OUT}`)
for (const release of trimmed) {
  console.log(`  ${release.tag_name}  assets=${release.assets.length}`)
}
