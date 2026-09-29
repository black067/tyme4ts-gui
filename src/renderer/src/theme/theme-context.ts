import { createContext, useContext } from 'react'
import type { ThemeDefinition } from './types'

export interface ThemeContextValue {
  /** The theme family the user picked. */
  theme: ThemeDefinition
  /** The concrete `data-theme` value currently applied to `<html>`. */
  resolvedThemeId: string
  /** True when the light/dark variant currently in effect is dark. */
  isDark: boolean
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (value === null) {
    throw new Error('useTheme must be called inside <ThemeProvider>')
  }
  return value
}
