# 架构

## 目录结构

```
src/
├─ main/        Electron 主进程：窗口、设置持久化、IPC handler
├─ preload/     通过 contextBridge 暴露 window.tyme
├─ shared/      主进程与渲染进程共用的 IPC 契约与类型
├─ core/        纯 TypeScript 历法内核（零 Electron / React / DOM 依赖）
│  └─ glossary/ 术语释义：纯数据 + 查表，同样不依赖引擎
└─ renderer/    React 界面：视图、组件、主题、语言、hooks
tests/          读取源码树的架构契约测试（配色 / token、打包前提、术语释义、语言）
tests/fixtures/ 术语释义校验用的公版原文与其它测试数据（不进包）
scripts/        开发辅助脚本（clean.mjs、截图验证、术语抓取、语言基线）
docs/           本目录
.vscode/        tasks.json / launch.json / settings.json（构建产物监听排除）
.github/        Actions 工作流（见 packaging.md）
electron-builder.yml  便携版打包配置
vendor/tyme4ts/ 只读 git submodule，用于查阅 tyme4ts 源码
```

`main` 与 `preload` 的产物只 `require('electron')` 和 `node:` 内置模块（其余依赖已全部被 Vite
打进 bundle），因此打包时不需要任何运行时 `node_modules`。

这条约束有前提：electron-vite 的 `externalizeDepsPlugin()` 会把 `dependencies` 里出现过的包
改写成运行时 `require()`。所以**主进程与 preload 不得从 `dependencies` 导入任何包**，由
`tests/packaging-contract.test.ts` 在 `npm test` 里守住。

## 模块边界（由 ESLint 强制）

1. `src/renderer/**` **只允许**从 `@core` 单一入口导入，**禁止**直接 `import 'tyme4ts'`
   或深入 `@core/*` 内部模块。
2. `src/core/**` 不得导入 Electron、React 或任何 DOM API。
3. `src/core` 对外暴露的全部是可序列化的普通对象（DTO），不泄露 tyme4ts 的类实例。
   core 的出口契约是「不可变」的：网格里的同一天在不同月份共享同一个对象。
4. `vendor/**` 被 tsconfig、ESLint、Prettier 全部忽略，不参与编译与检查。
5. 渲染层组件**禁止硬编码颜色**，只能使用语义化主题 token（见 [theming.md](theming.md)）。
6. `src/core/glossary/**` 是**纯数据**：不 import tyme4ts，也不碰 Electron / React / DOM。
   引擎的权威名单由 `tests/glossary-contract.test.ts` 交叉校验。
7. `src/renderer/src/i18n/**` 是**唯一的文案来源**：渲染层不得再写死中文，由
   `tests/i18n-contract.test.ts` 按文件守住"只减不增"（见 [i18n.md](i18n.md)）。

这些规则都写在 `eslint.config.mjs` 里，违反时会直接报错而不是警告。

## 架构要点

- **`src/core` 是唯一接触 tyme4ts 的地方。** 它把引擎的类实例转换成 plain object DTO，
  因此这一层可以整体搬进 Web Worker 或主进程而无需改动调用方。
- **失败是返回值，不是异常。** `convert()` 与 `buildEightChar()` 返回
  `{ ok: false, error }`，工具页在用户输入过程中就地渲染错误。
- **引擎能力按天分档。** `DaySummary`（0.17 ms/天）服务月/年网格，
  `DayInfo`（1.6 ms/天）只在日详情与时间轴按需构建，都由 LRU 缓存记忆化。
- **选中日期是唯一真相。** 月、年、时间轴、键盘导航与侧栏全部由 `selected` 派生。

## 数据流

```
tyme4ts ──▶ src/core（DTO + LRU 缓存）──▶ React 组件
                    ▲                          │
                    │ 仅 @core 单一入口         │ 文案取自 renderer/src/i18n
                    │                          ▼
渲染进程 ──window.tyme──▶ preload（contextBridge）──IPC──▶ 主进程
                                                          ├─ settings.json 读写
                                                          ├─ nativeTheme.themeSource
                                                          └─ app.getPath('userData')
```

IPC 契约集中在 `src/shared/ipc.ts`（更新部分拆到 `src/shared/update.ts` 再 re-export），
主进程 / preload / 渲染进程三侧共用；这些文件不得导入 Electron / React / DOM。

| 通道                    | 方向      | 作用                                                    |
| ----------------------- | --------- | ------------------------------------------------------- |
| `settings:get`          | 渲染 → 主 | 读取设置（首次运行返回默认值）                          |
| `settings:set`          | 渲染 → 主 | 局部更新设置并落盘；`appearance` 同步原生主题           |
| `theme:set-native`      | 渲染 → 主 | 只同步 `nativeTheme.themeSource`                        |
| `app:get-info`          | 渲染 → 主 | 应用名 / 版本 / 作者 / 运行时版本 / 数据目录 / 当前语言 |
| `updates:get-state`     | 渲染 → 主 | 读更新流程的快照                                        |
| `updates:check`         | 渲染 → 主 | 问 GitHub 有没有新版本，并记下检查时间                  |
| `updates:download`      | 渲染 → 主 | 下载并用资产自带的 SHA-256 校验                         |
| `updates:cancel`        | 渲染 → 主 | 放弃正在进行的下载                                      |
| `updates:install`       | 渲染 → 主 | 以独立进程启动新版并退出本文进程                        |
| `updates:state-changed` | 主 → 渲染 | 推送更新状态；下载进度必须实时，轮询就要加定时器        |

窗口以 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true` 创建，渲染进程
只能看到 preload 显式暴露的方法。
