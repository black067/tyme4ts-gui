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
| 交互     | 全键盘导航、可切换的快捷键说明、ARIA 网格语义、选中日期朗读            |

当前**不在**范围内：备忘录/日程、提醒、系统托盘、开机自启、云同步、打包分发。

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

| 命令                 | 说明                                                          |
| -------------------- | ------------------------------------------------------------- |
| `npm run dev`        | 启动 Electron 开发模式（主进程 / preload / 渲染进程均带 HMR） |
| `npm run build`      | 类型检查 + 构建产物                                           |
| `npm run preview`    | 预览构建产物                                                  |
| `npm run typecheck`  | 主进程侧 + 渲染进程侧类型检查                                 |
| `npm run lint`       | ESLint                                                        |
| `npm run format`     | Prettier 格式化                                               |
| `npm test`           | Vitest 单测                                                   |
| `npm run test:watch` | Vitest 监听模式                                               |

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
scripts/        开发辅助脚本（capture-window.ps1：截取 Electron 窗口用于验证）
vendor/tyme4ts/ 只读 git submodule，用于查阅 tyme4ts 源码
```

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

见 `LICENSE`（待补）。历法算法与数据来自 MIT 许可的 [tyme4ts](https://github.com/6tail/tyme4ts)。
