/**
 * Source-tree contract tests.
 *
 * These inspect the working tree with `node:fs`, so they live outside `src/` and
 * are covered by the node side of the type checker.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { THEMES } from '../src/renderer/src/theme/themes'

const RENDERER_SRC = join(process.cwd(), 'src', 'renderer', 'src')
const THEME_DIR = join(RENDERER_SRC, 'theme')
const TOKENS_CSS = join(THEME_DIR, 'tokens.css')

function collectFiles(root: string, extensions: readonly string[]): string[] {
  return readdirSync(root, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext)))
    .map((entry) => join(entry.parentPath, entry.name))
}

/** POSIX-style path relative to `src/renderer/src`, for readable assertions. */
function shortPath(absolute: string): string {
  return relative(RENDERER_SRC, absolute).split(sep).join('/')
}

const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/g

/** Extracts the body of `selector { … }`, or null when the block is absent. */
function blockBody(css: string, selector: string): string | null {
  const start = css.indexOf(`${selector} {`)
  if (start === -1) return null
  const open = css.indexOf('{', start)
  let depth = 1
  for (let index = open + 1; index < css.length; index += 1) {
    const char = css[index]
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return css.slice(open + 1, index)
    }
  }
  return null
}

function customProperties(body: string): Set<string> {
  const names = new Set<string>()
  for (const match of body.matchAll(/(--[\w-]+)\s*:/g)) {
    if (match[1]) names.add(match[1])
  }
  return names
}

const sourceFiles = collectFiles(RENDERER_SRC, ['.ts', '.tsx', '.css']).filter(
  (file) => !file.startsWith(THEME_DIR)
)

describe('colour literals stay inside the theme layer', () => {
  it('finds no hard-coded colours in components, features, state or styles', () => {
    const offenders: string[] = []
    for (const file of sourceFiles) {
      const matches = readFileSync(file, 'utf8').match(COLOUR_LITERAL)
      if (matches && matches.length > 0) {
        offenders.push(`${shortPath(file)}: ${[...new Set(matches)].join(', ')}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('actually scans the renderer sources', () => {
    // Guards against the walk silently matching nothing.
    expect(sourceFiles.length).toBeGreaterThanOrEqual(12)
    expect(sourceFiles.some((file) => file.endsWith('global.css'))).toBe(true)
    expect(sourceFiles.some((file) => file.endsWith('DayCell.tsx'))).toBe(true)
  })

  it('detects the patterns it claims to detect', () => {
    // Sanity-checks the detector so the assertion above cannot pass vacuously.
    expect('color: #ff0000;'.match(COLOUR_LITERAL)).not.toBeNull()
    expect('color: #fff;'.match(COLOUR_LITERAL)).not.toBeNull()
    expect('background: rgb(1 2 3);'.match(COLOUR_LITERAL)).not.toBeNull()
    expect('background: rgba(1, 2, 3, 0.5);'.match(COLOUR_LITERAL)).not.toBeNull()
    expect('color: var(--color-text);'.match(COLOUR_LITERAL)).toBeNull()
    expect('a { color: #root; }'.match(COLOUR_LITERAL)).toBeNull()
  })
})

describe('tokens.css stays in step with the theme registry', () => {
  const tokensCss = readFileSync(TOKENS_CSS, 'utf8')

  const variantIds = THEMES.flatMap((theme) => [theme.variants.light, theme.variants.dark])

  /** Custom properties defined by a variant block, or null when it is absent. */
  function variantTokens(id: string): Set<string> | null {
    const body = blockBody(tokensCss, `:root[data-theme='${id}']`)
    return body === null ? null : customProperties(body)
  }

  it('defines the shared base block and the theme rule blocks', () => {
    expect(blockBody(tokensCss, ':root')).not.toBeNull()
    expect(variantIds).toHaveLength(4)
  })

  it('defines the same colour and shadow token set in every variant', () => {
    const defined = variantIds.map((id) => [id, variantTokens(id)] as const)
    const missingBlocks = defined.filter(([, tokens]) => tokens === null).map(([id]) => id)
    expect(missingBlocks).toEqual([])

    // Colours and shadows must be complete in every variant. Typography is a
    // deliberate per-theme override, so it is allowed to fall back to `:root`.
    const mustBeThemed = (token: string): boolean =>
      token.startsWith('--color-') || token.startsWith('--shadow-')

    const union = new Set<string>()
    for (const [, tokens] of defined) {
      for (const token of tokens ?? []) if (mustBeThemed(token)) union.add(token)
    }
    expect(union.size).toBeGreaterThan(25)

    const gaps: string[] = []
    for (const [id, tokens] of defined) {
      for (const token of union) {
        if (!tokens?.has(token)) gaps.push(`${id} is missing ${token}`)
      }
    }
    expect(gaps).toEqual([])
  })

  it('never redefines a shared (non-colour) token per theme', () => {
    // Spacing, radii, typography sizes and motion belong to the base block;
    // only colours and shadows vary by theme. Font families are the deliberate
    // exception, because they are part of a theme's character.
    const sharedPrefixes = ['--space-', '--radius-', '--font-size-', '--transition-']
    const offenders: string[] = []
    for (const id of variantIds) {
      for (const token of variantTokens(id) ?? []) {
        if (sharedPrefixes.some((prefix) => token.startsWith(prefix))) {
          offenders.push(`${id} redefines ${token}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('defines no orphan variant blocks', () => {
    const declared = new Set(variantIds)
    const blocks = [...tokensCss.matchAll(/:root\[data-theme='([\w-]+)'\]\s*\{/g)]
      .map((match) => match[1])
      .filter((id): id is string => typeof id === 'string')
    expect(blocks.filter((id) => !declared.has(id))).toEqual([])
  })
})
