import { describe, expect, it } from 'vitest'
import manifest from '../../../package.json'
import {
  PORTABLE_ASSET_PATTERN,
  compareVersions,
  isNewerVersion,
  parseReleases,
  selectLatestPortableRelease,
  selectPortableAsset,
  type GitHubAsset,
  type GitHubRelease
} from '../update'

/** A monotonically ordered sample: every earlier entry must compare below every later one. */
const ORDERED = [
  '0.1.3',
  '0.1.4-beta.1',
  '0.1.4-beta.2',
  '0.1.4-rc.1',
  '0.1.4',
  '0.1.10',
  '0.2.0',
  '1.0.0'
] as const

const GARBAGE = ['', '   ', 'v', 'V', 'latest', '1.2.x', '1..2', '-1.2.3', 'nightly', '∞'] as const

describe('compareVersions', () => {
  it('treats a leading v as decoration on either side', () => {
    expect(compareVersions('v0.1.3', '0.1.3')).toBe(0)
    expect(compareVersions('0.1.3', 'v0.1.3')).toBe(0)
    expect(compareVersions('V0.1.3', 'v0.1.3')).toBe(0)
    expect(compareVersions(' v0.1.3 ', '0.1.3')).toBe(0)
  })

  it('compares segments numerically, not lexicographically', () => {
    expect(compareVersions('0.1.10', '0.1.9')).toBeGreaterThan(0)
    expect(compareVersions('0.1.9', '0.1.10')).toBeLessThan(0)
    expect(compareVersions('2.0.0', '10.0.0')).toBeLessThan(0)
    // 定长数字串的比较不能靠字典序，也不能靠 Number 精度。
    expect(compareVersions('1.0.9007199254740993', '1.0.9007199254740992')).toBeGreaterThan(0)
    expect(compareVersions('1.0.01', '1.0.1')).toBe(0)
  })

  it('treats missing trailing segments as zero', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0)
    expect(compareVersions('1.2.0', '1.2')).toBe(0)
    expect(compareVersions('1.2', '1.2.1')).toBeLessThan(0)
    expect(compareVersions('1', '1.0.0.0')).toBe(0)
    // 多出来的段照样参与比较，不会因为"通常只有三段"就被忽略。
    expect(compareVersions('1.2.3.4', '1.2.3')).toBeGreaterThan(0)
  })

  it('ranks a pre-release below its release', () => {
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBeLessThan(0)
    expect(compareVersions('1.0.0', '1.0.0-beta.1')).toBeGreaterThan(0)
    expect(compareVersions('0.1.4-rc.1', '0.1.4')).toBeLessThan(0)
    // 预发布后缀不能把版本抬到下一个正式版之上。
    expect(compareVersions('1.0.0-rc.9', '1.0.1')).toBeLessThan(0)
  })

  it('orders pre-release identifiers by the SemVer rules', () => {
    // 数字标识符按数值比较：beta.2 < beta.11，不是 beta.11 < beta.2。
    expect(compareVersions('1.0.0-beta.2', '1.0.0-beta.11')).toBeLessThan(0)
    // 前缀相同时，标识符更少的一方更低。
    expect(compareVersions('1.0.0-alpha', '1.0.0-alpha.1')).toBeLessThan(0)
    // 数字标识符永远低于字母数字标识符。
    expect(compareVersions('1.0.0-alpha.1', '1.0.0-alpha.beta')).toBeLessThan(0)
    // 字母数字标识符按字符比较。
    expect(compareVersions('1.0.0-alpha.beta', '1.0.0-beta')).toBeLessThan(0)
    expect(compareVersions('1.0.0-beta', '1.0.0-beta.2')).toBeLessThan(0)
    expect(compareVersions('1.0.0-beta.2', '1.0.0-beta.11')).toBeLessThan(0)
    expect(compareVersions('1.0.0-rc.1', '1.0.0-rc.1')).toBe(0)
  })

  it('ignores build metadata', () => {
    expect(compareVersions('1.0.0+build.5', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.0-rc.1+sha.abc', '1.0.0-rc.1')).toBe(0)
  })

  it('compares identifier case by code unit, never by locale', () => {
    // localeCompare 认为 'a' < 'B'（忽略大小写的排序规则），码位顺序相反。
    expect(compareVersions('1.0.0-a', '1.0.0-B')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0-B', '1.0.0-a')).toBeLessThan(0)
    expect(compareVersions('1.0.0-BETA', '1.0.0-beta')).toBeLessThan(0)
  })

  it('is a total order over the sample table', () => {
    for (let i = 0; i < ORDERED.length; i += 1) {
      for (let j = 0; j < ORDERED.length; j += 1) {
        const left = ORDERED[i] ?? ''
        const right = ORDERED[j] ?? ''
        const order = compareVersions(left, right)
        expect(Math.sign(order)).toBe(Math.sign(i - j))
        // 反对称性：交换参数必须得到相反的符号（0 的相反数归一成 0）。
        const reversed = compareVersions(right, left)
        expect(reversed).toBe(order === 0 ? 0 : -order)
      }
    }
  })

  it('sorts garbage below every parseable version without throwing', () => {
    for (const bad of GARBAGE) {
      expect(() => compareVersions(bad, bad)).not.toThrow()
      expect(compareVersions(bad, bad)).toBe(0)
      for (const good of ORDERED) {
        expect(compareVersions(bad, good)).toBeLessThan(0)
        expect(compareVersions(good, bad)).toBeGreaterThan(0)
      }
    }
    // 垃圾与垃圾之间相等，因此不会出现"两个都能解析失败却彼此更新"的抖动。
    expect(compareVersions('latest', 'nightly')).toBe(0)
  })

  it('never throws for any pair of hostile strings', () => {
    const inputs = [...GARBAGE, ...ORDERED, 'v', '1.2.3-', '1.2.3-', '1.2.3-alpha..1', '1.2.3-α']
    for (const a of inputs) {
      for (const b of inputs) {
        expect(() => compareVersions(a, b)).not.toThrow()
        expect(Number.isNaN(compareVersions(a, b))).toBe(false)
      }
    }
  })

  it('treats a dangling dash and empty identifiers as literal text, not as an error', () => {
    expect(compareVersions('1.2.3-', '1.2.3')).toBe(0)
    // 空标识符不含数字，所以不算数字标识符：它排在数字标识符之上、非空字母标识符之下。
    expect(compareVersions('1.2.3-alpha..1', '1.2.3-alpha.0.1')).toBeGreaterThan(0)
    expect(compareVersions('1.2.3-alpha.', '1.2.3-alpha.a')).toBeLessThan(0)
    expect(compareVersions('1.2.3-alpha..1', '1.2.3-alpha..1')).toBe(0)
  })
})

describe('isNewerVersion', () => {
  it('is the only predicate the app needs', () => {
    expect(isNewerVersion('0.1.4', '0.1.3')).toBe(true)
    expect(isNewerVersion('0.1.10', '0.1.9')).toBe(true)
    expect(isNewerVersion('v0.1.4', '0.1.3')).toBe(true)
    expect(isNewerVersion('0.1.3', 'v0.1.3')).toBe(false)
    expect(isNewerVersion('1.0.0-beta.1', '1.0.0')).toBe(false)
    expect(isNewerVersion('0.1.3', '0.1.4')).toBe(false)
  })

  it('is false when compared against itself', () => {
    for (const version of ORDERED) expect(isNewerVersion(version, version)).toBe(false)
  })

  it('refuses to offer an unreadable candidate but accepts any readable release', () => {
    // 读不出来历的 release 版本时保守：不提示更新。
    expect(isNewerVersion('latest', '0.1.3')).toBe(false)
    expect(isNewerVersion('', '0.1.3')).toBe(false)
    // 读不出本机版本时，愿意把任何合法 release 当作更新。
    expect(isNewerVersion('0.1.3', 'latest')).toBe(true)
    expect(isNewerVersion('0.1.3', '')).toBe(true)
  })
})

describe('parseReleases', () => {
  const payload = [
    {
      tag_name: 'v0.1.4',
      name: 'v0.1.4',
      html_url: 'https://github.com/black067/tyme4ts-gui/releases/tag/v0.1.4',
      body: '修了几个换算问题',
      published_at: '2024-07-01T00:00:00Z',
      draft: false,
      prerelease: false,
      assets: [
        {
          name: 'chinese-calendar-0.1.4-portable.exe',
          browser_download_url: 'https://github.com/x/releases/download/v0.1.4/a.exe',
          size: 84_123_456,
          digest: `sha256:${'a'.repeat(64)}`
        },
        {
          name: 'chinese-calendar-0.1.4-portable.exe.blockmap',
          browser_download_url: 'https://github.com/x/releases/download/v0.1.4/a.blockmap',
          size: 1024
        }
      ]
    },
    {
      tag_name: 'v0.2.0-beta.1',
      prerelease: true,
      draft: true,
      assets: []
    }
  ]

  it('coerces a realistic list body into typed releases', () => {
    const outcome = parseReleases(payload)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    expect(outcome.releases).toHaveLength(2)
    const [first, second] = outcome.releases
    expect(first?.tagName).toBe('v0.1.4')
    expect(first?.version).toBe('0.1.4')
    expect(first?.htmlUrl).toContain('releases/tag/v0.1.4')
    expect(first?.body).toBe('修了几个换算问题')
    expect(first?.publishedAt).toBe('2024-07-01T00:00:00Z')
    expect(first?.draft).toBe(false)
    expect(first?.prerelease).toBe(false)
    expect(second?.draft).toBe(true)
    expect(second?.prerelease).toBe(true)
    expect(second?.assets).toEqual([])
  })

  it('surfaces the asset name, download URL, size and parsed sha256', () => {
    const outcome = parseReleases(payload)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    const [exe, blockmap] = outcome.releases[0]?.assets ?? []
    expect(exe).toEqual({
      name: 'chinese-calendar-0.1.4-portable.exe',
      downloadUrl: 'https://github.com/x/releases/download/v0.1.4/a.exe',
      size: 84_123_456,
      sha256: 'a'.repeat(64)
    })
    // 没有 digest 时是 null，绝不能伪造成"已校验"。
    expect(blockmap?.sha256).toBeNull()
  })

  it('normalises the digest and rejects anything that is not a sha256', () => {
    const digests = [
      `sha256:${'A'.repeat(64)}`,
      `SHA256:${'b'.repeat(64)}`,
      'sha256:abc',
      `sha512:${'c'.repeat(128)}`,
      'a'.repeat(64),
      42,
      null
    ]
    const releases = digests.map((digest) => ({
      tag_name: 'v0.1.4',
      assets: [{ name: 'a.exe', browser_download_url: 'https://x/a.exe', digest }]
    }))

    const outcome = parseReleases(releases)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    expect(outcome.releases.map((release) => release.assets[0]?.sha256)).toEqual([
      'a'.repeat(64),
      'b'.repeat(64),
      null,
      null,
      null,
      null,
      null
    ])
  })

  it('returns an empty list for an empty release list', () => {
    expect(parseReleases([])).toEqual({ ok: true, releases: [] })
  })

  it('accepts the single-object shape of /releases/latest', () => {
    const outcome = parseReleases(payload[0])
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.releases).toHaveLength(1)
    expect(outcome.releases[0]?.version).toBe('0.1.4')
  })

  it('drops entries that do not validate without losing the good ones', () => {
    const outcome = parseReleases([
      { tag_name: 'v0.1.3', assets: [] },
      null,
      42,
      'v0.1.5',
      [],
      { name: 'no tag' },
      { tag_name: '' },
      { tag_name: '   ' },
      { tag_name: 42 },
      { tag_name: 'v0.1.6', assets: 'nope' }
    ])
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    expect(outcome.releases.map((release) => release.tagName)).toEqual(['v0.1.3', 'v0.1.6'])
    // assets 不是数组时视作没有资产，而不是抛错。
    expect(outcome.releases[1]?.assets).toEqual([])
  })

  it('drops unusable assets but keeps the assets that have a name and a URL', () => {
    const outcome = parseReleases([
      {
        tag_name: 'v0.1.4',
        assets: [
          null,
          'x',
          7,
          { name: 'no-url.exe' },
          { browser_download_url: 'https://x/no-name' },
          { name: '', browser_download_url: 'https://x/empty' },
          { name: 'ok.exe', browser_download_url: 'https://x/ok' }
        ]
      }
    ])
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    expect(outcome.releases[0]?.assets.map((asset) => asset.name)).toEqual(['ok.exe'])
  })

  it('coerces a malformed size to 0 instead of keeping a bogus number', () => {
    const sizes: unknown[] = [1024, 0, -5, 3.7, 'big', null, Number.NaN, Number.POSITIVE_INFINITY]
    const outcome = parseReleases([
      {
        tag_name: 'v0.1.4',
        assets: sizes.map((size) => ({
          name: 'a.exe',
          browser_download_url: 'https://x/a.exe',
          size
        }))
      }
    ])
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    expect(outcome.releases[0]?.assets.map((asset) => asset.size)).toEqual([
      1024, 0, 0, 3, 0, 0, 0, 0
    ])
  })

  it('only trusts a literal boolean for draft and prerelease', () => {
    const outcome = parseReleases([
      { tag_name: 'v1.0.0', draft: 'yes', prerelease: 1 },
      { tag_name: 'v1.0.1', draft: true, prerelease: true }
    ])
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    expect(outcome.releases.map((release) => [release.draft, release.prerelease])).toEqual([
      [false, false],
      [true, true]
    ])
  })

  it('rejects a body that is not a release list at all', () => {
    for (const body of [null, undefined, 42, true, 'Not Found', '[]', '{"tag_name":"v1.0.0"}']) {
      const outcome = parseReleases(body)
      expect(outcome.ok).toBe(false)
      if (!outcome.ok) expect(outcome.error.length).toBeGreaterThan(0)
    }
  })

  it('rejects an error body such as a 404 instead of reporting "up to date"', () => {
    const outcome = parseReleases({
      message: 'Not Found',
      documentation_url: 'https://docs.github.com/rest/releases/releases'
    })
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error).toContain('无法识别')
  })

  it('never throws on a hostile payload', () => {
    const hostile: unknown[] = [
      JSON.parse('{"tag_name":"v1.0.0","assets":[{"name":"a","browser_download_url":"b"}]}'),
      JSON.parse('{"__proto__":{"tag_name":"v9.9.9"}}'),
      JSON.parse('[{"tag_name":"v1.0.0","assets":[[{"name":"a"}]]}]'),
      JSON.parse('[{"tag_name":"v1.0.0","published_at":{"$gt":""},"body":["x"]}]'),
      [[[{ tag_name: 'v1.0.0' }]]],
      new Array(3),
      { assets: new Array(2) }
    ]

    for (const body of hostile) {
      expect(() => parseReleases(body)).not.toThrow()
      const outcome = parseReleases(body)
      expect(typeof outcome.ok).toBe('boolean')
      if (outcome.ok) expect(Array.isArray(outcome.releases)).toBe(true)
      else expect(typeof outcome.error).toBe('string')
    }
  })
})

