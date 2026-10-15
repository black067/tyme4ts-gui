/**
 * 对 GitHub Releases 的更新检查。
 *
 * 逐字移植自 Electron 时代的 `src/main/updater.ts`：状态机、错误码、"没有摘要就不下载"、
 * "没有可安装产物不算错误"这四条策略一字未改。改的只有两处实现细节——
 *
 * - 检查请求走 `@tauri-apps/plugin-http`（由 Rust 发出，没有 CORS，头也能带上）；
 * - 下载与校验走 Rust 命令（`src-tauri/src/update.rs`）：逐块写盘 + 逐块算 SHA-256
 *   需要一个真字节流，而 `plugin-http` 的 `fetch` 会把响应整体缓冲进内存；哈希也不该由
 *   前端算。**比对与判断仍然在这里**：Rust 只把算出来的摘要交回来，是不是同一个文件由 TS 判。
 *
 * 顺手修掉一个旧版才可能存在的问题：旧版点"取消"会先 `destroy()` 响应，
 * 于是下载 Promise 以错误收尾，`catch` 把状态改成 `error/disk`——用户取消之后看到的是一条
 * "下载失败"的报错。现在取消是一条独立的 `cancelled` 结果，不进入错误态。
 */
import {
  isNewerVersion,
  parseReleases,
  selectLatestPortableRelease,
  type PortableAssetSelection
} from '@core'
import { HOST_COMMAND, HOST_EVENT } from '@shared/ipc'
import type { UpdateErrorCode, UpdateState } from '@shared/update'
import { appVersionCached, hostInvoke, hostListen, httpFetch } from './host'

const RELEASES_URL = 'https://api.github.com/repos/black067/tyme4ts-gui/releases'
const USER_AGENT = 'tyme-app-updater (https://github.com/black067/tyme4ts-gui)'
const REQUEST_TIMEOUT_MS = 15_000

type Listener = (state: UpdateState) => void

const listeners = new Set<Listener>()

let state: UpdateState = {
  phase: 'idle',
  currentVersion: appVersionCached(),
  latestVersion: null,
  releaseNotes: null,
  releaseUrl: null,
  progress: null,
  errorCode: null,
  canInstall: false
}

let selection: PortableAssetSelection | null = null
/** 下载进行中才非空：取消按钮靠它把中止请求递到 Rust，同时它也是"正在下载"这个事实本身。 */
let abortCancel: (() => void) | null = null

function setState(patch: Partial<UpdateState>): UpdateState {
  state = { ...state, currentVersion: appVersionCached(), ...patch }
  for (const listener of listeners) listener(state)
  return state
}

function fail(code: UpdateErrorCode): UpdateState {
  abortCancel = null
  return setState({
    phase: 'error',
    errorCode: code,
    progress: null,
    canInstall: false
  })
}

export function getUpdateState(): UpdateState {
  return state
}

