import type { ThemeDefinition } from '../types'

/** Modern minimal: quiet neutrals, one restrained accent, system sans. */
export const minimalTheme: ThemeDefinition = {
  id: 'minimal',
  variants: {
    light: 'minimal-light',
    dark: 'minimal-dark'
  },
  preview: {
    light: ['#f6f6f4', '#ffffff', '#c2453c', '#1f2328'],
    dark: ['#15171b', '#1d2025', '#e0655a', '#e7e9ec']
  }
}
