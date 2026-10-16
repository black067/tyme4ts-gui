import { useEffect, useState, type ReactElement } from 'react'
import type { DataDirDeleteOutcome, DataDirMoveOutcome } from '@shared/data-dir'
import { useMessages, type Messages } from '@renderer/i18n'
import { useToast, type ToastApi } from '@renderer/components/toast-context'
import { failureText, rejectText } from './data-dir-text'

/**
 * 「关于」里数据目录那一行：路径 + 浏览 / 修改 / 删除。
 *
 * 三句话都走 toast，不再挂在路径下面。以前那种写法有个具体的坏处：一次搬完之后的"重启后
 * 生效"会一直留在那儿，用户下一次打开设置页以为这个应用只能靠重启活着；而一次拒绝的理由
 * 说完了也不会消失，占了那一行的位置，把路径本身挤得看不见。
 *
 * 删除是这一行唯一不可逆的动作（它把整个目录移到回收站，然后重启回选位置那一屏），所以它
 * 要按两下：第一下列出要做什么，第二下才动手。确认状态会自己过期——放着不按就等于取消。
 */
export function DataDirRow({ path }: { path: string }): ReactElement {
  const t = useMessages()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  // 确认状态放着不管就自己收回：第二下的意义是"现在真的要删"，隔了十分钟的那一下不算。
  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => setConfirming(false), 8000)
    return () => clearTimeout(timer)
  }, [confirming])

  const reveal = (): void => {
    void window.tyme.dataDir.reveal().catch(() => toast.notify(t.dataDir.revealFailed, 'error'))
  }

  const move = (): void => {
    setBusy(true)
    void window.tyme.dataDir
      .move()
      .then((outcome) => describeMove(t, outcome, toast))
      .catch(() => toast.notify(t.dataDir.moveFailed, 'error'))
      .finally(() => setBusy(false))
  }

  const remove = (): void => {
    if (!confirming) {
      setConfirming(true)
      return
    }
    setConfirming(false)
    setBusy(true)
    void window.tyme.dataDir
      .remove()
      .then((outcome) => describeDelete(t, outcome, toast))
      .catch(() => toast.notify(t.dataDir.deleteFailed, 'error'))
      .finally(() => setBusy(false))
  }

  return (
    <div className="settings-row settings-row--data">
      <dt>{t.settings.about.dataDirLabel}</dt>
      <dd>
        <span className="settings-row__value">{path}</span>
        {confirming ? <span className="data-dir__confirm">{t.dataDir.deleteNote}</span> : null}
      </dd>
      <span className="settings-row__actions">
        <button type="button" className="text-button" onClick={reveal} disabled={busy}>
          {t.dataDir.browse}
        </button>
        <button type="button" className="text-button" onClick={move} disabled={busy}>
          {t.dataDir.change}
        </button>
        <button
          type="button"
          className="text-button data-dir__delete"
          onClick={remove}
          disabled={busy}
        >
          {confirming ? t.dataDir.confirmDelete : t.dataDir.delete}
        </button>
      </span>
    </div>
  )
}

/**
 * 搬运之后的那句话。
 *
 * 取消不留任何提示：那是一次正常结束的操作，写一条"已取消"反而让人以为自己动坏了什么。
 * 成功之后紧跟一次重启，所以"正在重启"就是这句话的重点；旧的那句话还多带了半句"重启前改的
 * 设置仍记在旧目录里"，而新流程里已经没有那种时刻——文件搬完，进程就让位了。
 */
function describeMove(t: Messages, outcome: DataDirMoveOutcome, toast: ToastApi): void {
  switch (outcome.kind) {
    case 'cancelled':
      return
    case 'moved': {
      const { to, leftBehind } = outcome.report
      toast.notify(t.dataDir.moved({ to }))
      if (leftBehind > 0) {
        toast.notify(t.dataDir.leftBehind({ count: leftBehind }), 'error')
      }
      restart(t, toast)
      return
    }
    case 'rejected':
      toast.notify(rejectText(t, outcome.reason), 'error')
      return
    case 'failed':
      toast.notify(failureText(t, 'move', outcome.reason), 'error')
  }
}

/** 删除之后的那句话。成功就是"已进回收站 + 正在重启"，其余都留在这个界面里。 */
function describeDelete(t: Messages, outcome: DataDirDeleteOutcome, toast: ToastApi): void {
  switch (outcome.kind) {
    case 'deleted':
      toast.notify(t.dataDir.deleted)
      restart(t, toast)
      return
    case 'rejected':
      toast.notify(rejectText(t, outcome.reason), 'error')
      return
    case 'failed':
      toast.notify(failureText(t, 'delete', outcome.reason), 'error')
  }
}

/**
 * 请宿主重启一次，让刚定下来的指向生效；不成的时候说人话。
 *
 * 调试版按规矩不自动重启（那个 exe 连的是 dev 服务器），而重启本身也可能失败。两种情况下
 * 事情都做了一半——新位置已经记下来了——所以都是那一句"重启后生效"，而不是"失败了"。
 */
function restart(t: Messages, toast: ToastApi): void {
  void window.tyme.dataDir
    .relaunch()
    .then((outcome) => {
      if (outcome.kind !== 'restarting') toast.notify(t.dataDir.restartLater)
    })
    .catch(() => toast.notify(t.dataDir.restartLater))
}
