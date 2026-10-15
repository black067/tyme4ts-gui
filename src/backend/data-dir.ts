/**
 * 数据目录的取舍：能不能搬、为什么不能、搬完说什么。
 *
 * 磁盘事实由 `src-tauri/src/paths.rs` 报上来，判断在这里——与更新那条链路一样的分工。
 * 三条规则值得单独写明白，因为它们都是"用户一定会撞上的那一次"：
 *
 * 1. **非空、又没被本应用用过的目录不能选。** 能力清单里的 `$APPDATA/**` 跟着数据目录的
 *    override 走（Tauri 文档写明），指一个混着别的东西的文件夹进来，等于把整个文件夹交给
 *    webview 读写。所以这里拒绝时说的是"换一个空文件夹"，而不是"出错请重试"。
 * 2. **按取消不是错误**：对话框关掉就算完，界面连一条提示都不该留。
 * 3. **搬完之后本次会话不改指向**：`AppHandle` 只拿得到 `&Config`，改指向要等下次启动。
 *    这句话必须由界面说出来，否则"重启之前又改了一次设置"会留在旧目录里，看着像搬丢了。
 */
import { HOST_COMMAND } from '@shared/ipc'
import { classifyDataDirError, isRejectReason } from '@shared/data-dir'
import type {
  DataDirFacts,
  DataDirMoveOutcome,
  DataDirMoveReport,
  DataDirRejectReason
} from '@shared/data-dir'
import { hostInvoke, pickDirectory, userDataPath } from './host'

/** 在系统文件管理器里打开当前数据目录。失败只有"开不起来"一种，交给界面按未响应处理。 */
export async function revealDataDir(): Promise<void> {
  await hostInvoke(HOST_COMMAND.revealDataDir)
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
    return fromError(cause)
  }
  const rejected = rejectReason(facts)
  if (rejected !== null) {
    return { kind: 'rejected', reason: rejected }
  }

  try {
    const report = await hostInvoke<DataDirMoveReport>(HOST_COMMAND.setDataDir, { path: picked })
    return { kind: 'moved', report }
  } catch (cause) {
    return fromError(cause)
  }
}

/**
 * 按事实取舍。顺序是有讲究的：`same` 与 `nested` 是"这两个目录的关系"，
 * 比"里面有没有东西"更该先说——用户从当前目录里挑了个子目录时，说"目录非空"会让人
 * 去清空那个子目录，而那根本不是问题所在。
 */
function rejectReason(facts: DataDirFacts): DataDirRejectReason | null {
  if (facts.same) {
    return 'same'
  }
  if (facts.nested) {
    return 'nested'
  }
  if (!(facts.empty || facts.marker)) {
    return 'not-dedicated'
  }
  if (!facts.writable) {
    return 'not-writable'
  }
  return null
}

/**
 * Rust 侧的错误码 → 结果形状。
 *
 * 两个命令都可能报同一批码：`set_data_dir` 在真正动手之前会再核一遍事实（从对话框到写盘
 * 之间用户完全可能往那个文件夹里放了东西），所以那里回来的 `not-dedicated` 依然该算"重选"
 * 而不是"重试"。
 */
function fromError(cause: unknown): DataDirMoveOutcome {
  const reason = classifyDataDirError(String(cause).split(':')[0] ?? '')
  return isRejectReason(reason) ? { kind: 'rejected', reason } : { kind: 'failed', reason }
}
