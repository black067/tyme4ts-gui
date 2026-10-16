/**
 * 数据目录的契约：它在哪、没有的时候怎么选一个、能不能搬过去、能不能整份删掉。
 *
 * 与 `update.ts` 同一种分工：**Rust 只报事实，判断在 TS**。`paths.rs` 回答"这个目录空不空、
 * 有没有我们的痕迹、写不写得进去"，"所以能不能当数据目录"由 `src/backend/data-dir.ts` 决定。
 *
 * 值得单独成文的原因是这条规则有代价：能力清单里的 `$APPDATA/**` 跟着数据目录的 override 走
 * （Tauri 自己的文档写明了这点），所以让用户随手指一个混着别的东西的文件夹，等于把整个文件夹
 * 交给 webview 读写。拒绝不是苛刻，是这条链路的边界本身。
 *
 * 还有一件事必须在契约里说清：**指向只能在进程开始之前改**（`config_mut()` 在 `Context` 上，
 * 而 `$APPDATA` 在插件初始化时就解析完了）。所以选完位置、搬完数据、删完数据，界面上说的都是
 * "正在重启"而不是"好了"——重启由 `relaunch()` 走更新那条链路的隐藏等待者完成。调试版不自动
 * 重启（那个 exe 连的是 dev 服务器），于是有 `RESTART_REFUSED` 这个码：它不是故障。
 */

/** 错误码，与 `src-tauri/src/paths.rs` 里的 `ERR_*` 同源（`busy` 等来自 `recycle.rs`）。 */
export type DataDirErrorCode =
  /** 选的就是当前正在用的那个目录。 */
  | 'same'
  /** 新旧两个目录互相包含。 */
  | 'nested'
  /** 磁盘根（`D:\`）。空的根能通过其余所有检查，所以要单独一条。 */
  | 'is-root'
  /** 非空、又没有本应用的痕迹：不能确定它是专给本应用用的。 */
  | 'not-dedicated'
  /** 写探针失败：只读盘、权限、满盘。 */
  | 'not-writable'
  /** 复制过去之后字节对不上。源目录没动。 */
  | 'verify'
  /** 目录已经不在了（与别的程序的操作撞车）。 */
  | 'missing'
  /** 有文件正被别的程序读着，回收站不收。 */
  | 'busy'
  /** 那块盘上没有回收站可去（U 盘、网络盘、光盘）。 */
  | 'no-recycle-bin'
  /** 这个平台上不做这件事（回收站是 Windows 的功能）。 */
  | 'unsupported'
  /** 其余的磁盘与路径问题。 */
  | 'disk'

/** 被拒的原因：都是"你选的这个地方不行"，改选一个就能继续。 */
export type DataDirRejectReason = Extract<
  DataDirErrorCode,
  'same' | 'nested' | 'is-root' | 'not-dedicated' | 'not-writable'
>

/** 失败的原因：地方没问题，是这次操作本身没成。 */
export type DataDirFailureReason =
  | Extract<
      DataDirErrorCode,
      'verify' | 'missing' | 'busy' | 'no-recycle-bin' | 'unsupported' | 'disk'
    >
  | 'unknown'

const REJECT_REASONS: readonly DataDirErrorCode[] = [
  'same',
  // 套娃排在非空前面：它才是"为什么连空目录都不行"的理由，说错了用户会去清文件夹而清不掉。
  'nested',
  'is-root',
  'not-dedicated',
  'not-writable'
]

/** 来自 Rust 的错误码：要么是说"你选的地方不行"，要么是说"这次操作没成"。 */
export type DataDirReason = DataDirRejectReason | DataDirFailureReason

/** 认一个来自 Rust 的错误码；认不出来的一律当"这次没成"，不猜成"地方不行"。 */
export function classifyDataDirError(code: string): DataDirReason {
  const failure: readonly string[] = [
    'verify',
    'missing',
    'busy',
    'no-recycle-bin',
    'unsupported',
    'disk'
  ]
  if (failure.includes(code)) {
    return code as DataDirFailureReason
  }
  return REJECT_REASONS.includes(code as DataDirErrorCode)
    ? (code as DataDirRejectReason)
    : 'unknown'
}

/** 这个原因是关于"地方"的还是关于"这次操作"的？界面据此决定是让用户重选还是让他重试。 */
export function isRejectReason(reason: DataDirReason): reason is DataDirRejectReason {
  return (REJECT_REASONS as readonly string[]).includes(reason)
}

