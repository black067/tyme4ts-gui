import { describe, expect, it } from 'vitest'
import { DEFAULT_LOCALE } from '@shared/ipc'
import { getMessages } from '@renderer/i18n/messages'
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

  it('每个主题都有显示名与说明（在文案目录里）', () => {
    // 主题定义本身不再带文案：界面文案按 id 从目录取，所以"加了主题忘了写文案"
    // 要靠这条断言挡住。
    const names = getMessages(DEFAULT_LOCALE).settings.appearance.themeNames
    const descriptions = getMessages(DEFAULT_LOCALE).settings.appearance.themeDescriptions

    for (const theme of THEMES) {
      const key = theme.id as keyof typeof names
      expect(names[key]?.length ?? 0).toBeGreaterThan(0)
      expect(descriptions[key as keyof typeof descriptions]?.length ?? 0).toBeGreaterThan(0)
      // 预览色要够画出小样。
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
