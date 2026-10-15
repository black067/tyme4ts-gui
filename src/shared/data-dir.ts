/**
 * 数据目录的契约：它在哪、能不能搬过去、搬完怎么说。
 *
 * 与 `update.ts` 同一种分工：**Rust 只报事实，判断在 TS**。`paths.rs` 回答"这个目录空不空、
 * 有没有我们的标记、写不写得进去"，"所以能不能当数据目录"由 `src/backend/data-dir.ts` 决定。
 *
 * 值得单独成文的原因是这条规则有代价：能力清单里的 `$APPDATA/**` 跟着数据目录的 override 走
 * （Tauri 自己的文档写明了这点），所以让用户随手指一个混着别的东西的文件夹，等于把整个文件夹
 * 交给 webview 读写。拒绝不是苛刻，是这条链路的边界本身。
 */

/** 错误码，与 `src-tauri/src/paths.rs` 里的 `ERR_*` 同源。 */
export type DataDirErrorCode =
  /** 选的就是当前正在用的那个目录。 */
  | 'same'
  /** 新旧两个目录互相包含。 */
  | 'nested'
  /** 非空、又没有本应用的标记：不能确定它是专给本应用用的。 */
  | 'not-dedicated'
  /** 写探针失败：只读盘、权限、满盘。 */
  | 'not-writable'
  /** 复制过去之后字节对不上。源目录没动。 */
  | 'verify'
  /** 其余的磁盘与路径问题。 */
  | 'disk'

/** 被拒的原因：都是"你选的这个地方不行"，改选一个就能继续。 */
export type DataDirRejectReason = Extract<
  DataDirErrorCode,
  'same' | 'nested' | 'not-dedicated' | 'not-writable'
>

/** 失败的原因：地方没问题，是这次操作本身没成。 */
export type DataDirFailureReason = Extract<DataDirErrorCode, 'verify' | 'disk'> | 'unknown'

const REJECT_REASONS: readonly DataDirErrorCode[] = [
  'same',
  // 套娃排在非空前面：它才是"为什么连空目录都不行"的理由，说错了用户会去清文件夹而清不掉。
  'nested',
  'not-dedicated',
  'not-writable'
]

/** 来自 Rust 的错误码：要么是说"你选的地方不行"，要么是说"这次操作没成"。 */
export type DataDirReason = DataDirRejectReason | DataDirFailureReason

/** 认一个来自 Rust 的错误码；认不出来的一律当"这次没成"，不猜成"地方不行"。 */
export function classifyDataDirError(code: string): DataDirReason {
  if (code === 'verify' || code === 'disk') {
    return code
  }
  return REJECT_REASONS.includes(code as DataDirErrorCode)
    ? (code as DataDirRejectReason)
    : 'unknown'
}

/** 这个原因是关于"地方"的还是关于"这次操作"的？界面据此决定是让用户重选还是让他重试。 */
export function isRejectReason(reason: DataDirReason): reason is DataDirRejectReason {
  return (REJECT_REASONS as readonly string[]).includes(reason)
}

/** `inspect_data_dir` 报上来的事实。取舍不在这里。 */
export interface DataDirFacts {
  /** 现在正在用的那个目录，绝对路径。 */
  current: string
  /** 候选目录已存在（不存在意味着搬的时候会新建）。 */
  exists: boolean
  /** 里面一个条目都没有。列不出来时 Rust 按"非空"报。 */
  empty: boolean
  /** 有本应用留下的标记，也就是"这个目录我们用过"。 */
  marker: boolean
  /** 选的就是当前这个目录。 */
  same: boolean
  /** 两个目录互相包含。 */
  nested: boolean
  /** 写探针成功。目录还不存在时表示"能把它建出来"。 */
  writable: boolean
}

/** `set_data_dir` 的报告。 */
export interface DataDirMoveReport {
  from: string
  to: string
  /** 复制了几个文件（`updates/` 里的东西不算，那些是可再生的）。 */
  copied: number
  bytes: number
  /** 从旧目录删掉了几个。 */
  removed: number
  /** 旧目录里没删掉的个数。两边都留一份不算失败，只是没打扫干净。 */
  leftBehind: number
}

/** 一次"修改数据目录"的结果，够界面说一句完整的话。 */
export type DataDirMoveOutcome =
  /** 对话框里按了取消。那不是错误，界面该回到原样，一句提示都不留。 */
  | { kind: 'cancelled' }
  | { kind: 'moved'; report: DataDirMoveReport }
  | { kind: 'rejected'; reason: DataDirRejectReason }
  | { kind: 'failed'; reason: DataDirFailureReason }

/** 搬完之后还剩多少字节，用来把 `bytes` 说成人话。 */
export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return mb >= 0.1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`
}

export interface DataDirApi {
  /** 在系统文件管理器里打开当前数据目录。 */
  reveal(): Promise<void>
  /**
   * 用系统对话框选一个新目录并把数据搬过去。
   *
   * 搬完之后**本次会话仍在旧目录读写**（`AppHandle` 只拿得到 `&Config`），新指向下次启动生效。
   * 这句话必须显示出来，否则"重启前改的那次设置"会留在旧目录里，看起来像是搬丢了。
   */
  move(): Promise<DataDirMoveOutcome>
}
