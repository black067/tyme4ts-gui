import type { ThemeDefinition } from '../types'

/** Traditional Chinese: 宣纸 base, 朱红 accent, serif/kai display type. */
export const classicTheme: ThemeDefinition = {
  id: 'classic',
  name: '中国传统',
  description: '宣纸底色、朱红与墨色，衬线字体与更宽的留白，更接近老黄历的观感。',
  variants: {
    light: 'classic-light',
    dark: 'classic-dark'
  },
  preview: {
    light: ['#f3ecdd', '#fbf6ea', '#a8322a', '#2b2620'],
    dark: ['#191512', '#231d18', '#c9553f', '#ece3d4']
  }
}
