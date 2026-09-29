import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  {
    // `vendor/**` is a read-only reference submodule and must never be linted.
    ignores: [
      'node_modules/**',
      'out/**',
      'dist/**',
      'release/**',
      'coverage/**',
      'vendor/**',
      '.eslintcache'
    ]
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' }
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }]
    }
  },

  // Node-side sources and build tooling.
  {
    files: [
      'electron.vite.config.ts',
      'vitest.config.ts',
      'eslint.config.mjs',
      'src/main/**/*.ts',
      'src/preload/**/*.ts',
      'src/shared/**/*.ts',
      'src/core/**/*.ts'
    ],
    languageOptions: {
      globals: { ...globals.node }
    }
  },

  // The main process owns the application log stream.
  {
    files: ['src/main/**/*.ts'],
    rules: {
      'no-console': 'off'
    }
  },

  // Renderer (browser + React).
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser }
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh
    },
    rules: {
      ...reactHooks.configs['flat']['recommended-latest'].rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }]
    }
  },

  // Architectural boundary: the renderer must go through the core facade and
  // must never touch tyme4ts directly, so that the calendar engine stays
  // swappable and its DTOs stay serializable.
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'tyme4ts',
              message:
                '渲染层禁止直接依赖 tyme4ts。请在 src/core 中封装能力，并通过 @core 导入可序列化的 DTO。'
            }
          ],
          patterns: [
            {
              group: ['tyme4ts/*'],
              message:
                '渲染层禁止直接依赖 tyme4ts。请在 src/core 中封装能力，并通过 @core 导入可序列化的 DTO。'
            },
            {
              group: ['@core/*'],
              message: '渲染层只能从 @core 单一入口导入，不要深入 core 内部模块。'
            }
          ]
        }
      ]
    }
  },

  // The core engine must stay free of Electron, React and DOM dependencies.
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'electron', message: 'core 层必须与 Electron 解耦。' },
            { name: 'react', message: 'core 层必须与 React 解耦。' },
            { name: 'react-dom', message: 'core 层必须与 React 解耦。' }
          ],
          patterns: [
            { group: ['electron/*'], message: 'core 层必须与 Electron 解耦。' },
            { group: ['@renderer/*'], message: 'core 层不得依赖渲染层。' },
            { group: ['@main/*'], message: 'core 层不得依赖主进程。' }
          ]
        }
      ]
    }
  },

  // Test files may use looser typing helpers.
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'src/**/__tests__/**/*'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },

  prettier
)
