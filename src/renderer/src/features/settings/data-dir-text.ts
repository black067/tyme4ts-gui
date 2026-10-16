/**
 * 把契约里的原因码翻成人话。
 *
 * 设置里那一行与首启那一屏共用这一份：同一句"这个文件夹写不进去"在两个地方长得不一样，
 * 用户会以为自己遇上了两件不同的事。
 *
 * 这里的 switch 不带 `default`——新增一个 `DataDirRejectReason` 时编译会先在这里停下来，
 * 那就是提醒：文案目录里还欠一句。
 */
import type { DataDirFailureReason, DataDirRejectReason } from '@shared/data-dir'
import type { Messages } from '@renderer/i18n'

export function rejectText(t: Messages, reason: DataDirRejectReason): string {
  switch (reason) {
    case 'same':
      return t.dataDir.rejectedSame
    case 'nested':
      return t.dataDir.rejectedNested
    case 'is-root':
      return t.dataDir.rejectedRoot
    case 'not-dedicated':
      return t.dataDir.rejectedNotDedicated
    case 'not-writable':
      return t.dataDir.rejectedNotWritable
  }
}

/**
 * 失败的那一类说法。
 *
 * 按**操作**分，不按码分：契约里有六个失败码（`verify`/`disk`/`missing`/`busy`/
 * `no-recycle-bin`/`unsupported`），可用户在同一类操作里做得那件事只有一个——搬运失败就再搬
 * 一次，删除失败就看看是不是有程序正开着那些文件。把六个码写成六句话，只是在替程序自己
 * 交代内部细节。
 */
export function failureText(
  t: Messages,
  operation: 'move' | 'delete',
  reason: DataDirFailureReason
): string {
  if (operation === 'move') {
    return t.dataDir.moveFailed
  }
  switch (reason) {
    case 'no-recycle-bin':
      return t.dataDir.deleteNoBin
    case 'busy':
      return t.dataDir.deleteBusy
    case 'missing':
      return t.dataDir.deleteMissing
    case 'unsupported':
    case 'verify':
    case 'disk':
    case 'unknown':
      return t.dataDir.deleteFailed
  }
}
