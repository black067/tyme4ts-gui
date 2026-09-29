/**
 * Fetches the statutory-holiday overlay and keeps it on disk.
 *
 * ## Why this exists
 *
 * `tyme4ts` ships its legal-holiday table as a compressed string covering
 * 2001-12-29 … 2026-10-10 (see `docs/data-boundaries.md`). Past that date the
 * engine simply returns nothing, so the app would silently lose its 休/班
 * badges. This module extends the table from an authoritative public source.
 *
 * ## Source
 *
 * `NateScarlet/holiday-cn` (MIT): a repository whose CI scrapes the State
 * Council's own announcements daily and publishes one JSON file per year,
 * recording the gov.cn paper each file came from. Its README warns that a file
 * is keyed by the *document's* year, so `{Y}.json` can carry dates in `Y-1` —
 * which is why a refresh always asks for a window of years, not just one.
 *
 * ## Failure policy
 *
 * A failed refresh keeps the previous overlay and only reports an error code.
 * A holiday table that is a year stale is far more useful than none, so nothing
 * here ever clears working data because a network call failed.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { get as httpsGet } from 'node:https'
import { join } from 'node:path'
import { app } from 'electron'
import { buildHolidayOverlay, getHolidayOverlay, setHolidayOverlay } from '@core'
import type { HolidayErrorCode, HolidayStatus } from '@shared/holidays'

const USER_AGENT = 'tyme-app-holidays (https://github.com/black067/tyme4ts-gui)'
const REQUEST_TIMEOUT_MS = 10_000

/**
 * Year JSON mirrors, tried in order.
 *
 * `raw.githubusercontent.com` is the canonical address; jsDelivr is a CDN that
 * mirrors the same repository and is usually reachable when GitHub is not.
 * Both serve the identical file, so a fallback cannot change the data.
 */
const SOURCES = [
  (year: number) => `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`,
  (year: number) => `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${year}.json`
]

type Listener = (status: HolidayStatus) => void

const listeners = new Set<Listener>()

let status: HolidayStatus = {
  years: [],
  lastUpdatedAt: '',
  papers: [],
  spill: 0,
  refreshing: false,
  errorCode: null
}

function setStatus(patch: Partial<HolidayStatus>): HolidayStatus {
  status = { ...status, ...patch }
  for (const listener of listeners) listener(status)
  return status
}

export function getHolidayStatus(): HolidayStatus {
  return status
}

export function subscribeHolidays(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function cacheDir(): string {
  const dir = join(app.getPath('userData'), 'holidays')
  mkdirSync(dir, { recursive: true })
  return dir
}

function cachePath(year: number): string {
  return join(cacheDir(), `${year}.json`)
}

/** Fetches a small JSON document as a string; rejects on a non-2xx status. */
function fetchJsonText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = httpsGet(url, { headers: { 'User-Agent': USER_AGENT } }, (response) => {
      // Follow at most one redirect: both mirrors may bounce to a CDN.
      const location = response.headers.location
      if (
        response.statusCode !== undefined &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        typeof location === 'string'
      ) {
        response.resume()
        fetchJsonText(location).then(resolve, reject)
        return
      }

      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`status ${response.statusCode}`))
        return
      }

      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk: string) => {
        body += chunk
        // These files are a few KB; a runaway response is a bug or an attack.
        if (body.length > 4 * 1024 * 1024) {
          response.destroy()
          reject(new Error('too large'))
        }
      })
      response.on('end', () => resolve(body))
    })

    request.setTimeout(REQUEST_TIMEOUT_MS, () => request.destroy(new Error('timeout')))
    request.on('error', reject)
  })
}

/** Downloads one year, trying each mirror. Returns the parsed body or null. */
async function fetchYear(year: number): Promise<unknown | null> {
  for (const build of SOURCES) {
    try {
      const text = await fetchJsonText(build(year))
      const parsed: unknown = JSON.parse(text)
      // Cache the raw body so the next launch works offline and, more
      // importantly, so a refresh cannot leave the app with nothing.
      writeCache(year, text)
      return parsed
    } catch {
      // Try the next mirror.
    }
  }
  return null
}