export function subscribeUpdates(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * 取回文本，带超时；非 2xx 不抛，交回状态码让调用方映射。
 *
 * 这里 403 意味着限流（未登录的 GitHub API 每小时 60 次），是用户等得起的事，
 * 所以它和网络断了要分开报。
 */
async function fetchText(url: string): Promise<{ status: number; body: string }> {
  const response = await httpFetch(url, {
    headers: {
      // GitHub 会拒绝没有 User-Agent 的请求。
      'User-Agent': USER_AGENT,
      Accept: 'application/vnd.github+json'
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
  return { status: response.status, body: await response.text() }
}

/** 检查有没有更新的 portable 版本。 */
export async function checkForUpdates(): Promise<UpdateState> {
  setState({ phase: 'checking', errorCode: null, progress: null, canInstall: false })

  let response: { status: number; body: string }
  try {
    response = await fetchText(RELEASES_URL)
  } catch {
    return fail('network')
  }

  if (response.status === 403 || response.status === 429) return fail('rate-limited')
  if (response.status < 200 || response.status >= 300) return fail('network')

  let json: unknown
  try {
    json = JSON.parse(response.body)
  } catch {
    // 返回的不是 JSON，说明大概率卡在门户或代理后面，而不是在跟 GitHub 说话。
    return fail('network')
  }

  const parsed = parseReleases(json)
  if (!parsed.ok) return fail('network')

  const picked = selectLatestPortableRelease(parsed.releases)
  if (!picked.ok) {
    // 没有可安装的产物不值得打断用户：它只说明发布的版本里没有我们能运行的东西。
    selection = null
    return setState({
      phase: 'up-to-date',
      latestVersion: null,
      releaseNotes: null,
      releaseUrl: null,
      errorCode: null
    })
  }

  const found = picked.selection
  if (!isNewerVersion(found.version, appVersionCached())) {
    selection = null
    return setState({
      phase: 'up-to-date',
      latestVersion: found.version,
      releaseNotes: null,
      releaseUrl: found.releaseUrl,
      errorCode: null
    })
  }

  selection = found
  return setState({
    phase: 'available',
    latestVersion: found.version,
    releaseNotes: found.releaseNotes,
    releaseUrl: found.releaseUrl,
    errorCode: null
  })
}

/** Rust 侧的错误码 → 应用的错误码。 */
function mapDownloadError(code: string): UpdateState {
  switch (code) {
    case 'cancelled':
      // 取消不是故障：回到"可下载"，与 cancelUpdate() 刚做的那一步保持一致。
      return setState({
        phase: selection === null ? 'idle' : 'available',
        progress: null,
        canInstall: false,
        errorCode: null
      })
    case 'network':
      return fail('network')
    default:
      // too-large / disk 都归到磁盘：与旧版一致（旧版把所有下载失败都算 disk）。
      return fail('disk')
  }
}

/** 下载所选版本并校验 SHA-256。 */
export async function downloadUpdate(): Promise<UpdateState> {
  if (selection === null) return fail('no-compatible-asset')

  // 局部持有：闭包不能观察到之后被改写的 selection，下载必须对着它开始时的那个版本收尾。
  const chosen = selection
  const expected = chosen.sha256
  if (expected === null) {
    // 没有摘要就无法验证下载到了什么。一个无法验证的 exe 比不更新更糟。
    return fail('checksum-mismatch')
  }

  setState({
    phase: 'downloading',
    progress: { transferred: 0, total: chosen.size },
    errorCode: null
  })

  // 进度由 Rust 推过来（那边是逐块写盘，没有"每块回调"这层 JS 循环）。
  const unlisten = hostListen<{ transferred: number; total: number }>(
    HOST_EVENT.downloadProgress,
    ({ transferred, total }) => {
      if (state.phase !== 'downloading') return
      setState({ progress: { transferred, total: total > 0 ? total : chosen.size } })
    }
  )
  abortCancel = () => {
    void hostInvoke(HOST_COMMAND.cancelUpdate)
  }

  let actual: string
  try {
    actual = await hostInvoke<string>(HOST_COMMAND.downloadUpdate, {
      url: chosen.downloadUrl,
      fileName: chosen.name
    })
  } catch (cause) {
    unlisten()
    abortCancel = null
    // Rust 用短字符串报告原因；认不出的一律当磁盘问题。
    return mapDownloadError(String(cause).split(':')[0] ?? 'disk')
  }
  unlisten()
  abortCancel = null

  if (actual !== expected) {
    // 校验不过就绝不留着一个看起来可以安装的文件。
    await hostInvoke(HOST_COMMAND.deleteUpdate, { fileName: chosen.name }).catch(() => undefined)
    return fail('checksum-mismatch')
  }

  return setState({
    phase: 'ready',
    progress: { transferred: chosen.size, total: chosen.size },
    canInstall: true,
    errorCode: null
  })
}

/** 中途停止不会留下可用的文件，所以状态退回 available。 */
export function cancelUpdate(): UpdateState {
  const cancel = abortCancel
  abortCancel = null
  if (cancel !== null) cancel()

  const pending = selection
  return setState({
    phase: pending === null ? 'idle' : 'available',
    progress: null,
    canInstall: false,
    errorCode: null
  })
}

/** 启动已下载的产物并退出本进程。 */
export function installUpdate(): UpdateState {
  if (selection === null || !state.canInstall) return fail('install-failed')

  const chosen = selection
  void hostInvoke(HOST_COMMAND.installUpdate, { fileName: chosen.name }).catch(() => {
    // 起不来就退回错误态；Rust 侧已经在资源管理器里选中那个文件。
    fail('install-failed')
  })

  // 成功路径上进程会在几百毫秒内被 Rust 结束，这里先把状态收干净。
  return setState({ phase: 'idle', canInstall: false })
}
