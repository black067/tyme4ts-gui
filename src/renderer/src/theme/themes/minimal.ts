import type { ThemeDefinition } from '../types'

/** Modern minimal: quiet neutrals, one restrained accent, system sans. */
export const minimalTheme: ThemeDefinition = {
  id: 'minimal',
  name: '现代简约',
  description: '浅色卡片、克制的朱红点缀，信息密度高，长时间阅读不累眼。',
  variants: {
    light: 'minimal-light',
    dark: 'minimal-dark'
  },
  preview: {
    light: ['#f6f6f4', '#ffffff', '#c2453c', '#1f2328'],
    dark: ['#15171b', '#1d2025', '#e0655a', '#e7e9ec']
  }
}
