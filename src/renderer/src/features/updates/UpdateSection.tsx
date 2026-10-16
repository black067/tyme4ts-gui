import { useEffect, useRef, type ReactElement } from 'react'
import type { UpdateErrorCode } from '@shared/update'
import { useMessages, type Messages } from '@renderer/i18n'
import { Toggle } from '@renderer/components/Toggle'
import { useToast } from '@renderer/components/toast-context'
import { useSettings } from '@renderer/state/settings-context'
import { useUpdateState } from './update-context'
import './updates.css'

/**
 * Formats an ISO timestamp, or returns null when absent/unparseable.
 *
 * Deliberately not `Intl`: the app formats dates itself everywhere else, and the
 * stored value can be hand-edited. Showing nothing beats "Invalid Date".
 */
function formatStamp(iso: string): string | null {
  if (iso.trim() === '') return null
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return null
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(
    parsed.getHours()
  )}:${pad(parsed.getMinutes())}`
}

/** Explicit switch: the codes are kebab-case, catalogue keys are camelCase. */
function errorText(t: Messages, code: UpdateErrorCode | null): string {
  const errors = t.settings.updates.error
  switch (code) {
    case 'network':
      return errors.network
    case 'rate-limited':
      return errors.rateLimited
    case 'no-compatible-asset':
      return errors.noCompatibleAsset
    case 'checksum-mismatch':
      return errors.checksumMismatch
    case 'disk':
      return errors.disk
    case 'target-not-writable':
      return errors.targetNotWritable
    case 'install-failed':
      return errors.installFailed
    default:
      return errors.unknown
  }
}

/**
 * The settings screen's update block.
 *
 * Layout is deliberately compact — a status line and an action line:
 *
 *   v0.1.3 [最新]                         ← version, badged when current
 *   [检查更新] 上次检查 2026-09-29 18:36   ← action and its timestamp together
 *
 * "Already up to date" is a badge rather than a sentence: the state reads at a
 * glance, and a whole sentence for the normal case is noise. Progress and errors
 * appear only while they are true.
 *
 * Renders nothing until the first snapshot arrives, so it never claims "not
 * checked yet" before the main process has answered.
 */
export function UpdateSection(): ReactElement | null {
  const t = useMessages()
  const toast = useToast()
  const { settings, update } = useSettings()
  const { state, check, download, cancel, install } = useUpdateState()
  // 一句失败只说一次。`errorCode` 会留在状态里（它是"上一次为什么没成"的事实），但界面不该
  // 把它渲染成一条擦不掉的红色段落：切走再回来还在，读起来就像这个应用坏了，而实际上只坏过一次。
  const announced = useRef<UpdateErrorCode | null>(null)
  const toldUpdate = useRef(false)

  useEffect(() => {
    const code = state === null || state.phase !== 'error' ? null : state.errorCode
    if (code === null) {
      announced.current = null
      return
    }
    if (announced.current === code) return
    announced.current = code
    toast.notify(errorText(t, code), 'error')
  }, [state, t, toast])

  // 原地替换之后，"更新成功了"这件事只剩版本号能说：不写出来就没人知道自己刚从哪个版本换过来。
  // 它是一次发生过的事件，不是这个区块的状态，所以说完就该消失——`updatedFrom` 来自命令行参数，
  // 本来也只跟一次启动。
  useEffect(() => {
    if (state === null || toldUpdate.current) return
    const from = state.updatedFrom
    if (from === null || from === state.currentVersion) return
    toldUpdate.current = true
    toast.notify(t.settings.updates.updated({ version: state.currentVersion }))
  }, [state, t, toast])

  if (state === null) return null

  const busy = state.phase === 'checking' || state.phase === 'downloading'
  const percent =
    state.progress && state.progress.total > 0
      ? Math.floor((state.progress.transferred / state.progress.total) * 100)
      : 0
  const isLatest = state.phase === 'up-to-date'
  const newer = state.latestVersion !== null && !isLatest ? state.latestVersion : null
  const checkedAt = formatStamp(settings.lastUpdateCheckAt)

  // 便携版没有「装到哪里」可选：更新就是把用户双击的那一个文件换掉。所以位置要在按下之前
  // 说出来，而不是等 10 MB 下完了才提——旧版这里只有一句「重启后生效」，于是没人知道重启的
  // 是哪一个、新版又落在哪里。`installPath` 为空表示宿主还没答上来，那时这一行干脆不出现。
  const targetNote =
    state.installPath === '' ? null : (
      <p className="settings-note updates__path">
        {t.settings.updates.installTarget({ path: state.installPath })}
      </p>
    )
  const showsTarget =
    targetNote !== null &&
    (state.phase === 'available' || state.phase === 'downloading' || state.phase === 'ready')

  return (
    <>
      <div className="settings-field">
        <Toggle
          label={t.settings.updates.autoCheck}
          checked={settings.checkForUpdatesOnStart}
          onChange={(checkForUpdatesOnStart) => update({ checkForUpdatesOnStart })}
        />
      </div>

      <p className="updates__version">
        <span className="updates__number">
          {t.settings.updates.current({ version: state.currentVersion })}
        </span>
        {isLatest ? <span className="updates__badge">{t.settings.updates.latest}</span> : null}
        {newer !== null ? (
          <span className="updates__badge updates__badge--new">
            {t.settings.updates.current({ version: newer })}
          </span>
        ) : null}
      </p>

      {state.phase === 'downloading' ? (
        <progress
          className="updates__progress"
          value={state.progress?.transferred ?? 0}
          max={state.progress?.total ?? 1}
        />
      ) : null}

      {state.phase === 'ready' ? (
        <>
          <p className="settings-note">{t.settings.updates.ready}</p>
          {showsTarget ? targetNote : null}
        </>
      ) : null}

      {state.phase !== 'ready' && showsTarget ? targetNote : null}

      <div className="updates__row">
        {state.phase === 'available' ? (
          <button type="button" className="primary-button" onClick={download}>
            {t.settings.updates.download}
          </button>
        ) : state.canInstall ? (
          <button type="button" className="primary-button" onClick={install}>
            {t.settings.updates.install}
          </button>
        ) : (
          <button type="button" className="text-button" onClick={check} disabled={busy}>
            {state.phase === 'checking'
              ? t.settings.updates.checking
              : state.phase === 'downloading'
                ? t.settings.updates.downloading({ percent })
                : t.settings.updates.check}
          </button>
        )}

        {state.phase === 'downloading' ? (
          <button type="button" className="text-button" onClick={cancel}>
            {t.settings.updates.cancel}
          </button>
        ) : null}

        {/* 时间戳与按钮同行：它是这次操作的上下文，不该另起一行占位。 */}
        <span className="updates__stamp">
          {checkedAt === null
            ? t.settings.updates.neverChecked
            : t.settings.updates.lastChecked({ time: checkedAt })}
        </span>
      </div>
    </>
  )
}
