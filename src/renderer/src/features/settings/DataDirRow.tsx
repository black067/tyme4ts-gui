import { useState, type ReactElement } from 'react'
import { formatBytes, type DataDirMoveOutcome } from '@shared/data-dir'
import type { DataDirFailureReason, DataDirRejectReason } from '@shared/data-dir'
import { useMessages } from '@renderer/i18n'

/** 一次操作之后要说的那句话，以及该用哪种语气。 */
interface Note {
  text: string
  tone: 'note' | 'error'
}

/** 文案目录里这一小块的类型。写成派生类型，是为了让下面的 switch 只能引用真实存在的键。 */
type Copy = ReturnType<typeof useMessages>['settings']['about']['dataDir']

function rejectText(copy: Copy, reason: DataDirRejectReason): string {
  switch (reason) {
    case 'same':
      return copy.rejectedSame
    case 'nested':
      return copy.rejectedNested
    case 'not-dedicated':
      return copy.rejectedNotDedicated
    case 'not-writable':
      return copy.rejectedNotWritable
  }
}

function failText(copy: Copy, reason: DataDirFailureReason): string {
  switch (reason) {
    case 'verify':
      return copy.failedVerify
    case 'disk':
      return copy.failedDisk
    case 'unknown':
      return copy.failedUnknown
  }
}

/**
 * 把一次搬运的结果说成一句话。
 *
 * 取消不留任何提示：那是一次正常结束的操作，写一行"已取消"反而让人以为自己动坏了什么。
 */
function describe(t: ReturnType<typeof useMessages>, outcome: DataDirMoveOutcome): Note | null {
  const copy = t.settings.about.dataDir
  switch (outcome.kind) {
    case 'cancelled':
      return null
    case 'moved': {
      const { to, copied, bytes, leftBehind } = outcome.report
      const main = copy.moved({ to, files: copied, size: formatBytes(bytes) })
      return {
        text: leftBehind > 0 ? `${main}${copy.leftBehind({ count: leftBehind })}` : main,
        tone: 'note'
      }
    }
    case 'rejected':
      return { text: rejectText(copy, outcome.reason), tone: 'error' }
    case 'failed':
      return { text: failText(copy, outcome.reason), tone: 'error' }
  }
}

/**
 * 「关于」里数据目录那一行。
 *
 * 它不是只读信息了，所以从 `Row` 里分出来：路径旁边挂着两个动作——**浏览**把当前目录在系统
 * 文件管理器里打开，**修改**用系统原生的选夹对话框换一个新的数据目录。
 *
 * 结果那句话挂在路径下面而不是弹提示：用户接下来要做的事（重启、或者换一个文件夹再选一次）
 * 都跟这一行有关，离开这一行说就没有意义了。
 */
export function DataDirRow({ path }: { path: string }): ReactElement {
  const t = useMessages()
  const copy = t.settings.about.dataDir
  const [note, setNote] = useState<Note | null>(null)
  const [busy, setBusy] = useState(false)

  const reveal = (): void => {
    setNote(null)
    void window.tyme.dataDir.reveal().catch(() => {
      setNote({ text: copy.revealFailed, tone: 'error' })
    })
  }

  const move = (): void => {
    setNote(null)
    setBusy(true)
    void window.tyme.dataDir
      .move()
      .then((outcome) => setNote(describe(t, outcome)))
      .catch(() => setNote({ text: copy.failedUnknown, tone: 'error' }))
      .finally(() => setBusy(false))
  }

  return (
    <div className="settings-row settings-row--data">
      <dt>{t.settings.about.dataDirLabel}</dt>
      <dd>
        <span className="settings-row__value">{path}</span>
        {note ? (
          <span
            className={
              note.tone === 'error'
                ? 'settings-row__note tool__error'
                : 'settings-row__note settings-note'
            }
          >
            {note.text}
          </span>
        ) : null}
      </dd>
      <span className="settings-row__actions">
        <button type="button" className="text-button" onClick={reveal} disabled={busy}>
          {copy.browse}
        </button>
        <button type="button" className="text-button" onClick={move} disabled={busy}>
          {copy.change}
        </button>
      </span>
    </div>
  )
}
