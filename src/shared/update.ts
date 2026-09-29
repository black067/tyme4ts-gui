/**
 * IPC contract for the update check.
 *
 * Kept separate from `ipc.ts` because both sides need the shapes but the
 * channel list is getting long; `ipc.ts` re-exports these names so the preload
 * bridge and the renderer have a single import site.
 *
 * Nothing here may import Electron / React / DOM — main, preload and renderer
 * all depend on this file.
 */

/** Where the update flow currently is. */
export type UpdatePhase =
  'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'up-to-date' | 'error'

/**
 * Why an update flow ended in `error`. A code rather than a sentence: the
 * renderer owns the wording, so the message can be localized.
 */
export type UpdateErrorCode =
  | 'network'
  | 'rate-limited'
  | 'no-compatible-asset'
  | 'checksum-mismatch'
  | 'disk'
  | 'install-failed'
  | 'unknown'

/** Download progress, only meaningful while `phase === 'downloading'`. */
export interface UpdateProgress {
  transferred: number
  total: number
}

/** A snapshot of the updater, safe to send over IPC. */
export interface UpdateState {
  phase: UpdatePhase
  /** Version currently running, from `app.getVersion()`. */
  currentVersion: string
  /**
   * Version being offered, once one was found. The asset file name is the
   * authority here — see `selectPortableAsset` in `src/core/update.ts`.
   */
  latestVersion: string | null
  /** Release notes, when the API supplied them. */
  releaseNotes: string | null
  /** Human-facing release page, for a "release notes" link. */
  releaseUrl: string | null
  progress: UpdateProgress | null
  /** Set only when `phase === 'error'`. */
  errorCode: UpdateErrorCode | null
  /** Whether a download has finished and the installer can be launched. */
  canInstall: boolean
}

/** The update surface exposed on `window.tyme.updates`. */
export interface UpdatesApi {
  /** Current snapshot; cheap enough to call on mount. */
  getState(): Promise<UpdateState>
  /** Ask GitHub whether a newer release exists. */
  check(): Promise<UpdateState>
  /** Download the offered release; verifies its SHA-256 before reporting ready. */
  download(): Promise<UpdateState>
  /** Abandon an in-flight download. */
  cancel(): Promise<UpdateState>
  /**
   * Launch the downloaded installer and quit.
   *
   * The app ships as a single-file portable exe, so there is no installer to
   * run silently in place: the new launcher is started detached and this process
   * exits, which is the closest thing to an in-place upgrade this target allows.
   */
  install(): Promise<UpdateState>
  /**
   * Subscribe to snapshots. The returned function unsubscribes.
   *
   * Progress has to be pushed rather than polled: a 100 MB download would
   * otherwise need a timer in the renderer.
   */
  subscribe(listener: (state: UpdateState) => void): () => void
}
