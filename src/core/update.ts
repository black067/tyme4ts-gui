/**
 * Update check: version precedence and GitHub Releases asset selection.
 *
 * Pure by design — no `https`, no Electron, no Node API — so the network layer
 * in the main process stays a thin adapter and every rule below is unit
 * testable. It also keeps the main process free of runtime dependencies, which
 * `tests/packaging-contract.test.ts` requires.
 *
 * `electron-updater` is deliberately not used: it can only auto-update the NSIS
 * Windows target, while this app ships a `portable` single-file exe, and it
 * would add a runtime dependency the package does not carry.
 *
 * The JSON this module reads comes over the network, so it is treated as
 * hostile: every parser coerces instead of trusting, and failure is a returned
 * value rather than an exception (same idiom as `convert()`).
 */

/**
 * Asset name produced by `portable.artifactName` in electron-builder.yml
 * (`chinese-calendar-${version}-portable.${ext}`), e.g.
 * `chinese-calendar-0.1.3-portable.exe`.
 *
 * Matching a pattern rather than an exact string survives a version bump, and
 * the capture group doubles as the authoritative artifact version. Do not add
 * the `g` flag: `test()`/`exec()` would then depend on `lastIndex`.
 */
export const PORTABLE_ASSET_PATTERN =
  /^chinese-calendar-(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)-portable\.exe$/i

/** Release segments (`1.2.3`) must be plain dot-separated digits. */
const RELEASE_SEGMENTS = /^[0-9]+(?:\.[0-9]+)*$/

/** SemVer's "numeric identifier": digits only, no sign, no dot. */
const NUMERIC_IDENTIFIER = /^[0-9]+$/

interface ParsedVersion {
  /** Release segments with leading zeros stripped: `v01.2.3` → `['1', '2', '3']`. */
  readonly release: readonly string[]
  /** Dot-separated pre-release identifiers; empty when the version is a release. */
  readonly pre: readonly string[]
}

/** Drops leading zeros so `'01'` and `'007'` compare as `1` and `7`. */
function stripLeadingZeros(segment: string): string {
  const trimmed = segment.replace(/^0+/, '')
  return trimmed === '' ? '0' : trimmed
}

/**
 * Code-unit ordering. `localeCompare` is banned here on purpose: it is locale
 * dependent, so the same two versions could order differently on two machines.
 */
function compareCodeUnits(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}

/**
 * Numeric comparison of digit strings that stays exact at any length.
 *
 * `Number.parseInt` would silently lose precision past `Number.MAX_SAFE_INTEGER`
 * and two distinct versions would compare equal; comparing digit counts first
 * avoids that without needing BigInt.
 */
function compareNumericIdentifier(a: string, b: string): number {
  const left = stripLeadingZeros(a)
  const right = stripLeadingZeros(b)
  if (left.length !== right.length) return left.length < right.length ? -1 : 1
  // Same length means lexicographic order is numeric order.
  return compareCodeUnits(left, right)
}

/** One pre-release identifier: numeric beats nothing, and numeric < alphanumeric. */
function compareIdentifier(a: string, b: string): number {
  const aNumeric = NUMERIC_IDENTIFIER.test(a)
  const bNumeric = NUMERIC_IDENTIFIER.test(b)
  if (aNumeric && bNumeric) return compareNumericIdentifier(a, b)
  if (aNumeric !== bNumeric) return aNumeric ? -1 : 1
  return compareCodeUnits(a, b)
}

/**
 * Pre-release precedence (SemVer §11).
 *
 * A release outranks every pre-release of the same release segments, and when
 * all preceding identifiers are equal the shorter set is lower
 * (`1.0.0-alpha < 1.0.0-alpha.1`).
 */
function comparePreRelease(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) {
    if (a.length === b.length) return 0
    return a.length === 0 ? 1 : -1
  }

  const shared = Math.min(a.length, b.length)
  for (let index = 0; index < shared; index += 1) {
    const order = compareIdentifier(a[index] ?? '', b[index] ?? '')
    if (order !== 0) return order
  }

  if (a.length === b.length) return 0
  return a.length < b.length ? -1 : 1
}

/**
 * Splits a version string into comparable parts.
 *
 * Lenient by contract — it returns `null` instead of throwing, and it accepts
 * more than SemVer does:
 * - a single leading `v` / `V` is decoration (`v0.1.3` === `0.1.3`), because
 *   GitHub tags carry it and `package.json` does not;
 * - build metadata (`+sha.1234`) is dropped, matching SemVer precedence;
 * - the release core must be dot-separated digits; everything else (`''`,
 *   `latest`, `1.2.x`, `v`) is unparseable;
 * - the pre-release tail is taken verbatim. A trailing `-` with nothing after
 *   it means "no pre-release", and empty or otherwise odd identifiers are
 *   compared literally rather than rejected — they can only affect ordering.
 */
