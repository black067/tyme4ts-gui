/**
 * Update check against GitHub Releases.
 *
 * ## Why this is hand-written
 *
 * `electron-updater` supports exactly one auto-updatable Windows target: NSIS.
 * This app ships a `portable` single-file exe (`electron-builder.yml`), and
 * adding the package would also break `tests/packaging-contract.test.ts`, which
 * forbids the main process from importing anything in `dependencies`. So the
 * network layer is built on Node's `https` and the version/asset rules live in
 * the pure, tested `src/core/update.ts`.
 *
 * ## Integrity
 *
 * The GitHub Releases API exposes a per-asset `digest` (`sha256:<hex>`). That is
 * what the download is verified against — no extra checksum file needs to be
 * published, and a truncated or tampered download can never be reported ready.
 *
 * ## Trust boundary
 *
 * The API response is untrusted input: it is parsed by `parseReleases`, which
 * coerces and drops rather than trusting, and every failure becomes an
 * `UpdateErrorCode` instead of an exception crossing the IPC boundary.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs'
import { get as httpsGet } from 'node:https'
import type { IncomingMessage } from 'node:http'
import { join } from 'node:path'
import { app, shell } from 'electron'
import {
  isNewerVersion,
  parseReleases,
  selectLatestPortableRelease,
  type PortableAssetSelection
} from '@core'
import type { UpdateErrorCode, UpdateState } from '@shared/update'

const RELEASES_URL = 'https://api.github.com/repos/black067/tyme4ts-gui/releases'
const USER_AGENT = 'tyme-app-updater (https://github.com/black067/tyme4ts-gui)'
const REQUEST_TIMEOUT_MS = 15_000
/** A 100 MB portable exe is normal; a gigabyte is not, so stop there. */
const MAX_DOWNLOAD_BYTES = 600 * 1024 * 1024

type Listener = (state: UpdateState) => void

const listeners = new Set<Listener>()

let state: UpdateState = {
  phase: 'idle',
  currentVersion: app.getVersion(),
  latestVersion: null,
  releaseNotes: null,
  releaseUrl: null,
  progress: null,
  errorCode: null,
  canInstall: false
}

let selection: PortableAssetSelection | null = null
/** Set while a download runs so `cancel()` can stop it at the next chunk. */
let activeDownload: { destroy: () => void } | null = null

function setState(patch: Partial<UpdateState>): UpdateState {
  state = { ...state, currentVersion: app.getVersion(), ...patch }
  for (const listener of listeners) listener(state)
  return state
}

function fail(code: UpdateErrorCode): UpdateState {
  activeDownload = null
  return setState({
    phase: 'error',
    errorCode: code,
    progress: null,
    canInstall: false
  })
}

export function getUpdateState(): UpdateState {
  return state
}

export function subscribeUpdates(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Fetches a URL as text with a bounded timeout.
 *
 * Resolves with the body and status rather than throwing, so callers can map
 * HTTP status onto a specific error code (a 403 here means rate limiting, which
 * the user can act on by waiting).
 */
function fetchText(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = httpsGet(
      url,
      {
        headers: {
          // GitHub rejects requests without a User-Agent.
          'User-Agent': USER_AGENT,
          Accept: 'application/vnd.github+json'
        }
      },
      (response: IncomingMessage) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8')
          })
        )
      }
    )

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error('timeout'))
    })
    request.on('error', reject)
  })
}

/** Checks GitHub for a newer portable release. */
export async function checkForUpdates(): Promise<UpdateState> {
  setState({ phase: 'checking', errorCode: null, progress: null, canInstall: false })

  let response: { status: number; body: string }
  try {
    response = await fetchText(RELEASES_URL)
  } catch {
    return fail('network')
  }

  if (response.status === 403 || response.status === 429) return fail('rate-limited')
  if (response.status < 200 || response.status >= 300) return fail('network')

  let json: unknown
  try {
    json = JSON.parse(response.body)
  } catch {
    // A non-JSON body means we are almost certainly behind a captive portal or
    // proxy rather than talking to GitHub.
    return fail('network')
  }

  const parsed = parseReleases(json)
  if (!parsed.ok) return fail('network')

  const picked = selectLatestPortableRelease(parsed.releases)
  if (!picked.ok) {
    // No installable asset is not an error worth interrupting the user for;
    // it means the published releases carry nothing we can run.
    selection = null
    return setState({
      phase: 'up-to-date',
      latestVersion: null,
      releaseNotes: null,
      releaseUrl: null,
      errorCode: null
    })
  }

  const found = picked.selection
  if (!isNewerVersion(found.version, app.getVersion())) {
    selection = null
    return setState({
      phase: 'up-to-date',
      latestVersion: found.version,
      releaseNotes: null,
      releaseUrl: found.releaseUrl,
      errorCode: null
    })
  }

  selection = found
  return setState({
    phase: 'available',
    latestVersion: found.version,
    releaseNotes: found.releaseNotes,
    releaseUrl: found.releaseUrl,
    errorCode: null
  })
}

