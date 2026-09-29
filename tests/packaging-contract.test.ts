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
 * Catching it here rather than in the packaging job matters because that job
 * only runs in CI, after the change is already merged.
 */
import { readdirSync, readFileSync } from 'node:fs'
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