function parseVersion(raw: unknown): ParsedVersion | null {
  if (typeof raw !== 'string') return null

  let text = raw.trim()
  if (text.startsWith('v') || text.startsWith('V')) text = text.slice(1)

  const plus = text.indexOf('+')
  if (plus >= 0) text = text.slice(0, plus)

  const dash = text.indexOf('-')
  const release = dash >= 0 ? text.slice(0, dash) : text
  const preText = dash >= 0 ? text.slice(dash + 1) : ''

  if (!RELEASE_SEGMENTS.test(release)) return null

  return {
    release: release.split('.').map(stripLeadingZeros),
    pre: preText === '' ? [] : preText.split('.')
  }
}

/** `v0.1.4` → `0.1.4`; anything that is not a `v` + digit tag is returned unchanged. */
function stripVersionPrefix(tag: string): string {
  const trimmed = tag.trim()
  return /^[vV][0-9]/.test(trimmed) ? trimmed.slice(1) : trimmed
}

/**
 * Orders two versions: negative when `a` is older, 0 when equal, positive when
 * `a` is newer.
 *
 * Garbage is not an error, it is a position: an unparseable version sorts below
 * every parseable one and equal to other unparseable versions. That makes the
 * two call sites do the safe thing — an unreadable release version is never
 * offered as an update, while an unreadable *installed* version lets any
 * well-formed release through.
 */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a)
  const right = parseVersion(b)

  if (left === null || right === null) {
    if (left === null && right === null) return 0
    return left === null ? -1 : 1
  }

  // 缺省段补 0，所以 1.2 与 1.2.0 相等。
  const segments = Math.max(left.release.length, right.release.length)
  for (let index = 0; index < segments; index += 1) {
    const order = compareNumericIdentifier(left.release[index] ?? '0', right.release[index] ?? '0')
    if (order !== 0) return order
  }

  return comparePreRelease(left.pre, right.pre)
}

/** The only predicate the update check needs: is `candidate` worth offering? */
export function isNewerVersion(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0
}

export interface GitHubAsset {
  readonly name: string
  /** From `browser_download_url`; unrecognised assets are dropped during parsing. */
  readonly downloadUrl: string
  /** Byte size from the API. `0` means "not reported / malformed", not "empty file". */
  readonly size: number
  /** Lowercase hex SHA-256 from `digest` (`sha256:<hex>`), `null` when unusable. */
  readonly sha256: string | null
}

export interface GitHubRelease {
  /** Raw tag as published, e.g. `v0.1.4` — what the release page shows. */
  readonly tagName: string
  /** `tagName` without its leading `v`, suitable for `compareVersions`. */
  readonly version: string
  readonly name: string | null
  /** `html_url`: the release notes page. */
  readonly htmlUrl: string | null
  readonly body: string | null
  readonly publishedAt: string | null
  /** Only `true` counts — the API is not trusted to send booleans. */
  readonly draft: boolean
  readonly prerelease: boolean
  readonly assets: readonly GitHubAsset[]
}

/** A validated release list, or the reason the body was unusable. */
export type ReleasesOutcome = { ok: true; releases: GitHubRelease[] } | { ok: false; error: string }

export interface PortableAssetSelection {
  readonly tagName: string
  /** Version taken from the asset file name — see `selectPortableAsset`. */
  readonly version: string
  readonly name: string
  readonly downloadUrl: string
  readonly size: number
  readonly sha256: string | null
  readonly releaseUrl: string | null
  readonly releaseNotes: string | null
  readonly publishedAt: string | null
}

export type SelectionOutcome =
  { ok: true; selection: PortableAssetSelection } | { ok: false; error: string }

