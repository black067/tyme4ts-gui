import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@core': resolve('src/core/index.ts'),
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer/src')
    }
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts'],
    setupFiles: ['src/renderer/src/test/setup.ts'],
    restoreMocks: true,
    reporters: ['default']
    // Renderer tests opt into a DOM with a `// @vitest-environment jsdom` docblock.
  }
})
