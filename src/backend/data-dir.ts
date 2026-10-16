/**
 * 数据目录的取舍：这个位置能不能用、为什么不能、做完之后说什么。
 *
 * 磁盘事实由 `src-tauri/src/paths.rs` 报上来，判断在这里——与更新那条链路一样的分工。
 * 四条规则值得单独写明白，因为它们都是"用户一定会撞上的那一次"：
 *
 * 1. **非空、又没被本应用用过的目录不能选。** 能力清单里的 `$APPDATA/**` 跟着数据目录的
 *    override 走（Tauri 文档写明），指一个混着别的东西的文件夹进来，等于把整个文件夹交给
 *    webview 读写。所以这里拒绝时说的是"换一个空文件夹"，而不是"出错请重试"。
 *    老目录没有标记文件，那份 `settings.json` 是它的第二份证据（`DataDirFacts.settings`）。
 * 2. **按取消不是错误**：对话框关掉就算完，界面连一条提示都不该留。
 * 3. **改完指向就重启一次。** `$APPDATA` 在插件初始化时就被解析完了，而命令能碰到的一切都在
 *    那之后，所以"当场生效"唯一的办法是让同一个 exe 重新起来一次。选定位置、搬运、删除三条
 *    链路后面都跟着这一步，界面因此说"正在重启"而不是"好了"。
 * 4. **磁盘根由宿主拦。** 一块新格出来的空盘能通过上面所有检查，而把整块盘当数据目录之后，
 *    连"删掉我的数据"都会变成删掉那块盘。这里不重复那条规则：回来的 `is-root` 本来就是
 *    "换个位置"那个形状，与 `not-dedicated` 走同一句话。
 */
import { HOST_COMMAND, RESTART_REFUSED } from '@shared/ipc'
import { classifyDataDirError, isRejectReason } from '@shared/data-dir'
import type {
  DataDirChooseOutcome,
  DataDirDeleteOutcome,
  DataDirFacts,
  DataDirMoveOutcome,
  DataDirMoveReport,
  DataDirReason,
  DataDirRejectReason,
  DataDirRelaunchOutcome,
  SetupPlanView
} from '@shared/data-dir'
import { hostInvoke, pickDirectory, userDataPath } from './host'

/** 在系统文件管理器里打开当前数据目录。失败只有"开不起来"一种，交给界面按未响应处理。 */
export async function revealDataDir(): Promise<void> {
  await hostInvoke(HOST_COMMAND.revealDataDir)
}

/** 首启小窗口该显示什么：两个固定位置的完整路径、能不能写、以及为什么走到这一步。 */
export async function setupPlan(): Promise<SetupPlanView> {
  return hostInvoke<SetupPlanView>(HOST_COMMAND.setupPlan)
}

/** 系统文件夹对话框。起点是当前数据目录；拿不到就从默认位置开，反正那只是个起点。 */
export async function pickDataDir(): Promise<string | null> {
  const from = await userDataPath().catch(() => '')
  return pickDirectory(from)
}

/**
 * 用户在首启小窗口里定了位置：**这是全仓库唯一会建用户目录的地方**，因为那一下是他按的。
 *
 * 与搬运一样先看事实再动手——`choose_data_dir` 在写盘之前还会再核一遍，两遍之间用户完全可能
 * 往那个文件夹里放了东西。
 */
export async function chooseDataDir(picked: string): Promise<DataDirChooseOutcome> {
  let facts: DataDirFacts
  try {
    facts = await hostInvoke<DataDirFacts>(HOST_COMMAND.inspectDataDir, { path: picked })
  } catch (cause) {
    return toChooseOutcome(cause)
  }
  const rejected = setupReject(facts)
  if (rejected !== null) {
    return { kind: 'rejected', reason: rejected }
  }
  try {
    const chosen = await hostInvoke<string>(HOST_COMMAND.chooseDataDir, { path: picked })
    return { kind: 'chosen', path: chosen }
  } catch (cause) {
    return toChooseOutcome(cause)
  }
}

/**
 * 走一遍完整的搬运：系统对话框选 → 看清事实 → 决定 → 搬。
 *
 * 任何一步都不抛异常，结果一律以 [`DataDirMoveOutcome`] 的形状回来：这一串里有三个可能
 * "什么都不发生"的出口（取消、拒选、失败），让调用方去 catch 三种不同的异常只会把
 * "取消不是错误"这条规则写散。
 */