function downloadDir(): string {
  const dir = join(app.getPath('userData'), 'updates')
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Streams `url` to `target`, hashing as it goes. */
function downloadTo(
  url: string,
  target: string,
  total: number,
  onProgress: (transferred: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    let transferred = 0

    const request = httpsGet(url, { headers: { 'User-Agent': USER_AGENT } }, (response) => {
      // GitHub redirects release assets to a CDN; follow it rather than
      // treating the 302 as a failure.
      if (
        response.statusCode !== undefined &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        response.resume()
        downloadTo(response.headers.location, target, total, onProgress).then(resolve, reject)
        return
      }

      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`unexpected status ${response.statusCode}`))
        return
      }

      const file = createWriteStream(target)
      activeDownload = { destroy: () => response.destroy() }

      response.on('data', (chunk: Buffer) => {
        transferred += chunk.length
        hash.update(chunk)
        if (transferred > MAX_DOWNLOAD_BYTES) {
          response.destroy()
          file.destroy()
          reject(new Error('too large'))
          return
        }
        onProgress(transferred)
      })

      response.pipe(file)
      file.on('finish', () => {
        file.close(() => resolve(hash.digest('hex')))
      })
      file.on('error', reject)
    })

    request.setTimeout(REQUEST_TIMEOUT_MS, () => request.destroy(new Error('timeout')))
    request.on('error', reject)
  })
}

/** Downloads the offered release and verifies its SHA-256. */
export async function downloadUpdate(): Promise<UpdateState> {
  if (selection === null) return fail('no-compatible-asset')

  // Held locally so the closures below cannot observe a later change to
  // `selection`; the download must finish against the release it started with.
  const chosen = selection
  const expected = chosen.sha256
  if (expected === null) {
    // Without a digest we cannot verify what we downloaded, and shipping an
    // unverifiable executable is worse than not updating.
    return fail('checksum-mismatch')
  }

  const target = join(downloadDir(), chosen.name)
  setState({
    phase: 'downloading',
    progress: { transferred: 0, total: chosen.size },
    errorCode: null
  })

  let actual: string
  try {
    actual = await downloadTo(chosen.downloadUrl, target, chosen.size, (transferred) =>
      setState({ progress: { transferred, total: chosen.size } })
    )
  } catch {
    activeDownload = null
    // Leave no partial file behind: a half-written exe looks installable.
    try {
      if (existsSync(target)) unlinkSync(target)
    } catch {
      // Nothing useful to do; the failure below is the real error.
    }
    return fail('disk')
  }
  activeDownload = null

  if (actual !== expected) {
    try {
      unlinkSync(target)
    } catch {
      // Reported as a checksum failure either way.
    }
    return fail('checksum-mismatch')
  }

  return setState({
    phase: 'ready',
    progress: { transferred: chosen.size, total: chosen.size },
    canInstall: true,
    errorCode: null
  })
}

/** Stopping mid-download leaves no usable file, so the state resets to available. */
export function cancelUpdate(): UpdateState {
  activeDownload?.destroy()
  activeDownload = null

  const pending = selection
  return setState({
    phase: pending === null ? 'idle' : 'available',
    progress: null,
    canInstall: false,
    errorCode: null
  })
}

/** Launches the downloaded launcher detached and quits this process. */
export function installUpdate(): UpdateState {
  if (selection === null || !state.canInstall) return fail('install-failed')

  const exe = join(downloadDir(), selection.name)
  try {
    if (!existsSync(exe) || statSync(exe).size === 0) return fail('install-failed')
  } catch {
    return fail('install-failed')
  }

  try {
    // The portable launcher unpacks to its own temp directory, so starting the
    // new one does not fight this process for files. Windows refuses to replace
    // a running image, which is exactly why we start the new file rather than
    // overwriting our own.
    const child = spawn(exe, [], { detached: true, stdio: 'ignore' })
    child.unref()
  } catch {
    // Fall back to showing the file so the user can run it manually.
    void shell.showItemInFolder(exe)
    return fail('install-failed')
  }

  // Give the child a moment to start before tearing the app down.
  setTimeout(() => app.quit(), 400)
  return setState({ phase: 'idle', canInstall: false })
}
