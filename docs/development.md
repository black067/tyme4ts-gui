# 开发

## 环境要求

- Node.js `^20.19.0 || >=22.12.0`（开发机验证版本：`v24.14.0`）
- npm（开发机验证版本：`11.9.0`）
- Git（开发机验证版本：`2.50.1.windows.1`）

## 首次准备

```bash
npm install
```

> **首次运行的额外下载**：Electron 44 不再提供 `postinstall` 脚本，改为惰性安装 —— 第一次执行
> `npm run dev`（或任何 `require('electron')`）时才会下载约 100 MB 的运行时到
> `node_modules/electron/dist`。若下载失败（网络受限），可手动执行
> `node node_modules/electron/install.js`；或先设置镜像
> `$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'` 再重试。

> 首次 clone 后如果 `vendor/tyme4ts` 是空的，执行：
> `git submodule update --init --depth 1`

## 常用脚本

| 命令                   | 说明                                                          |
| ---------------------- | ------------------------------------------------------------- |
| `npm run dev`          | 启动 Electron 开发模式（主进程 / preload / 渲染进程均带 HMR） |
| `npm run build`        | 类型检查 + 构建生产产物到 `out/`（快速验证用）                |
| `npm run preview`      | 用构建产物启动应用                                            |
| `npm run package`      | 构建 + 打包为免安装便携版 exe，产物在 `release/`              |
| `npm run package:dir`  | 只解包到 `release/win-unpacked`（更快，用于先验证再出单文件） |
| `npm run clean`        | 删除 `out/` `release/` `.tsbuild/`                            |
| `npm run typecheck`    | 主进程侧 + 渲染进程侧类型检查                                 |
| `npm run lint`         | ESLint                                                        |
| `npm run format`       | Prettier 格式化（会改写文件）                                 |
| `npm run format:check` | Prettier 只检查不修改（CI 跑的就是这个）                      |
| `npm test`             | Vitest 单测                                                   |
| `npm run test:watch`   | Vitest 监听模式                                               |

## 在 VS Code 里开发

仓库内置 `.vscode/tasks.json` 与 `.vscode/launch.json`，`Ctrl+Shift+P` → **Tasks: Run Task** 即可看到：

| Task                                              | 对应命令               | 用途                               |
| ------------------------------------------------- | ---------------------- | ---------------------------------- |
| **dev**（默认构建任务）                           | `npm run dev`          | `Ctrl+Shift+B` 直接起开发模式      |
| **build**                                         | `npm run build`        | 快速验证生产产物                   |
| **package**                                       | `npm run package`      | 出便携版 exe 到 `release/`         |
| **package:dir**                                   | `npm run package:dir`  | 只解包，快速验证打包配置           |
| **preview**                                       | `npm run preview`      | 跑构建产物                         |
| **clean**                                         | `npm run clean`        | 清理 `out/` `release/` `.tsbuild/` |
| **typecheck / lint / test / test:watch / format** | 同名脚本               | 日常检查                           |
| **format:check**                                  | `npm run format:check` | 提交前确认格式不会被 CI 打回       |

`dev` 配了 problem matcher，以主进程打印的 `[tyme-app] main window ready` 作为就绪信号，因此
`launch.json` 里的调试配置可以拿它当 `preLaunchTask`：按 F5 会先起应用再挂调试器。

| 调试配置             | 说明                                                       |
| -------------------- | ---------------------------------------------------------- |
| 调试主进程（dev）    | 以 `--inspect=5858` 起开发模式并自动附加，可断点主进程代码 |
| 调试渲染进程（dev）  | 以 `--remoteDebuggingPort=9222` 起开发模式并自动附加       |
| 调试主进程（仅附加） | 应用已在运行时手动附加                                     |

渲染层也可以直接按 `F12` 打开 DevTools（开发模式下由 `@electron-toolkit/utils` 提供）。

## 测试

| 层次       | 位置                                     | 覆盖内容                                                            |
| ---------- | ---------------------------------------- | ------------------------------------------------------------------- |
| 引擎一致性 | `src/core/__tests__/tyme4ts-conformance` | 直接移植 `vendor/tyme4ts/test/**` 的断言，作为 DTO 字段映射是否正确 |
| 引擎单元   | `src/core/__tests__/*`                   | 日期步进、月/年网格、换算、检索、八字、术语表、性能预算             |
| 渲染层集成 | `src/renderer/src/__tests__/*`           | jsdom + 伪 preload bridge：视图切换、选日、主题、工具页、快捷键     |
| 架构契约   | `tests/theme-tokens.test.ts`             | 配色是否越界、主题 token 是否完整                                   |
| 打包契约   | `tests/packaging-contract.test.ts`       | 主进程 / preload 没有引入运行时要 `require` 的 `dependencies`       |

`perf.test.ts` 用宽松上限（约实测值的 10 倍）守住数量级回退，例如网格单元不得退化成构建完整黄历。

渲染层测试通过在文件顶部加 `// @vitest-environment jsdom` 单独选择 DOM 环境，`vitest.config.ts`
的默认环境仍是 `node`（core 测试不需要 DOM，跑得更快）。
