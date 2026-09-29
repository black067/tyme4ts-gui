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

/**
 * Dependencies that must be **bundled** rather than left as a runtime `require`.
 *
 * `electron-builder.yml` excludes `node_modules` from the package, so anything
 * the main process requires at runtime would not be there. `tyme4ts` reaches the
 * main process through `@core` (the holiday overlay), so without this the built
 * `out/main/index.js` would contain `require("tyme4ts")` and a packaged app
 * would fail on launch — while `npm run dev` and `npm test` kept working, which
 * is exactly the kind of breakage that only shows up in a release.
 *
 * `tests/packaging-contract.test.ts` now also scans the built bundles, so this
 * cannot silently regress.
 */
const bundledDeps: string[] = ['tyme4ts']

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: bundledDeps })],
    resolve: {
      alias: sharedAliases
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: bundledDeps })],
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
