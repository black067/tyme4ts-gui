import type { ReactElement } from 'react'
import type { UpdateErrorCode } from '@shared/update'
import { useMessages, type Messages } from '@renderer/i18n'
import { Toggle } from '@renderer/components/Toggle'
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
  const { settings, update } = useSettings()
  const { state, check, download, cancel, install } = useUpdateState()

  if (state === null) return null

  const busy = state.phase === 'checking' || state.phase === 'downloading'
  const percent =
    state.progress && state.progress.total > 0
      ? Math.floor((state.progress.transferred / state.progress.total) * 100)
      : 0
  const isLatest = state.phase === 'up-to-date'
  const newer = state.latestVersion !== null && !isLatest ? state.latestVersion : null
  const checkedAt = formatStamp(settings.lastUpdateCheckAt)

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

      {state.phase === 'ready' ? <p className="settings-note">{t.settings.updates.ready}</p> : null}

      {state.phase === 'error' ? (
        <p className="tool__error">{errorText(t, state.errorCode)}</p>
      ) : null}

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
