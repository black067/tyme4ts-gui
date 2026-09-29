import type { ReactElement } from 'react'
import type { HolidayErrorCode } from '@shared/holidays'
import { useMessages, type Messages } from '@renderer/i18n'
import { Toggle } from '@renderer/components/Toggle'
import { useSettings } from '@renderer/state/settings-context'
import { useHolidays } from './holiday-context'
import './holidays.css'

/**
 * Formats an ISO timestamp, or returns null when absent/unparseable.
 *
 * Deliberately not `Intl.DateTimeFormat`: the rest of the app formats dates
 * itself, and the stored value can be edited by hand.
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
function errorText(t: Messages, code: HolidayErrorCode | null): string {
  const errors = t.settings.holidays.error
  switch (code) {
    case 'network':
      return errors.network
    case 'invalid-data':
      return errors.invalidData
    case 'disk':
      return errors.disk
    default:
      return errors.unknown
  }
}

/**
 * The settings screen's holiday-data block.
 *
 * Renders nothing until the first status arrives, so it never claims "not
 * updated yet" before the main process has answered.
 */
export function HolidaySection(): ReactElement | null {
  const t = useMessages()
  const { settings, update } = useSettings()
  const { status, refresh } = useHolidays()

  if (status === null) return null

  const updatedAt = formatStamp(status.lastUpdatedAt)
  const years = [...status.years].sort((a, b) => a - b)

  return (
    <>
      <div className="settings-field">
        <Toggle
          label={t.settings.holidays.autoUpdate}
          checked={settings.autoUpdateHolidays}
          onChange={(autoUpdateHolidays) => update({ autoUpdateHolidays })}
        />
      </div>

      <p className="settings-note">{t.settings.holidays.note}</p>

      {years.length > 0 ? (
        <p className="settings-note">{t.settings.holidays.years({ years: years.join('、') })}</p>
      ) : null}

      <p className="settings-note">
        {updatedAt === null
          ? t.settings.holidays.never
          : t.settings.holidays.lastUpdated({ time: updatedAt })}
      </p>

      {status.errorCode !== null ? (
        <p className="tool__error">{errorText(t, status.errorCode)}</p>
      ) : null}

      {/* The source records which gov.cn papers each file was scraped from, so
          the primary source stays one click away. */}
      {status.papers.length > 0 ? (
        <div className="holidays__papers">
          <span className="settings-field__label">{t.settings.holidays.papers}</span>
          <ul className="holidays__paper-list">
            {status.papers.map((paper) => (
              <li key={paper}>
                <a className="credit__link" href={paper} target="_blank" rel="noreferrer noopener">
                  {paper}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="holidays__actions">
        <button
          type="button"
          className="text-button"
          onClick={refresh}
          disabled={status.refreshing}
        >
          {status.refreshing ? t.settings.holidays.refreshing : t.settings.holidays.refresh}
        </button>
      </div>
    </>
  )
}
