import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

/**
 * Alias map shared by every Electron target. `@core` points at the core facade
 * so that the renderer can only reach the calendar engine through one entry.
 */
const sharedAliases = {
  '@core': resolve('src/core/index.ts'),
  '@shared': resolve('src/shared')
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: sharedAliases
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: sharedAliases
    }
  },
  renderer: {
    resolve: {
      alias: {
        ...sharedAliases,
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
