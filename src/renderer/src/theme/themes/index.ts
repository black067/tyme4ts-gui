import { DEFAULT_THEME_ID } from '@shared/ipc'
import type { ThemeDefinition } from '../types'
import { classicTheme } from './classic'
import { minimalTheme } from './minimal'

/** Registration order is the order shown in the theme picker. */
export const THEMES: readonly ThemeDefinition[] = [minimalTheme, classicTheme]

const BY_ID = new Map(THEMES.map((theme) => [theme.id, theme]))

export const DEFAULT_THEME: ThemeDefinition = BY_ID.get(DEFAULT_THEME_ID) ?? minimalTheme

/** Looks a theme up by id, falling back to the default for unknown values. */
export function getTheme(id: string): ThemeDefinition {
  return BY_ID.get(id) ?? DEFAULT_THEME
}
