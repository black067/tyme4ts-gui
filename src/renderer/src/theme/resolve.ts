import type { AppearanceMode } from '@shared/ipc'
import { getTheme } from './themes'
import { resolveVariant } from './types'

/**
 * Maps the persisted preferences onto the concrete `data-theme` value.
 *
 * Unknown theme ids fall back to the default family, so a settings file written
 * by an older or newer build can never break rendering.
 */
export function resolveThemeId(
  themeId: string,
  appearance: AppearanceMode,
  systemPrefersDark: boolean
): string {
  const theme = getTheme(themeId)
  return theme.variants[resolveVariant(appearance, systemPrefersDark)]
}