/**
 * `portable.artifactName` in electron-builder.yml —
 * `chinese-calendar-${version}-portable.${ext}`.
 *
 * 这里刻意用字面量 + package.json 里的真实版本，而不是读 electron-builder.yml：
 * `src/core/**` 同时被 tsconfig.web.json 编译，那里没有 Node 类型（这是有意的，
 * 防止 core 不小心依赖 Node），所以 core 的测试里不能 import `node:fs`。
 */
const ARTIFACT_NAME_TEMPLATE = 'chinese-calendar-${version}-portable.${ext}'

function realArtifactName(version: string): string {
  return ARTIFACT_NAME_TEMPLATE.replace('${version}', version).replace('${ext}', 'exe')
}

describe('PORTABLE_ASSET_PATTERN', () => {
  it('matches the artifact name this repo actually builds', () => {
    // 反空转守卫：拿 package.json 里真实的版本，按 electron-builder.yml 的
    // artifactName 拼出产物名，模式必须匹配它，否则下面所有断言都可能跑在一个
    // 不存在的世界里。
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+/)
    const real = realArtifactName(manifest.version)
    expect(real).toBe(`chinese-calendar-${manifest.version}-portable.exe`)

    expect(PORTABLE_ASSET_PATTERN.test(real)).toBe(true)
    expect(PORTABLE_ASSET_PATTERN.exec(real)?.[1]).toBe(manifest.version)
  })

  it('captures the version from the file name', () => {
    expect(PORTABLE_ASSET_PATTERN.exec('chinese-calendar-0.1.10-portable.exe')?.[1]).toBe('0.1.10')
    expect(PORTABLE_ASSET_PATTERN.exec('chinese-calendar-1.2.3-beta.1-portable.exe')?.[1]).toBe(
      '1.2.3-beta.1'
    )
    expect(PORTABLE_ASSET_PATTERN.exec('chinese-calendar-0.1.3-portable.EXE')?.[1]).toBe('0.1.3')
  })

  it('rejects everything that is not the portable exe', () => {
    const rejected = [
      'chinese-calendar-0.1.3-portable.exe.blockmap',
      'chinese-calendar-0.1.3-portable.exe.sha256',
      'chinese-calendar-0.1.3-portable.zip',
      'chinese-calendar-0.1.3-setup.exe',
      'chinese-calendar-0.1.3-portable',
      'chinese-calendar-0.1-portable.exe',
      'chinese-calendar-portable.exe',
      'other-calendar-0.1.3-portable.exe',
      'chinese-calendar-0.1.3-portable.exe.bak',
      'prefix-chinese-calendar-0.1.3-portable.exe',
      'chinese-calendar-0.1.3-portable.exe v2',
      ''
    ]
    for (const name of rejected) expect(PORTABLE_ASSET_PATTERN.test(name)).toBe(false)
  })
})

