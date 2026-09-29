# tyme-app

一个运行在 Windows 上的桌面万年历程序，基于 **Electron + React + TypeScript**，历法数据全部来自
[`tyme4ts`](https://github.com/6tail/tyme4ts)。

## 功能范围

| 模块     | 内容                                                                   |
| -------- | ---------------------------------------------------------------------- |
| 基础日历 | 公历、农历、星期、节气、传统节日、公历节日                             |
| 黄历     | 宜忌、建除十二神、神煞、二十八宿、胎神、五行、彭祖百忌、物候、数九三伏 |
| 附加信息 | 干支、生肖、星座、月相、纳音、小六壬、六曜、九星                       |
| 视图     | 月视图、日详情侧栏、年视图（12 个月缩略 + 节气表 + 假期表）、时间轴    |
| 工具     | 日期换算（公历↔农历↔回历↔藏历↔儒略日）、择日区间检索、八字排盘         |
| 外观     | 两套可切换主题（现代简约 / 中国传统）× 浅色深色 × 跟随系统             |
| 设置     | 独立设置界面：外观 / 显示 / 数据 / 作者信息 / 第三方许可 / 资产署名    |
| 交互     | 全键盘导航、可切换的快捷键说明、ARIA 网格语义、选中日期朗读            |

当前**不在**范围内：备忘录/日程、提醒、系统托盘、开机自启、云同步。打包仅支持
**Windows x64 免安装便携版**（`npm run package`），不生成安装程序。

## 环境要求

- Node.js `^20.19.0 || >=22.12.0`（开发机验证版本：`v24.14.0`）
- npm（开发机验证版本：`11.9.0`）
- Git（开发机验证版本：`2.50.1.windows.1`）

## 快速开始

```bash
npm install
npm run dev
```

> **首次运行的额外下载**：Electron 44 不再提供 `postinstall` 脚本，改为惰性安装 ——
> 第一次执行 `npm run dev`（或任何 `require('electron')`）时才会下载约 100 MB 的运行时到
> `node_modules/electron/dist`。若下载失败（网络受限），可手动执行
> `node node_modules/electron/install.js`；或先设置镜像
> `$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'` 再重试。

> 首次 clone 后如果 `vendor/tyme4ts` 是空的，执行：
> `git submodule update --init --depth 1`

## 常用脚本

| 命令                  | 说明                                                          |
| --------------------- | ------------------------------------------------------------- |
| `npm run dev`         | 启动 Electron 开发模式（主进程 / preload / 渲染进程均带 HMR） |
| `npm run build`       | 类型检查 + 构建生产产物到 `out/`（快速验证用）                |
| `npm run preview`     | 用构建产物启动应用                                            |
| `npm run package`     | 构建 + 打包为免安装便携版 exe，产物在 `release/`              |
| `npm run package:dir` | 只解包到 `release/win-unpacked`（更快，用于先验证再出单文件） |
| `npm run clean`       | 删除 `out/` `release/` `.tsbuild/`                            |
| `npm run typecheck`   | 主进程侧 + 渲染进程侧类型检查                                 |
| `npm run lint`        | ESLint                                                        |
| `npm run format`      | Prettier 格式化                                               |
| `npm test`            | Vitest 单测                                                   |
| `npm run test:watch`  | Vitest 监听模式                                               |

## 在 VS Code 里开发

仓库内置 `.vscode/tasks.json` 与 `.vscode/launch.json`，`Ctrl+Shift+P` → **Tasks: Run Task** 即可看到：

| Task                                              | 对应命令              | 用途                               |
| ------------------------------------------------- | --------------------- | ---------------------------------- |
| **dev**（默认构建任务）                           | `npm run dev`         | `Ctrl+Shift+B` 直接起开发模式      |
| **build**                                         | `npm run build`       | 快速验证生产产物                   |
| **package**                                       | `npm run package`     | 出便携版 exe 到 `release/`         |
| **package:dir**                                   | `npm run package:dir` | 只解包，快速验证打包配置           |
| **preview**                                       | `npm run preview`     | 跑构建产物                         |
| **clean**                                         | `npm run clean`       | 清理 `out/` `release/` `.tsbuild/` |
| **typecheck / lint / test / test:watch / format** | 同名脚本              | 日常检查                           |

`dev` 配了 problem matcher，以主进程打印的 `[tyme-app] main window ready` 作为就绪信号，因此
`launch.json` 里的调试配置可以拿它当 `preLaunchTask`：按 F5 会先起应用再挂调试器。

| 调试配置             | 说明                                                       |
| -------------------- | ---------------------------------------------------------- |
| 调试主进程（dev）    | 以 `--inspect=5858` 起开发模式并自动附加，可断点主进程代码 |
| 调试渲染进程（dev）  | 以 `--remoteDebuggingPort=9222` 起开发模式并自动附加       |
| 调试主进程（仅附加） | 应用已在运行时手动附加                                     |

渲染层也可以直接按 `F12` 打开 DevTools（开发模式下由 `@electron-toolkit/utils` 提供）。

### 打包注意事项

- **打包前先关掉正在运行的「万年历」**，否则 `release/win-unpacked` 被占用会报 `EBUSY`。
- **编辑器也可能锁住产物**：`.vscode/settings.json` 已把 `out/**`、`release/**`、`node_modules/**`、
  `.tsbuild/**`、`vendor/**` 加进 `files.watcherExclude` 与 `search.exclude`，避免 VS Code 的文件服务
  长期持有 `release/win-unpacked/resources/app.asar`。改动该配置之前若已被锁住，**重载一次 VS Code
  窗口**（`Developer: Reload Window`）即可释放。
- 清理产物用 `npm run clean`（或 VS Code 的 **clean** task），哪个目录被占用会明确报出来。
- 应用图标由 `electron-builder.yml` 的 `win.icon: assets/calendar.svg` 指定，electron-builder 会
  光栅化成多尺寸 `.ico` 写入 exe（已实测）。开发模式跑的是原版 `electron.exe`，而 Electron 的
  `nativeImage` 不支持 SVG，所以开发时任务栏仍是 Electron 默认图标。

## 键盘快捷键

应用内点「快捷键」按钮或按 `?` 可查看同一份说明。

| 按键              | 作用                        |
| ----------------- | --------------------------- |
| `←` / `→`         | 前一天 / 后一天             |
| `↑` / `↓`         | 前一周 / 后一周             |
| `PgUp` / `PgDn`   | 前一个月 / 后一个月         |
| `Shift + PgUp/Dn` | 前一年 / 后一年             |
| `T` 或 `Home`     | 回到今天                    |
| `Alt + 1…4`       | 切换月 / 年 / 时间轴 / 工具 |
| `?`               | 显示或隐藏快捷键说明        |
| `Esc`             | 关闭说明                    |

焦点在输入框内时，除 `Esc` 外的按键都交给输入框处理。

## 目录结构

```
src/
├─ main/        Electron 主进程：窗口、设置持久化、IPC handler
├─ preload/     通过 contextBridge 暴露 window.tyme
├─ shared/      主进程与渲染进程共用的 IPC 契约与类型
├─ core/        纯 TypeScript 历法内核（零 Electron / React / DOM 依赖）
└─ renderer/    React 界面：视图、组件、主题、hooks
tests/          读取源码树的架构契约测试（配色、主题 token 完整性）
scripts/        开发辅助脚本（clean.mjs 清理产物、capture-window.ps1 截图验证）
.vscode/        tasks.json / launch.json / settings.json（构建产物监听排除）
electron-builder.yml  便携版打包配置
vendor/tyme4ts/ 只读 git submodule，用于查阅 tyme4ts 源码
```

main 与 preload 的产物只 `require('electron')` 和 `node:` 内置模块（依赖已全部被 Vite 打进
bundle），因此打包时不需要任何运行时 `node_modules`。

### 模块边界（由 ESLint 强制）

1. `src/renderer/**` **只允许**从 `@core` 单一入口导入，**禁止**直接 `import 'tyme4ts'`
   或深入 `@core/*` 内部模块。
2. `src/core/**` 不得导入 Electron、React 或任何 DOM API。
3. `src/core` 对外暴露的全部是可序列化的普通对象（DTO），不泄露 tyme4ts 的类实例。
   core 的出口契约是「不可变」的：网格里的同一天在不同月份共享同一个对象。
4. `vendor/**` 被 tsconfig、ESLint、Prettier 全部忽略，不参与编译与检查。
5. 渲染层组件**禁止硬编码颜色**，只能使用语义化主题 token。

### 架构要点

- **`src/core` 是唯一接触 tyme4ts 的地方。** 它把引擎的类实例转换成 plain object DTO，
  因此这一层可以整体搬进 Web Worker 或主进程而无需改动调用方。
- **失败是返回值，不是异常。** `convert()` 与 `buildEightChar()` 返回
  `{ ok: false, error }`，工具页在用户输入过程中就地渲染错误。
- **引擎能力按天分档。** `DaySummary`（0.17 ms/天）服务月/年网格，
  `DayInfo`（1.6 ms/天）只在日详情与时间轴按需构建，都由 LRU 缓存记忆化。
- **选中日期是唯一真相。** 月、年、时间轴、键盘导航与侧栏全部由 `selected` 派生。

## 已知数据边界

历法计算全部来自 tyme4ts，以下边界已在代码中显式处理（见 `src/core/day.ts`、`src/core/month.ts`
与 `src/core/convert.ts`），不会以异常形式抛到界面上：

| 边界                | 行为                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 公历范围            | 仅支持 **1 – 9999 年**；超出范围的输入被 `isValidDateKey` 拒绝，UI 拦截或返回错误信息                                      |
| 1582 年改历         | **1582-10-05 – 1582-10-14 不存在**，日历会跳过这十天（10月4日直接接10月15日）                                              |
| 月网格越界          | 年首/年末的整周会溢出到 0 年或 10000 年，这些格子渲染为**空白占位**而非报错                                                |
| 法定假日数据        | tyme4ts 内置数据覆盖 **2001-12-29 – 2026-10-10**，超出该区间时 `holiday` 为 `null`，界面不显示「休/班」角标                |
| 年 1、年 2、年 9999 | tyme4ts 的 `getPhase` / `getNineStar` / `getSixtyCycleDay` / `getGods` 等会抛错，这些字段降级为 `null`，其余字段仍正常显示 |
| 藏历                | `RabByungDay` 仅支持 **1950–2050 饶迥年**，超出范围时换算结果里该字段为 `null` 并给出提示                                  |
| 八字排盘            | tyme4ts 无法在 1 年构造时刻，该情况下页面显示「超出历法可推算范围」而不是崩溃                                              |

`DayInfo` 中的 `null` 表示「该字段无法推导」，空数组表示「已推导且确实为空」，两者语义不同。

## 主题开发

主题由 CSS 自定义属性（design token）驱动，新增主题**无需改动任何业务组件**：

1. 在 `src/renderer/src/theme/themes/` 下新增一个定义文件，导出 `ThemeDefinition`
   （一个主题族必须同时提供浅色与深色 variant）；
2. 在 `src/renderer/src/theme/themes/index.ts` 中注册；
3. 在 `src/renderer/src/theme/tokens.css` 中为两个 variant 各添加一个
   `:root[data-theme='<id>']` 规则块。

`ThemeProvider` 只往 `<html>` 写 `data-theme`，其余全部由 CSS 决定；外观设置
（跟随系统/浅色/深色）负责在主题族内选 variant，未知的主题 id 会回退到默认族。

由 `tests/theme-tokens.test.ts` 强制的两条约束：

- 组件、feature、state、styles 目录下**不得出现** `#rrggbb` / `rgb()` 字面量；
- 每个声明的 variant 都必须有规则块，且必须定义同一套 `--color-*` / `--shadow-*` token。

## 测试

| 层次       | 位置                                     | 覆盖内容                                                            |
| ---------- | ---------------------------------------- | ------------------------------------------------------------------- |
| 引擎一致性 | `src/core/__tests__/tyme4ts-conformance` | 直接移植 `vendor/tyme4ts/test/**` 的断言，作为 DTO 字段映射是否正确 |
| 引擎单元   | `src/core/__tests__/*`                   | 日期步进、月/年网格、换算、检索、八字、术语表、性能预算             |
| 渲染层集成 | `src/renderer/src/__tests__/*`           | jsdom + 伪 preload bridge：视图切换、选日、主题、工具页、快捷键     |
| 架构契约   | `tests/theme-tokens.test.ts`             | 配色是否越界、主题 token 是否完整                                   |

`perf.test.ts` 用宽松上限（约实测值的 10 倍）守住数量级回退，例如网格单元不得退化成构建完整黄历。

## 许可

本仓库自身代码采用 **MIT 许可**，全文见 [`LICENSE`](LICENSE)。

### 第三方项目

许可证标识取自各自安装包内的 `package.json`，并非照抄文档；应用内「设置 → 第三方许可」展示同一份清单。

| 项目                    | 许可 | 用途                                                             |
| ----------------------- | ---- | ---------------------------------------------------------------- |
| [tyme4ts][tyme4ts]      | MIT  | 全部历法、节假日与黄历数据（公历/农历/藏历/回历/节气/宜忌/八字） |
| [Electron][electron]    | MIT  | 桌面应用运行时（Chromium + Node.js）                             |
| [React][react]          | MIT  | 界面渲染                                                         |
| [TanStack Virtual][tv]  | MIT  | 时间轴视图的虚拟滚动                                             |
| [electron-toolkit][etk] | MIT  | 主进程开发期辅助工具                                             |

[tyme4ts]: https://github.com/6tail/tyme4ts
[electron]: https://github.com/electron/electron
[react]: https://github.com/facebook/react
[tv]: https://github.com/TanStack/virtual
[etk]: https://github.com/alex8088/electron-toolkit

### 资产署名

| 资产             | 作者              | 来源                                                                                                  |
| ---------------- | ----------------- | ----------------------------------------------------------------------------------------------------- |
| 应用图标（日历） | paomedia (Arnaud) | [github.com/paomedia][icon-src]（`assets/calendar.svg`；同目录 `calendar-author.txt` 为原始署名信息） |

[icon-src]: https://github.com/paomedia

图标的具体授权条款以来源页面为准；该署名同时展示在应用内「设置 → 资产署名」。

> 打包时 electron-builder 会把 `assets/calendar.svg` 光栅化成多尺寸 `.ico` 写入 exe。
> 开发模式下运行的是原版 `electron.exe`，而 Electron 的 `nativeImage` 不支持 SVG，
> 因此**开发时任务栏显示的是 Electron 默认图标**，打包后才显示本图标。
