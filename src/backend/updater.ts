/**
 * 对 GitHub Releases 的更新检查。
 *
 * 逐字移植自 Electron 时代的 `src/main/updater.ts`：状态机、错误码、"没有摘要就不下载"、
 * "没有可安装产物不算错误"这四条策略一字未改。改的实现细节有三处——
 *
 * - 检查请求走 `@tauri-apps/plugin-http`（由 Rust 发出，没有 CORS，头也能带上）；
 * - 下载与校验走 Rust 命令（`src-tauri/src/update.rs`）：逐块写盘 + 逐块算 SHA-256
 *   需要一个真字节流，而 `plugin-http` 的 `fetch` 会把响应整体缓冲进内存；哈希也不该由
 *   前端算。**比对与判断仍然在这里**：Rust 只把算出来的摘要交回来，是不是同一个文件由 TS 判。
 * - 安装不再"起一个新版然后自杀"，而是把正在运行的这个文件原地换掉
 *   （`src-tauri/src/replace.rs`）。旧形状在便携版上必然失败：新实例被同一把单实例互斥体
 *   挡掉（那名字里只有 `identifier`，不含版本号），于是现象是"应用关了，再没打开"。
 *   判断仍然在这里——要不要装、装哪个、摘要对不对都是这里定的；这里也**必须把失败说出来**，
 *   旧版是 `void invoke(...).catch(...)`，用户看不到任何后果。
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

/** Rust 侧 `update_context` 的返回形状（见 `src-tauri/src/update.rs` 的 `UpdateContext`）。 */
interface UpdaterContext {
  installPath: string
  updatedFrom: string | null
}

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
  canInstall: false,
  // 只有宿主答得出来，所以要等一次 IPC。空串的含义是"还不知道"，不是"没有路径"。
  installPath: '',
  updatedFrom: null
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
 * 取一次"只有本机知道"的更新器事实：安装目标路径，以及本次启动是否来自一次原地更新。
 *
 * 与版本号同一套做法：启动时 prime 一次，之后同步读快照里的字段。它**不该被 await 在启动路径上**
 * （一次 IPC 的往返不该挡在骨架屏前面），拿不到也只是界面少说一句话，不影响检查更新本身。
 */
export async function primeUpdaterContext(): Promise<void> {
  try {
    const context = await hostInvoke<UpdaterContext>(HOST_COMMAND.updaterContext)
    setState({ installPath: context.installPath, updatedFrom: context.updatedFrom })
  } catch {
    // 保持"还不知道"。这里没有值得报给用户的错误。
  }
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

/**
 * 原地替换正在运行的自己，然后退出本进程。
 *
 * 与旧版那一句 `void hostInvoke(...).catch(() => fail('install-failed'))` 的分别是**结果可见**：
 * 换字节现在在 Rust 里当场做完，任何一步不对劲都带着一个短码退回来，而磁盘仍是原样、进程也还活着。
 * 旧版是发射后不管——应用关了就再没回来，用户既不知道新版装在哪，也不知道有没有装上。
 */
export async function installUpdate(): Promise<UpdateState> {
  if (selection === null || !state.canInstall) return fail('install-failed')

  const chosen = selection
  const expected = chosen.sha256
  if (expected === null) {
    // 没有摘要，就无从验证将要换进目标路径的字节是什么。宁可不换。
    return fail('checksum-mismatch')
  }

  try {
    await hostInvoke(HOST_COMMAND.installUpdate, {
      fileName: chosen.name,
      // 基准由 TS 交下去，落盘的字节由 Rust 复验：判据不搬进宿主。
      sha256: expected
    })
  } catch (cause) {
    return mapInstallError(String(cause).split(':')[0] ?? 'install-failed', chosen.name)
  }

  // 成功路径上进程会在几百毫秒内被 Rust 结束，这里先把状态收干净。
  return setState({ phase: 'idle', canInstall: false })
}

/**
 * Rust 侧的安装失败码 → 应用的失败码。认不出来的一律算 install-failed。
 *
 * 除了摘要不符，其余失败都**保留 `canInstall`**：目录不可写、磁盘满、`rename` 被占用，
 * 都是用户做得完、也值得再按一次的事。旧版一失败就把可安装状态清掉，于是"重试"等于
 * 重下一遍 10 MB——而它连"失败了"都没告诉人。
 */
function mapInstallError(code: string, fileName: string): UpdateState {
  if (code === 'checksum-mismatch') {
    // 暂存那份字节已经不干净了：删掉它，让重试意味着重新下载，
    // 而不是对着同一个坏文件反复按安装。
    selection = null
    void hostInvoke(HOST_COMMAND.deleteUpdate, { fileName }).catch(() => undefined)
    return fail('checksum-mismatch')
  }
  return setState({
    phase: 'error',
    // 目录不可写要单独有说法：那是"把程序挪个地方"就能解决的事，
    // 而 install-failed 什么也没告诉人。旧版把两者混在一起，于是没人知道该改什么。
    errorCode: code === 'target-not-writable' || code === 'disk' ? code : 'install-failed',
    progress: null
  })
}
