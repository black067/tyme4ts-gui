/**
 * IPC contract for the statutory-holiday data.
 *
 * The calendar engine's built-in holiday table is frozen (`tyme4ts` ships it as
 * a compressed string covering 2001-12-29 … 2026-10-10), so beyond that range
 * the app would show no 休/班 badge at all. This contract exposes the overlay
 * that extends it, fetched from a public-domain-friendly mirror of the official
 * State Council announcements.
 *
 * Like `update.ts`, this file must stay free of Electron / React / DOM imports.
 */

/** Shared with the update flow: a code the renderer turns into wording. */
export type HolidayErrorCode = 'network' | 'invalid-data' | 'disk' | 'unknown'

export interface HolidayStatus {
  /**
   * Calendar years that contributed at least one overlay entry, ascending.
   *
   * Empty means the overlay is not installed and every date falls through to the
   * engine's built-in table — which is the correct state before the first fetch
   * and when offline on a fresh install.
   */
  years: readonly number[]
  /** ISO timestamp of the last successful refresh, or `''` when never. */
  lastUpdatedAt: string
  /** Number of entries accepted outside their payload's declared year. */
  spill: number
  /** True while a refresh is in flight. */
  refreshing: boolean
  /** Set when the last refresh failed. */
  errorCode: HolidayErrorCode | null
}

export interface HolidaysApi {
  /** Current status; cheap enough to call on mount. */
  getStatus(): Promise<HolidayStatus>
  /**
   * Fetch the years around today and install the result.
   *
   * Resolves with the status either way: a failed refresh keeps the previous
   * overlay, because a stale holiday table is far better than none.
   */
  refresh(): Promise<HolidayStatus>
  /** Subscribe to status changes. Returns an unsubscribe function. */
  subscribe(listener: (status: HolidayStatus) => void): () => void
}
