import type { ReactElement } from 'react'
import type { UpdateErrorCode, UpdateState } from '@shared/update'
import { useMessages, type Messages } from '@renderer/i18n'
import { Toggle } from '@renderer/components/Toggle'
import { useSettings } from '@renderer/state/settings-context'
import { useUpdateState } from './update-context'
import './updates.css'

/**
 * Turns an absolute ISO timestamp into something readable.
 *
 * Deliberately not `Intl.DateTimeFormat`: the app formats dates itself
 * everywhere else, and the stored value may be malformed (it comes from a JSON
 * file a user can edit), in which case showing the raw string beats "Invalid
 * Date".
 */
function formatCheckedAt(iso: string): string | null {
  if (iso.trim() === '') return null
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return null
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(
    parsed.getHours()
  )}:${pad(parsed.getMinutes())}`
}

/**
 * Maps an error code onto its wording.
 *
 * An explicit switch rather than `t[...][code]`: the codes are kebab-case
 * (`rate-limited`) while catalogue keys are camelCase, and a direct index would
 * hide the mismatch until runtime.
 */
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

/** The status line plus the actions that make sense for the current phase. */
function UpdateStatus({ state }: { state: UpdateState }): ReactElement {
  const t = useMessages()
  const { check, download, cancel, install } = useUpdateState()
  const busy = state.phase === 'checking' || state.phase === 'downloading'

  const percent =
    state.progress && state.progress.total > 0
      ? Math.floor((state.progress.transferred / state.progress.total) * 100)
      : 0

  return (
    <>
      <p className="settings-note">
        {t.settings.updates.current({ version: state.currentVersion })}
      </p>

      {state.phase === 'checking' ? (
        <p className="settings-note">{t.settings.updates.checking}</p>
      ) : null}

      {state.phase === 'up-to-date' ? (
        <p className="settings-note">{t.settings.updates.upToDate}</p>
      ) : null}

      {state.latestVersion !== null && state.phase !== 'up-to-date' ? (
        <p className="settings-note">
          {t.settings.updates.available({ version: state.latestVersion })}
        </p>
      ) : null}

      {state.phase === 'downloading' ? (
        <>
          <p className="settings-note">{t.settings.updates.downloading({ percent })}</p>
          {/* A native progress element rather than a styled div: it comes with
              the right accessibility semantics for free. */}
          <progress
            className="updates__progress"
            value={state.progress?.transferred ?? 0}
            max={state.progress?.total ?? 1}
          />
        </>
      ) : null}

      {state.phase === 'ready' ? <p className="settings-note">{t.settings.updates.ready}</p> : null}

      {state.phase === 'error' ? (
        <p className="tool__error">{errorText(t, state.errorCode)}</p>
      ) : null}

      <div className="updates__actions">
        <button type="button" className="text-button" onClick={check} disabled={busy}>
          {t.settings.updates.check}
        </button>

        {state.phase === 'available' ? (
          <button type="button" className="primary-button" onClick={download}>
            {t.settings.updates.download}
          </button>
        ) : null}

        {state.phase === 'downloading' ? (
          <button type="button" className="text-button" onClick={cancel}>
            {t.settings.updates.cancel}
          </button>
        ) : null}

        {state.canInstall ? (
          <button type="button" className="primary-button" onClick={install}>
            {t.settings.updates.install}
          </button>
        ) : null}

        {state.releaseUrl !== null ? (
          <a
            className="credit__link"
            href={state.releaseUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            {t.settings.updates.releaseNotes}
          </a>
        ) : null}
      </div>
    </>
  )
}

/**
 * The settings screen's update block.
 *
 * Renders nothing until the first snapshot arrives: showing "checking" before
 * the main process has answered would be a lie on every mount.
 */
export function UpdateSection(): ReactElement | null {
  const t = useMessages()
  const { settings, update } = useSettings()
  const { state } = useUpdateState()

  if (state === null) return null

  const checkedAt = formatCheckedAt(settings.lastUpdateCheckAt)

  return (
    <>
      <div className="settings-field">
        <Toggle
          label={t.settings.updates.autoCheck}
          checked={settings.checkForUpdatesOnStart}
          onChange={(checkForUpdatesOnStart) => update({ checkForUpdatesOnStart })}
        />
      </div>

      <UpdateStatus state={state} />

      <p className="settings-note">
        {checkedAt === null
          ? t.settings.updates.neverChecked
          : t.settings.updates.lastChecked({ time: checkedAt })}
      </p>
    </>
  )
}