/** Writes atomically, so a crash mid-write cannot leave a truncated JSON file. */
function writeCache(year: number, text: string): void {
  const target = cachePath(year)
  const temp = `${target}.tmp`
  writeFileSync(temp, text, 'utf8')
  renameSync(temp, target)
}

/** Reads every cached year back as a parsed payload. */
function readCache(years: readonly number[]): unknown[] {
  const payloads: unknown[] = []
  for (const year of years) {
    const path = cachePath(year)
    if (!existsSync(path)) continue
    try {
      payloads.push(JSON.parse(readFileSync(path, 'utf8')))
    } catch {
      // A corrupt cache entry is skipped; the fetch replaces it next time.
    }
  }
  return payloads
}

/** Collects the gov.cn paper URLs the payloads recorded. */
function papersOf(payloads: readonly unknown[]): string[] {
  const papers = new Set<string>()
  for (const payload of payloads) {
    if (typeof payload !== 'object' || payload === null) continue
    const list = (payload as { papers?: unknown }).papers
    if (!Array.isArray(list)) continue
    for (const paper of list) {
      if (typeof paper === 'string' && paper.startsWith('http')) papers.add(paper)
    }
  }
  return [...papers]
}

/**
 * Loads the cached overlay into the engine.
 *
 * Called once at startup so an offline launch still has holidays. Failures are
 * silent by design: there is nothing the user could do about a missing cache on
 * first run, and the engine's built-in table still covers 2001–2026.
 */
export function loadCachedHolidays(): void {
  const year = new Date().getFullYear()
  const years = [year - 1, year, year + 1, year + 2]
  const payloads = readCache(years)
  if (payloads.length === 0) return

  const built = buildHolidayOverlay(payloads)
  setHolidayOverlay(built.overlay)
  setStatus({
    years: built.overlay.years,
    papers: papersOf(payloads),
    spill: built.overlay.spill,
    errorCode: null
  })
}

/**
 * Fetches a window of years around today and installs the result.
 *
 * The window covers last year (the source's December spill runs backwards, so
 * next January's arrangement can already appear in this year's file) plus two
 * years ahead, which is as far as the State Council publishes.
 */
export async function refreshHolidays(): Promise<HolidayStatus> {
  if (status.refreshing) return status
  setStatus({ refreshing: true, errorCode: null })

  const year = new Date().getFullYear()
  const years = [year - 1, year, year + 1, year + 2]

  const fetched: unknown[] = []
  let networkFailures = 0
  for (const candidate of years) {
    const payload = await fetchYear(candidate)
    if (payload === null) {
      networkFailures += 1
      continue
    }
    fetched.push(payload)
  }

  // Merge in whatever cache already exists for years we could not reach, so a
  // partial outage does not shrink the table.
  const cached = readCache(years)
  const built = buildHolidayOverlay([...cached, ...fetched])

  if (fetched.length === 0) {
    setStatus({ refreshing: false, errorCode: 'network' })
    return status
  }

  if (built.overlay.years.length === 0) {
    setStatus({ refreshing: false, errorCode: 'invalid-data' })
    return status
  }

  setHolidayOverlay(built.overlay)

  const failure: HolidayErrorCode | null =
    networkFailures > 0 ? 'network' : built.errors.length > 0 ? 'invalid-data' : null

  return setStatus({
    years: built.overlay.years,
    lastUpdatedAt: new Date().toISOString(),
    papers: papersOf([...cached, ...fetched]),
    spill: built.overlay.spill,
    refreshing: false,
    errorCode: failure
  })
}

/** Restores the empty overlay; used by tests to get a cold table. */
export function resetHolidays(): HolidayStatus {
  setHolidayOverlay({ byIso: new Map(), years: [], dropped: 0, spill: 0 })
  return setStatus({
    years: [],
    lastUpdatedAt: '',
    papers: [],
    spill: 0,
    refreshing: false,
    errorCode: null
  })
}

/** Exposed for tests: whether an overlay is currently installed. */
export function hasHolidayOverlay(): boolean {
  return getHolidayOverlay().years.length > 0
}
