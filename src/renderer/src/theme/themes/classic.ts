import type { ThemeDefinition } from '../types'

/** Traditional Chinese: 宣纸 base, 朱红 accent, serif/kai display type. */
export const classicTheme: ThemeDefinition = {
  id: 'classic',
  variants: {
    light: 'classic-light',
    dark: 'classic-dark'
  },
  preview: {
    light: ['#f3ecdd', '#fbf6ea', '#a8322a', '#2b2620'],
    dark: ['#191512', '#231d18', '#c9553f', '#ece3d4']
  }
}