function makeAsset(name: string, overrides: Partial<GitHubAsset> = {}): GitHubAsset {
  return {
    name,
    downloadUrl: `https://github.com/black067/tyme4ts-gui/releases/download/v0.1.4/${name}`,
    size: 84_123_456,
    sha256: 'f'.repeat(64),
    ...overrides
  }
}

function makeRelease(overrides: Partial<GitHubRelease> = {}): GitHubRelease {
  return {
    tagName: 'v0.1.4',
    version: '0.1.4',
    name: 'v0.1.4',
    htmlUrl: 'https://github.com/black067/tyme4ts-gui/releases/tag/v0.1.4',
    body: '修了几个换算问题',
    publishedAt: '2024-07-01T00:00:00Z',
    draft: false,
    prerelease: false,
    assets: [],
    ...overrides
  }
}

describe('selectPortableAsset', () => {
  it('picks the portable exe out of the other release assets', () => {
    const release = makeRelease({
      assets: [
        makeAsset('chinese-calendar-0.1.4-portable.exe.blockmap', { size: 1024, sha256: null }),
        makeAsset('latest.yml', { size: 512, sha256: null }),
        makeAsset('chinese-calendar-0.1.4-portable.exe')
      ]
    })

    const outcome = selectPortableAsset(release)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    expect(outcome.selection).toEqual({
      tagName: 'v0.1.4',
      version: '0.1.4',
      name: 'chinese-calendar-0.1.4-portable.exe',
      downloadUrl:
        'https://github.com/black067/tyme4ts-gui/releases/download/v0.1.4/chinese-calendar-0.1.4-portable.exe',
      size: 84_123_456,
      sha256: 'f'.repeat(64),
      releaseUrl: 'https://github.com/black067/tyme4ts-gui/releases/tag/v0.1.4',
      releaseNotes: '修了几个换算问题',
      publishedAt: '2024-07-01T00:00:00Z'
    })
  })

  it('reports no usable asset instead of throwing', () => {
    const outcome = selectPortableAsset(
      makeRelease({ assets: [makeAsset('chinese-calendar-0.1.4-portable.zip')] })
    )
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error).toContain('v0.1.4')
  })

  it('reports a release with no assets at all', () => {
    const outcome = selectPortableAsset(makeRelease())
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error).toContain('便携版')
  })

  it('ignores drafts and pre-releases unless asked for them', () => {
    const draft = makeRelease({
      assets: [makeAsset('chinese-calendar-0.1.4-portable.exe')],
      draft: true
    })
    const pre = makeRelease({
      tagName: 'v0.2.0-beta.1',
      version: '0.2.0-beta.1',
      assets: [makeAsset('chinese-calendar-0.2.0-beta.1-portable.exe')],
      prerelease: true
    })

    expect(selectPortableAsset(draft).ok).toBe(false)
    expect(selectPortableAsset(pre).ok).toBe(false)
    expect(selectPortableAsset(draft, { allowDraft: true }).ok).toBe(true)
    expect(selectPortableAsset(pre, { allowPrerelease: true }).ok).toBe(true)
    // 放开草稿不等于放开预发布。
    expect(selectPortableAsset(pre, { allowDraft: true }).ok).toBe(false)
  })

  it('takes the version from the file name, which the build always writes', () => {
    const release = makeRelease({
      tagName: 'retagged-by-hand',
      version: 'retagged-by-hand',
      assets: [makeAsset('chinese-calendar-0.1.9-portable.exe')]
    })

    const outcome = selectPortableAsset(release)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.selection.version).toBe('0.1.9')
    expect(outcome.selection.tagName).toBe('retagged-by-hand')
  })
})

