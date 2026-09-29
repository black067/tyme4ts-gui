import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, THEMES, getTheme } from '../themes'
import { resolveThemeId } from '../resolve'
import { resolveVariant } from '../types'

describe('theme registry', () => {
  it('ships several themes and a resolvable default', () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(2)
    expect(DEFAULT_THEME.id).toBe('minimal')
    expect(THEMES.some((theme) => theme.id === DEFAULT_THEME.id)).toBe(true)
  })

  it('gives every theme a unique id and distinct variant ids', () => {
    const ids = THEMES.map((theme) => theme.id)
    expect(new Set(ids).size).toBe(ids.length)

    const variants = THEMES.flatMap((theme) => [theme.variants.light, theme.variants.dark])
    expect(new Set(variants).size).toBe(variants.length)
  })

  it('falls back to the default for an unknown id', () => {
    expect(getTheme('does-not-exist').id).toBe(DEFAULT_THEME.id)
    expect(getTheme('classic').id).toBe('classic')
  })

  it('describes every theme and previews both variants', () => {
    for (const theme of THEMES) {
      expect(theme.name.length).toBeGreaterThan(0)
      expect(theme.description.length).toBeGreaterThan(0)
      expect(theme.preview.light.length).toBeGreaterThanOrEqual(2)
      expect(theme.preview.dark.length).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('resolveVariant', () => {
  it('follows the OS only when the appearance is system', () => {
    expect(resolveVariant('system', true)).toBe('dark')
    expect(resolveVariant('system', false)).toBe('light')
    expect(resolveVariant('light', true)).toBe('light')
    expect(resolveVariant('dark', false)).toBe('dark')
  })
})

describe('resolveThemeId', () => {
  it('maps preferences onto a concrete data-theme value', () => {
    expect(resolveThemeId('minimal', 'light', false)).toBe('minimal-light')
    expect(resolveThemeId('minimal', 'dark', false)).toBe('minimal-dark')
    expect(resolveThemeId('minimal', 'system', true)).toBe('minimal-dark')
    expect(resolveThemeId('minimal', 'system', false)).toBe('minimal-light')
    expect(resolveThemeId('classic', 'light', true)).toBe('classic-light')
  })

  it('recovers from an unknown stored theme id', () => {
    expect(resolveThemeId('unknown-theme', 'dark', false)).toBe('minimal-dark')
    expect(resolveThemeId('', 'light', false)).toBe('minimal-light')
  })
})