/**
 * `relaunch()` 被"调试版不自动重启"这条规矩挡下时宿主报的码。
 *
 * 与 `src-tauri/src/paths.rs` 的 `ERR_DEV` 同源。它**不是**错误：位置已经记下来了，
 * 用户自己重开一次就生效，所以界面要说"重启后生效"而不是"失败了"。
 */
export const RESTART_REFUSED = 'dev'

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
  /** 有一份像是本应用的 `settings.json`。老目录没有标记，只有它——两条证据任一即算"用过"。 */
  settings: boolean
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

/** 一次"删除用户数据"的结果。成功后宿主已经把指针清掉，重启就回到选目录那一屏。 */
export type DataDirDeleteOutcome =
  | { kind: 'deleted'; path: string }
  | { kind: 'rejected'; reason: DataDirRejectReason }
  | { kind: 'failed'; reason: DataDirFailureReason }

/** 首启小窗口上的一项候选。 */
export interface DataDirCandidate {
  /** `user` = 用户目录下的应用专属目录；`exe` = 可执行文件所在目录（`.chinese-calendar`）。 */
  id: 'user' | 'exe'
  /** 完整路径。界面把它原样显示在选项旁边：按下确定之前该知道东西会落在哪儿。 */
  path: string
  /** 目录已经在盘上了——也就是"这里已经有你的数据"。 */
  exists: boolean
  /** 能不能写（目录不在时表示"能不能把它建出来"）。假的那一项置灰并说明原因。 */
  writable: boolean
}

/** `setup_plan` 命令的返回值：小窗口该显示什么。 */
export interface SetupPlanView {
  user: DataDirCandidate
  /** `null` = 宿主拿不到自己的 exe 路径，这一项整行不出现。 */
  exe: DataDirCandidate | null
  /** 为什么走到"要用户选"这一步。只决定自定义那一栏预填什么，界面不解释它。 */
  reason: 'first-run' | 'recorded-missing'
  /** `recorded-missing` 时那条指针记着的路径。 */
  recorded: string | null
}

/** 一次"选定位置"的结果。 */
export type DataDirChooseOutcome =
  | { kind: 'chosen'; path: string }
  | { kind: 'rejected'; reason: DataDirRejectReason }
  | { kind: 'failed'; reason: DataDirFailureReason }

/**
 * 一次重启请求的下场。
 *
 * `manual` **不是失败**：调试版按规矩不自动重启（那个 exe 连的是 dev 服务器，重启只会让
 * 用户以为应用没了），位置已经记下来，自己重开一次就生效。
 */
export type DataDirRelaunchOutcome =
  { kind: 'restarting' } | { kind: 'manual' } | { kind: 'failed' }

/** 搬完之后还剩多少字节，用来把 `bytes` 说成人话。 */
export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return mb >= 0.1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`
}

export interface DataDirApi {
  /** 在系统文件管理器里打开当前数据目录。 */
  reveal(): Promise<void>
  /**
   * 用系统对话框选一个新目录，把数据搬过去，然后重启一次让指向生效。
   *
   * 为什么非要重启：`$APPDATA` 在插件初始化时就被解析完了，而那是任何命令都碰不到的过去
   * （`src-tauri/src/paths.rs` 头部记着这件事）。搬完之后本次会话已经结束了——不是"还在旧
   * 目录里凑合"，是等一次重启。
   */
  move(): Promise<DataDirMoveOutcome>
  /** 把整份用户数据移进回收站。不可撤销的那类位置（U 盘、网络盘）会被拒绝。 */
  remove(): Promise<DataDirDeleteOutcome>
  /** 系统文件夹对话框：回选中路径，取消回 `null`。它不授予任何读写权限。 */
  pick(): Promise<string | null>
  /** 首启小窗口的原料。日历窗口不会问这个。 */
  plan(): Promise<SetupPlanView>
  /** 选定一个位置并记下来。**这是唯一会建用户目录的动作**，因为那一下是用户按的。 */
  choose(path: string): Promise<DataDirChooseOutcome>
  /** 重启一次。见 [`DataDirRelaunchOutcome`]：`manual` 不是失败。 */
  relaunch(): Promise<DataDirRelaunchOutcome>
}
