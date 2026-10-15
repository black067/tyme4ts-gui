import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  {
    // `vendor/**` is a read-only reference submodule and must never be linted.
    // `src-tauri/{target,gen}/**` 是 Rust 的构建产物，由 cargo/rustfmt 自己管。
    ignores: [
      'node_modules/**',
      '.tsbuild/**',
      'dist/**',
      'release/**',
      'coverage/**',
      'vendor/**',
      'src-tauri/target/**',
      'src-tauri/gen/**',
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

  // Node-side sources and build tooling. 自从没有主进程之后，"Node 侧"就只剩构建脚本
  // 与测试了——运行时的 JS 全部跑在 webview 里。
  {
    files: [
      'vite.config.ts',
      'vitest.config.ts',
      'eslint.config.mjs',
      'scripts/**/*.mjs',
      'src/shared/**/*.ts',
      'src/core/**/*.ts'
    ],
    languageOptions: {
      globals: { ...globals.node }
    }
  },

  // 构建脚本与测试自己掌握日志输出。
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.ts'],
    rules: {
      'no-console': 'off'
    }
  },

  // 应用的后端：跑在 webview 里，所以是浏览器全局；它也是唯一能碰 Tauri API 的地方
  // （见下面那条边界规则）。
  {
    files: ['src/backend/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser }
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

  // The splash bootstrap is a plain browser script served verbatim from
  // `public/`; it runs before any module, so it gets the browser globals.
  {
    files: ['src/renderer/public/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser }
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
            },
            {
              group: ['@backend', '@backend/*'],
              message: '渲染层只能通过 window.tyme 门面访问宿主能力，不要直接 import src/backend。'
            },
            {
              group: ['@tauri-apps/*'],
              message: '只有 src/backend 可以依赖 Tauri API；渲染层请用 window.tyme。'
            }
          ]
        }
      ]
    }
  },

  // 唯一的例外：入口文件。它是"两半合成一个应用"的那个点——先起后端（装好 window.tyme），
  // 再挂 React。除了它，渲染层任何文件都不该 import src/backend：门面仍然只有一处。
  {
    files: ['src/renderer/src/main.tsx'],
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
            },
            {
              group: ['@tauri-apps/*'],
              message: '只有 src/backend 可以依赖 Tauri API；入口也只调 startBackend()。'
            }
          ]
        }
      ]
    }
  },

  // The core engine must stay free of host, React and DOM dependencies.
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'core 层必须与 React 解耦。' },
            { name: 'react-dom', message: 'core 层必须与 React 解耦。' }
          ],
          patterns: [
            { group: ['@tauri-apps/*'], message: 'core 层不得依赖宿主 API。' },
            { group: ['node:*'], message: 'core 层跑在 webview 里，没有 Node 运行时。' },
            { group: ['@renderer/*'], message: 'core 层不得依赖渲染层。' },
            { group: ['@backend', '@backend/*'], message: 'core 层不得依赖应用后端。' }
          ]
        }
      ]
    }
  },

  // 宿主的窄接口只有一处：src/backend/host.ts 及其同目录。core / shared / renderer 一律
  // 不许直接 import Tauri——这条与上面几条一起构成 tests/host-boundary.test.ts 要核对的形状。
  {
    files: ['src/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@tauri-apps/*', 'node:*', '@backend', '@backend/*', '@renderer/*'],
              message: 'shared 层只放契约与类型，不依赖宿主、Node 或任何具体层。'
            }
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