describe('selectLatestPortableRelease', () => {
  function releaseAt(version: string, overrides: Partial<GitHubRelease> = {}): GitHubRelease {
    return makeRelease({
      tagName: `v${version}`,
      version,
      // 带预发布后缀的版本，GitHub 上本来就会被标成 prerelease。
      prerelease: version.includes('-'),
      assets: [makeAsset(`chinese-calendar-${version}-portable.exe`)],
      ...overrides
    })
  }

  it('picks the newest version, not the first entry', () => {
    const outcome = selectLatestPortableRelease([
      releaseAt('0.1.9'),
      releaseAt('0.1.10'),
      releaseAt('0.1.3')
    ])
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.selection.version).toBe('0.1.10')
  })

  it('skips drafts, pre-releases and releases without a portable asset', () => {
    const outcome = selectLatestPortableRelease([
      releaseAt('0.3.0', { draft: true }),
      releaseAt('0.2.0', { prerelease: true }),
      makeRelease({ tagName: 'v0.4.0', version: '0.4.0', assets: [makeAsset('notes.txt')] }),
      releaseAt('0.1.4')
    ])
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.selection.version).toBe('0.1.4')
  })

  it('includes pre-releases when asked, still ranking them below their release', () => {
    const releases = [releaseAt('0.1.4'), releaseAt('0.2.0-beta.1')]

    // 默认只推正式版，所以最新的预发布被跳过。
    const withoutPre = selectLatestPortableRelease(releases)
    expect(withoutPre.ok).toBe(true)
    if (withoutPre.ok) expect(withoutPre.selection.version).toBe('0.1.4')

    const withPre = selectLatestPortableRelease(releases, { allowPrerelease: true })
    expect(withPre.ok).toBe(true)
    if (withPre.ok) expect(withPre.selection.version).toBe('0.2.0-beta.1')

    // 放开预发布之后，正式版依然压过同一版本的预发布。
    const both = selectLatestPortableRelease([...releases, releaseAt('0.2.0')], {
      allowPrerelease: true
    })
    expect(both.ok).toBe(true)
    if (both.ok) expect(both.selection.version).toBe('0.2.0')
  })

  it('reports an empty list and an all-unusable list as failures', () => {
    const empty = selectLatestPortableRelease([])
    expect(empty.ok).toBe(false)
    if (!empty.ok) expect(empty.error).toContain('没有找到')

    const unusable = selectLatestPortableRelease([
      makeRelease({ assets: [makeAsset('latest.yml')] }),
      releaseAt('0.1.4', { draft: true })
    ])
    expect(unusable.ok).toBe(false)
  })

  it('never throws on a list built from garbage versions', () => {
    expect(() =>
      selectLatestPortableRelease([
        releaseAt('0.1.4'),
        makeRelease({ tagName: 'latest', version: 'latest', assets: [makeAsset('x.exe')] })
      ])
    ).not.toThrow()

    const outcome = selectLatestPortableRelease([
      releaseAt('0.1.4'),
      makeRelease({ tagName: 'latest', version: 'latest', assets: [makeAsset('x.exe')] })
    ])
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.selection.version).toBe('0.1.4')
  })
})
