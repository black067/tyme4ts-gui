/**
 * The update parser against the real GitHub response.
 *
 * `src/core/__tests__/update.test.ts` exercises the rules with hand-written
 * shapes, which proves the rules are self-consistent but not that they match
 * what GitHub actually sends — field names, the `digest` format, the asset
 * naming that `electron-builder.yml` produces. This fixture is a trimmed copy of
 * a real response from this repository's own releases endpoint, so a passing run
 * means the adapter matches the live API rather than my idea of it.
 *
 * Refresh with `node scripts/fetch-releases-fixture.mjs` after a release.
 */
import { describe, expect, it } from 'vitest'
import fixture from '../../../tests/fixtures/github-releases/releases.json'
import { isNewerVersion, parseReleases, selectLatestPortableRelease } from '..'

describe('parseReleases against a real GitHub response', () => {
  it('parses the list endpoint without dropping anything', () => {
    const parsed = parseReleases(fixture)

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.releases).toHaveLength(fixture.length)
    expect(parsed.releases.map((release) => release.tagName)).toEqual(['v0.1.3', 'v0.1.2'])
  })

  it('finds the portable asset and reads the real sha256 digest', () => {
    const parsed = parseReleases(fixture)
    if (!parsed.ok) throw new Error(parsed.error)

    const picked = selectLatestPortableRelease(parsed.releases)
    expect(picked.ok).toBe(true)
    if (!picked.ok) return

    const selection = picked.selection
    // The asset name is what `electron-builder.yml`'s `portable.artifactName`
    // produces; the version comes from the file name, not the tag.
    expect(selection.name).toMatch(/^chinese-calendar-\d+\.\d+\.\d+-portable\.exe$/)
    expect(selection.version).toBe('0.1.3')
    expect(selection.tagName).toBe('v0.1.3')
    expect(selection.downloadUrl).toContain('github.com')
    expect(selection.size).toBeGreaterThan(0)
    // The whole point of the digest: it is the value the download is verified
    // against, so it must be a real lowercase sha256 and not silently null.
    expect(selection.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('offers v0.1.2 to a v0.1.1 client and nothing to the current one', () => {
    const parsed = parseReleases(fixture)
    if (!parsed.ok) throw new Error(parsed.error)

    expect(isNewerVersion('0.1.3', '0.1.1')).toBe(true)
    expect(isNewerVersion('0.1.3', '0.1.3')).toBe(false)
    // A client ahead of every release is not offered anything.
    expect(isNewerVersion('0.1.3', '0.1.4')).toBe(false)

    const picked = selectLatestPortableRelease(parsed.releases)
    if (!picked.ok) throw new Error(picked.error)
    expect(isNewerVersion(picked.selection.version, '0.1.3')).toBe(false)
  })
})
