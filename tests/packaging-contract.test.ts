/**
 * Packaging contract test.
 *
 * `electron-builder.yml` ships only `out/` and `package.json`; `node_modules`
 * is deliberately excluded because electron-vite bundles everything the app
 * needs. That holds only while the main process and the preload script import
 * nothing from `dependencies`: `externalizeDepsPlugin()` rewrites those into a
 * runtime `require()`, which would then resolve against a directory that is not
 * inside the package.
 *
 * Catching it here rather than at packaging time matters because packaging only
 * happens on a release tag, long after the change has landed.
 *
 * The artefact check builds the bundles itself when they are absent. An earlier
 * version of this file asserted that `out/` already existed, which passed on a
 * machine where something had built before and failed on a clean checkout — an
 * environment-dependent test that reported green while proving nothing. Building
 * on demand makes the result independent of who ran what first.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const PROCESS_DIRS = [join(ROOT, 'src', 'main'), join(ROOT, 'src', 'preload')]

const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>
}

const runtimeDependencies = new Set(Object.keys(manifest.dependencies ?? {}))

const SPECIFIER_PATTERNS = [
  /\bfrom\s*['"]([^'"]+)['"]/g, // import … from '…' / export … from '…'
  /\bimport\s*\(\s*['"]([^'"]+)['"]/g, // dynamic import('…')
  /\brequire\s*\(\s*['"]([^'"]+)['"]/g, // require('…')
  /\bimport\s+['"]([^'"]+)['"]/g // side-effect import '…'
]

/** Module specifiers that are not relative paths and not `node:` builtins. */
function bareSpecifiers(source: string): string[] {
  const found = new Set<string>()
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]
      if (!specifier || specifier.startsWith('.') || specifier.startsWith('node:')) continue
      found.add(specifier)
    }
  }
  return [...found]
}

/** Resolves `react/jsx-runtime` to `react` and `@scope/pkg/sub` to `@scope/pkg`. */
function packageName(specifier: string): string {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier)
}

function collectSources(root: string): string[] {
  return readdirSync(root, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => join(entry.parentPath, entry.name))
}

/** POSIX-style path relative to the repository root, for readable assertions. */
function shortPath(absolute: string): string {
  return relative(ROOT, absolute).split(sep).join('/')
}

const processSources = PROCESS_DIRS.flatMap(collectSources)

/**
 * Bare `require()` calls in a built bundle.
 *
 * The source scan above cannot see this: `externalizeDepsPlugin()` is what turns
 * an `import` into a runtime `require`, and it reads `package.json`. So a source
 * file can look clean while the *bundle* ends up requiring a package that
 * `electron-builder.yml` deliberately leaves out of the package — a breakage that
 * `npm run dev` and `npm test` both hide, and that only shows up when someone
 * launches a packaged build.
 */
function bundleRequires(bundle: string): string[] {
  const found = new Set<string>()
  for (const match of bundle.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const specifier = match[1]
    if (specifier) found.add(specifier)
  }
  return [...found]
}

/** `electron` plus Node's own modules are always present in the runtime. */
function isRuntimeProvided(specifier: string): boolean {
  return specifier === 'electron' || specifier.startsWith('node:')
}