export interface PortableAssetOptions {
  /** Offer pre-releases too. Default `false`: only 正式版 reaches users. */
  readonly allowPrerelease?: boolean
  /** Accept drafts too. Default `false`; only useful for authenticated debugging. */
  readonly allowDraft?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Non-blank strings only; everything else collapses to `null`. */
function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/**
 * `digest` is documented as `sha256:<hex>`, but the field is new and may be
 * absent or use another algorithm, so only a well-formed sha256 is kept — the
 * main process must never *think* it verified a download.
 */
function parseDigest(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = /^sha256:([0-9a-f]{64})$/i.exec(value.trim())
  return match?.[1]?.toLowerCase() ?? null
}

function parseSize(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
}

function toAsset(raw: unknown): GitHubAsset | null {
  if (!isRecord(raw)) return null

  const name = optionalText(raw['name'])
  const downloadUrl = optionalText(raw['browser_download_url'])
  // 缺文件名或下载地址的资产永远用不上，直接丢掉而不是留一个空壳。
  if (name === null || downloadUrl === null) return null

  return { name, downloadUrl, size: parseSize(raw['size']), sha256: parseDigest(raw['digest']) }
}

function toRelease(raw: unknown): GitHubRelease | null {
  if (!isRecord(raw)) return null

  const tagName = optionalText(raw['tag_name'])
  // 标签是版本的唯一来源；缺了它这条 release 无法参与比较，整条丢弃。
  if (tagName === null) return null

  const assets: GitHubAsset[] = []
  const rawAssets = raw['assets']
  if (Array.isArray(rawAssets)) {
    for (const entry of rawAssets) {
      const asset = toAsset(entry)
      if (asset !== null) assets.push(asset)
    }
  }

  return {
    tagName,
    version: stripVersionPrefix(tagName),
    name: optionalText(raw['name']),
    htmlUrl: optionalText(raw['html_url']),
    body: optionalText(raw['body']),
    publishedAt: optionalText(raw['published_at']),
    draft: raw['draft'] === true,
    prerelease: raw['prerelease'] === true,
    assets
  }
}

/**
 * Validates an untrusted `/releases` body into typed releases, dropping
 * anything that does not validate.
 *
 * Both shapes the API can return are accepted: the array from the list endpoint
 * and the single object from `/releases/latest`.
 *
 * In the array form an individual bad entry is dropped rather than failing the
 * whole response — one malformed release must not hide a good one. The single
 * object form has no such slack: it is either a release or an error body
 * (`{ "message": "Not Found" }`), and calling the latter an empty release list
 * would report "you are up to date" for a failed request.
 */
export function parseReleases(json: unknown): ReleasesOutcome {
  if (Array.isArray(json)) {
    const releases: GitHubRelease[] = []
    for (const entry of json) {
      const release = toRelease(entry)
      if (release !== null) releases.push(release)
    }
    return { ok: true, releases }
  }

  const single = toRelease(json)
  if (single !== null) return { ok: true, releases: [single] }

  return { ok: false, error: '发布信息格式无法识别：期望 Release 数组或对象。' }
}

/**
 * Picks the portable exe out of one release.
 *
 * The version reported to the caller comes from the *asset file name*, not from
 * `tag_name`: the file name is generated by the build and always well-formed,
 * while a tag can be retagged to anything. `tagName` is still surfaced for
 * display.
 */
export function selectPortableAsset(
  release: GitHubRelease,
  options: PortableAssetOptions = {}
): SelectionOutcome {
  if (release.draft && options.allowDraft !== true) {
    return { ok: false, error: '草稿版本不参与更新检查。' }
  }
  if (release.prerelease && options.allowPrerelease !== true) {
    return { ok: false, error: '预发布版本不参与更新检查。' }
  }

  const asset = release.assets.find((candidate) => PORTABLE_ASSET_PATTERN.test(candidate.name))
  if (asset === undefined) {
    return { ok: false, error: `${release.tagName} 没有可用的便携版可执行文件。` }
  }

  return {
    ok: true,
    selection: {
      tagName: release.tagName,
      version: PORTABLE_ASSET_PATTERN.exec(asset.name)?.[1] ?? release.version,
      name: asset.name,
      downloadUrl: asset.downloadUrl,
      size: asset.size,
      sha256: asset.sha256,
      releaseUrl: release.htmlUrl,
      releaseNotes: release.body,
      publishedAt: release.publishedAt
    }
  }
}

/**
 * Picks the newest installable portable release out of a list.
 *
 * The list endpoint mixes drafts, pre-releases and tags without attachments, so
 * "newest" has to mean "newest by version among the installable ones" — which
 * is exactly `compareVersions`' job. An empty list and a list with no portable
 * asset both report `{ ok: false }` instead of a silent `null`.
 */
export function selectLatestPortableRelease(
  releases: readonly GitHubRelease[],
  options: PortableAssetOptions = {}
): SelectionOutcome {
  let best: PortableAssetSelection | null = null

  for (const release of releases) {
    const outcome = selectPortableAsset(release, options)
    if (!outcome.ok) continue
    if (best === null || compareVersions(outcome.selection.version, best.version) > 0) {
      best = outcome.selection
    }
  }

  if (best === null) return { ok: false, error: '没有找到可用的便携版发布。' }
  return { ok: true, selection: best }
}
