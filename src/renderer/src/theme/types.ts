import type { AppearanceMode } from '@shared/ipc'

/**
 * The theme contract.
 *
 * A theme is a *family* that must provide both a light and a dark variant; the
 * concrete `data-theme` value is chosen from the resolved appearance. Adding a
 * theme therefore means adding one definition here plus one `:root[data-theme]`
 * block per variant in `tokens.css` — no component ever changes.
 */
export interface ThemeDefinition {
  /** Stable id stored in settings. */
  id: string
  name: string
  description: string
  /** Concrete `data-theme` values written to `<html>`. */
  variants: Record<'light' | 'dark', string>
  /** Representative colours for the picker UI; never used for rendering. */
  preview: Record<'light' | 'dark', readonly string[]>
}

export type ThemeVariant = 'light' | 'dark'

/** The variant a given appearance resolves to, ignoring the theme family. */
export function resolveVariant(
  appearance: AppearanceMode,
  systemPrefersDark: boolean
): ThemeVariant {
  if (appearance === 'system') return systemPrefersDark ? 'dark' : 'light'
  return appearance
}
