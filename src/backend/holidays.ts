/**
 * 法定节假日叠层：取数、落盘、装进引擎。
 *
 * 逐字移植自 Electron 时代的 `src/main/holidays.ts`，取数策略、失败策略、缓存语义都没变，
 * 只有两处不同：网络请求走 `@tauri-apps/plugin-http`（由 Rust 发出，因此没有 CORS，
 * 重定向与相对 `Location` 由 Rust 处理），文件读写走 `host.ts`。
 *
 * 另外顺手修掉一个只有搬进单一世界后才可能修的问题：旧版在**主进程**调用
 * `setHolidayOverlay()`，装进的是主进程那份 `src/core` 模块实例；渲染进程里的
 * `HolidayService` 读的是引擎自带的冻结表（2001-12-29 … 2026-10-10），
 * 于是超出这个范围的年份永远看不到 休/班 角标。现在推算、缓存、界面同属一个 realm，
 * 装进去的就是界面在用的那一份。
 */
import { buildHolidayOverlay, decideHolidayError, setHolidayOverlay } from '@core'
import type { HolidayStatus } from '@shared/holidays'
import { ensureDir, httpFetch, pathExists, readText, replace, writeText } from './host'

const USER_AGENT = 'tyme-app-holidays (https://github.com/black067/tyme4ts-gui)'
const REQUEST_TIMEOUT_MS = 10_000
/** 与今天一致：这些文件只有几 KB，跑飞的响应要么是 bug 要么是攻击。 */
const MAX_BODY_CHARS = 4 * 1024 * 1024

/**
 * 年度 JSON 的镜像，按顺序尝试。
 *
 * 数据源是 `vsme/chinese-days`（MIT）：它的 CI 每天跟进国务院的放假安排，
 * 每年一个文件发布在 `dist/years/` 下。jsDelivr 服务的是 npm 包，unpkg 是同一个包的
 * 另一个独立 CDN，所以切换镜像不会改变数据。
 */
const SOURCES = [
  (year: number) => `https://cdn.jsdelivr.net/npm/chinese-days/dist/years/${year}.json`,
  (year: number) => `https://unpkg.com/chinese-days/dist/years/${year}.json`
]

type Listener = (status: HolidayStatus) => void

const listeners = new Set<Listener>()

let status: HolidayStatus = {
  years: [],
  lastUpdatedAt: '',
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

const CACHE_DIR = 'holidays'

function cacheName(year: number): string {
  return `${CACHE_DIR}/${year}.json`
}

/** 表示"来源答复 404：这份文件还不存在（至少还没公布安排）"，不是网络故障。 */
class MissingDocumentError extends Error {}

async function ensureCacheDir(): Promise<void> {
  await ensureDir(CACHE_DIR)
}

/**
 * 取回一份小 JSON 文本；非 2xx 一律拒绝。
 *
 * 旧版手写了重定向处理，因为 CDN 可能回一个**相对** `Location`
 * （`/chinese-days@1.5.9/dist/years/2027.json`）——只有跟发起请求的 URL 拼起来才是真地址。
 * 现在这一层由 Rust 的请求实现负责，相对地址天然正确。
 */
async function fetchJsonText(url: string): Promise<string> {
  const response = await httpFetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
  if (response.status === 404) {
    throw new MissingDocumentError(`404 ${url}`)
  }
  if (!response.ok) {
    throw new Error(`status ${response.status}`)
  }
  const declared = Number(response.headers.get('content-length') ?? 'NaN')
  if (Number.isFinite(declared) && declared > MAX_BODY_CHARS) {
    throw new Error('too large')
  }
  const text = await response.text()
  if (text.length > MAX_BODY_CHARS) {
    throw new Error('too large')
  }
  return text
}

type FetchOutcome = { kind: 'ok'; payload: unknown } | { kind: 'missing' } | { kind: 'failed' }

/**
 * 下载某一年，逐个镜像尝试。
 *
 * 区分"拿不到"的两种情况：`missing` 是**所有镜像都没有这个文件**（安排还没公布，
 * 是正常状态，不是错误），`failed` 是至少有一个镜像理论上可达却出错了。
 * 把两者混为一谈，就会把"明年还没出"当成网络错误报给用户。
 */
async function fetchYear(year: number): Promise<FetchOutcome> {
  let sawFailure = false
  for (const build of SOURCES) {
    try {
      const text = await fetchJsonText(build(year))
      const parsed: unknown = JSON.parse(text)
      // 原始响应体落盘：下次启动可离线用，更重要的是刷新失败时不至于手里什么都没有。
      await writeCache(year, text)
      return { kind: 'ok', payload: parsed }
    } catch (cause) {
      if (cause instanceof MissingDocumentError) continue
      sawFailure = true
    }
  }
  return { kind: sawFailure ? 'failed' : 'missing' }
}

/** 原子写：临时文件 + 改名，崩在中间也不会留下半截 JSON。 */
async function writeCache(year: number, text: string): Promise<void> {
  await ensureCacheDir()
  const temp = `${cacheName(year)}.tmp`
  await writeText(temp, text)
  await replace(temp, cacheName(year))
}

/** 把缓存里的年份全部读回成已解析的载荷。 */
async function readCache(years: readonly number[]): Promise<unknown[]> {
  const payloads: unknown[] = []
  for (const year of years) {
    if (!(await pathExists(cacheName(year)))) continue
    try {
      const text = await readText(cacheName(year))
      if (text === null) continue
      payloads.push(JSON.parse(text))
    } catch {
      // 坏掉的缓存条目直接跳过，下次刷新会把它换掉。
    }
  }
  return payloads
}

/** 取数的年份窗口：上一年（元旦跨年）到未来两年（国务院公布的最远）。 */
function windowYears(): number[] {
  const year = new Date().getFullYear()
  return [year - 1, year, year + 1, year + 2]
}

/**
 * 把缓存里的叠层装进引擎。
 *
 * 启动时调用一次，离线启动也有节假日。失败静默：第一次运行时用户对此无能为力，
 * 而引擎自带的表仍然覆盖 2001–2026。
 */
export async function loadCachedHolidays(): Promise<void> {
  const payloads = await readCache(windowYears())
  if (payloads.length === 0) return

  const built = buildHolidayOverlay(payloads)
  setHolidayOverlay(built.overlay)
  setStatus({
    years: built.overlay.years,
    spill: built.overlay.spill,
    errorCode: null
  })
}

/**
 * 取回今天前后一个窗口年份的数据并装上。
 */
export async function refreshHolidays(): Promise<HolidayStatus> {
  if (status.refreshing) return status
  setStatus({ refreshing: true, errorCode: null })

  const years = windowYears()

  const fetched: unknown[] = []
  let networkFailures = 0
  for (const candidate of years) {
    const outcome = await fetchYear(candidate)
    if (outcome.kind === 'failed') networkFailures += 1
    if (outcome.kind === 'ok') fetched.push(outcome.payload)
  }

  // 把够不着的年份的既有缓存一起并进叠层，局部故障不该让表变短。
  const cached = await readCache(years)
  const built = buildHolidayOverlay([...cached, ...fetched])

  const failure = decideHolidayError({
    received: fetched.length,
    failed: networkFailures,
    covered: built.overlay.years.length,
    usableCached: cached.length > 0
  })

  if (built.overlay.years.length > 0) setHolidayOverlay(built.overlay)

  return setStatus({
    years: built.overlay.years,
    lastUpdatedAt: new Date().toISOString(),
    spill: built.overlay.spill,
    refreshing: false,
    errorCode: failure
  })
}
