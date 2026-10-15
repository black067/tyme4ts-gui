/**
 * The update-check contract.
 *
 * Kept separate from `ipc.ts` because both sides need the shapes and the type list is
 * getting long; `ipc.ts` re-exports these names so the renderer and `src/backend` have
 * a single import site.
 *
 * Nothing here may import a host API / React / DOM — core, backend and renderer all
 * depend on this file.
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
  /**
   * The directory holding the running exe cannot be written to.
   *
   * Distinct from `install-failed` on purpose: it is the one case the user can act
   * on (move the program somewhere writable, or leave a read-only medium), whereas
   * `install-failed` means "we tried to swap the bytes and something else went
   * wrong". The old flow discovered this only after a full download.
   */
  | 'target-not-writable'
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
  /**
   * Absolute path of the running exe — i.e. where an update is written to.
   *
   * A portable app must name its own destination, or the user cannot tell what got
   * replaced. `''` until the host has answered; see `primeUpdaterContext`.
   */
  installPath: string
  /**
   * The version this process was updated from, once per update.
   *
   * Survives one launch only (`--updated-from` on the command line, not persisted):
   * it exists so that "重启并安装" ends with something the user can see went well.
   */
  updatedFrom: string | null
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
   * Replace the running exe with the downloaded one, relaunch it, and quit.
   *
   * The app ships as a single-file portable exe, so "install" means swapping bytes at
   * the path the user launched: the running image is renamed out of the way (Windows
   * forbids overwriting it but allows renaming it), the new file takes its exact name,
   * and a detached waiter — the same exe in `--__updater-wait` mode — starts the new
   * copy only once this process is gone, because the single-instance mutex has no
   * version in its name. Rejects with a short code when any step fails; in that case
   * nothing is replaced and this process keeps running.
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