export async function moveDataDir(): Promise<DataDirMoveOutcome> {
  // 当前目录只是对话框的起点。它拿不到（宿主还没答上来）也不该让整件事失败。
  const from = await userDataPath().catch(() => '')
  const picked = await pickDirectory(from)
  if (picked === null) {
    return { kind: 'cancelled' }
  }

  let facts: DataDirFacts
  try {
    facts = await hostInvoke<DataDirFacts>(HOST_COMMAND.inspectDataDir, { path: picked })
  } catch (cause) {
    return toMoveOutcome(cause)
  }
  const rejected = moveReject(facts)
  if (rejected !== null) {
    return { kind: 'rejected', reason: rejected }
  }

  try {
    const report = await hostInvoke<DataDirMoveReport>(HOST_COMMAND.setDataDir, { path: picked })
    return { kind: 'moved', report }
  } catch (cause) {
    return toMoveOutcome(cause)
  }
}

/** 把整份用户数据移进回收站。界面对它唯一的期待是"要么真在里面，要么一句话都别说"。 */
export async function deleteDataDir(): Promise<DataDirDeleteOutcome> {
  try {
    return { kind: 'deleted', path: await hostInvoke<string>(HOST_COMMAND.deleteDataDir) }
  } catch (cause) {
    const reason = reasonOf(cause)
    return isRejectReason(reason) ? { kind: 'rejected', reason } : { kind: 'failed', reason }
  }
}

/**
 * 重启一次，让刚定下来的指向生效。
 *
 * 调试版按规矩不自动重启（那个 exe 连的是 dev 服务器，重启只会让人以为应用没了）：位置已经
 * 记下来，用户自己重开一次就生效。所以这里把 `dev` 那个码单独收成 `manual`——它不是失败，
 * 界面说的是另一句话。
 */
export async function relaunchDataDir(): Promise<DataDirRelaunchOutcome> {
  try {
    await hostInvoke(HOST_COMMAND.relaunch)
    return { kind: 'restarting' }
  } catch (cause) {
    return reasonText(cause) === RESTART_REFUSED ? { kind: 'manual' } : { kind: 'failed' }
  }
}

/**
 * 搬运能不能做。顺序是有讲究的：`same` 与 `nested` 是"这两个目录的关系"，
 * 比"里面有没有东西"更该先说——用户从当前目录里挑了个子目录时，说"目录非空"会让人
 * 去清空那个子目录，而那根本不是问题所在。
 */
function moveReject(facts: DataDirFacts): DataDirRejectReason | null {
  if (facts.same) {
    return 'same'
  }
  if (facts.nested) {
    return 'nested'
  }
  if (!(facts.empty || facts.marker || facts.settings)) {
    return 'not-dedicated'
  }
  if (!facts.writable) {
    return 'not-writable'
  }
  return null
}

/**
 * 首启选位置能不能做。与搬运共用同一份事实，判据却少两条：那一刻还没有"当前目录"，
 * 所以 `same`/`nested` 都不是理由——选中默认位置恰恰是这一屏最希望发生的事。
 */
function setupReject(facts: DataDirFacts): DataDirRejectReason | null {
  if (!(facts.empty || facts.marker || facts.settings)) {
    return 'not-dedicated'
  }
  if (!facts.writable) {
    return 'not-writable'
  }
  return null
}

/** 命令的错误负载就是 `paths.rs` 里那批 `ERR_*`；Tauri 可能在外面套一层前缀，取冒号前那段。 */
function reasonText(cause: unknown): string {
  return String(cause).split(':')[0] ?? ''
}

/** Rust 的错误码 → "换个位置"还是"这次没成"。认不出来的按后者，不猜成前者。 */
function reasonOf(cause: unknown): DataDirReason {
  return classifyDataDirError(reasonText(cause))
}

function toMoveOutcome(cause: unknown): DataDirMoveOutcome {
  const reason = reasonOf(cause)
  return isRejectReason(reason) ? { kind: 'rejected', reason } : { kind: 'failed', reason }
}

function toChooseOutcome(cause: unknown): DataDirChooseOutcome {
  const reason = reasonOf(cause)
  return isRejectReason(reason) ? { kind: 'rejected', reason } : { kind: 'failed', reason }
}