describe('the built bundles carry no runtime node_modules', () => {
  const MAIN_BUNDLE = join(ROOT, 'out', 'main', 'index.js')
  const PRELOAD_BUNDLE = join(ROOT, 'out', 'preload', 'index.js')

  /**
   * Builds the bundles when they are not there yet.
   *
   * Runs once for the whole file. Reusing an existing `out/` when one happens to
   * be present is deliberate — the check is then free — but the result no longer
   * *depends* on one existing, which is what made an earlier version of this file
   * pass locally and fail on a clean checkout.
   */
  let built = false
  function ensureBuilt(): void {
    if (built) return
    if (!existsSync(MAIN_BUNDLE) || !existsSync(PRELOAD_BUNDLE)) {
      execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'pipe', shell: true })
    }
    built = true
  }

  /**
   * A full electron-vite build takes a few seconds, well past vitest's 5s
   * default. Only paid when `out/` is absent; a normal dev loop already has it.
   */
  const BUILD_TIMEOUT_MS = 120_000

  it(
    'produces a main bundle and a preload bundle to inspect',
    () => {
      ensureBuilt()

      // If the build silently produced nothing, every assertion below would be
      // vacuous, so this one failing loudly is the point.
      expect(existsSync(MAIN_BUNDLE), 'npm run build produced no out/main/index.js').toBe(true)
      expect(existsSync(PRELOAD_BUNDLE), 'npm run build produced no out/preload/index.js').toBe(
        true
      )
    },
    BUILD_TIMEOUT_MS
  )

  it('requires only electron and Node builtins from the main bundle', () => {
    ensureBuilt()
    const offenders = bundleRequires(readFileSync(MAIN_BUNDLE, 'utf8')).filter(
      (specifier) => !isRuntimeProvided(specifier)
    )

    // Anything listed here would be resolved against a node_modules directory
    // that `electron-builder.yml` excludes from the package.
    expect(offenders).toEqual([])
  })

  it('requires only electron from the preload bundle', () => {
    ensureBuilt()
    const offenders = bundleRequires(readFileSync(PRELOAD_BUNDLE, 'utf8')).filter(
      (specifier) => !isRuntimeProvided(specifier)
    )

    expect(offenders).toEqual([])
  })

  it('detects the require forms it claims to detect', () => {
    // Without this the two assertions above could pass vacuously on a regex that
    // never matches.
    expect(bundleRequires(`const a = require("tyme4ts")`)).toEqual(['tyme4ts'])
    expect(bundleRequires(`const b = require('tyme4ts')`)).toEqual(['tyme4ts'])
    expect(bundleRequires(`require( "electron" )`)).toEqual(['electron'])
    expect(isRuntimeProvided('electron')).toBe(true)
    expect(isRuntimeProvided('node:fs')).toBe(true)
    expect(isRuntimeProvided('tyme4ts')).toBe(false)
  })
})

describe('the packaged app carries no runtime node_modules', () => {
  it('keeps the main process and preload free of runtime dependencies', () => {
    const offenders: string[] = []
    for (const file of processSources) {
      for (const specifier of bareSpecifiers(readFileSync(file, 'utf8'))) {
        const owner = packageName(specifier)
        if (runtimeDependencies.has(owner)) {
          offenders.push(
            `${shortPath(file)} imports '${specifier}' ('${owner}' is in dependencies)`
          )
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('actually scans the main process and preload sources', () => {
    // Guards against the walk silently matching nothing.
    expect(processSources.length).toBeGreaterThanOrEqual(3)
    expect(processSources.some((file) => file.endsWith('settings.ts'))).toBe(true)

    const scanned = new Set(
      processSources.flatMap((file) => bareSpecifiers(readFileSync(file, 'utf8')))
    )
    expect(scanned.has('electron')).toBe(true)
    expect(runtimeDependencies.size).toBeGreaterThan(0)
  })

  it('detects the specifier forms it claims to detect', () => {
    // Sanity-checks the parser so the assertion above cannot pass vacuously.
    expect(bareSpecifiers("import { useState } from 'react'")).toEqual(['react'])
    expect(bareSpecifiers("import 'react-dom'")).toEqual(['react-dom'])
    expect(bareSpecifiers("const a = require('tyme4ts')")).toEqual(['tyme4ts'])
    expect(bareSpecifiers("await import('react/jsx-runtime')")).toEqual(['react/jsx-runtime'])
    expect(bareSpecifiers("export { IPC } from '@shared/ipc'")).toEqual(['@shared/ipc'])
    expect(bareSpecifiers("import { readFileSync } from 'node:fs'")).toEqual([])
    expect(bareSpecifiers("import { cx } from './cx'")).toEqual([])
  })
})
