# tyme-app

一个运行在 Windows 上的桌面万年历程序，基于 **Electron + React + TypeScript**，历法数据全部来自
[`tyme4ts`](https://github.com/6tail/tyme4ts)。

## 功能范围

| 模块     | 内容                                                    |
| -------- | ------------------------------------------------------- |
| 基础日历 | 公历、农历、星期、节气、传统节日、公历节日              |
| 黄历     | 宜忌、建除十二神、神煞、二十八宿、胎神、五行、彭祖百忌  |
| 附加信息 | 干支、生肖、星座、月相、纳音                            |
| 视图     | 月视图、日详情、年视图、时间轴流式列表                  |
| 工具     | 日期换算器（公历↔农历↔干支↔藏历↔回历↔儒略日）、择日检索 |
| 排盘     | 八字：四柱、藏干、十神、大运流年                        |

当前**不在**范围内：备忘录/日程、提醒、系统托盘、开机自启、云同步、打包分发（后续阶段评估）。

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

## 目录结构

```
src/
├─ main/        Electron 主进程：窗口、菜单、设置持久化、IPC
├─ preload/     通过 contextBridge 暴露 window.tyme
├─ shared/      主进程与渲染进程共用的 IPC 契约与类型
├─ core/        纯 TypeScript 历法内核（零 Electron / DOM 依赖，可 100% 单测）
└─ renderer/    React 界面：视图、组件、主题
vendor/tyme4ts/ 只读 git submodule，用于查阅 tyme4ts 源码
```

### 模块边界（重要）

1. `src/renderer/**` **只允许**从 `@core` 导入，**禁止**直接 `import 'tyme4ts'`。
2. `src/core/**` 不得导入 Electron、React 或任何 DOM API。
3. `src/core` 对外暴露的全部是可序列化的普通对象（DTO），不泄露 tyme4ts 的类实例。
4. `vendor/**` 被 tsconfig、ESLint、Prettier 全部忽略，不参与编译与检查。
5. 渲染层组件**禁止硬编码颜色**，只能使用语义化主题 token。

## 已知数据边界

历法计算全部来自 tyme4ts，以下边界已在代码中显式处理（见 `src/core/day.ts` 与
`src/core/month.ts`），不会以异常形式抛到界面上：

| 边界                | 行为                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 公历范围            | 仅支持 **1 – 9999 年**；超出范围的输入被 `isValidDateKey` 拒绝并抛 `RangeError`，UI 负责拦截                               |
| 1582 年改历         | **1582-10-05 – 1582-10-14 不存在**，日历会跳过这十天（10月4日直接接10月15日）                                              |
| 月网格越界          | 年首/年末的整周会溢出到 0 年或 10000 年，这些格子渲染为**空白占位**而非报错                                                |
| 法定假日数据        | tyme4ts 内置数据覆盖 **2001-12-29 – 2026-10-10**，超出该区间时 `holiday` 为 `null`，界面不显示「休/班」角标                |
| 年 1、年 2、年 9999 | tyme4ts 的 `getPhase` / `getNineStar` / `getSixtyCycleDay` / `getGods` 等会抛错，这些字段降级为 `null`，其余字段仍正常显示 |
| 藏历                | `getRabByungDay` 在约 **1–8 年**与 **9992–9999 年**区间不可用，同样降级为 `null`                                           |

`DayInfo` 中的 `null` 表示「该字段无法推导」，空数组表示「已推导且确实为空」，两者语义不同。

## 主题开发

主题由 CSS 自定义属性（design token）驱动，新增主题无需改动任何业务组件：

1. 在 `src/renderer/src/theme/themes/` 下新增一个定义文件，导出 `ThemeDefinition`；
2. 在 `src/renderer/src/theme/themes/index.ts` 中注册；
3. 在 `src/renderer/src/theme/tokens.css` 中为该主题 id 添加 `:root[data-theme='<id>']` 规则块。

约束：组件只能引用语义 token（`--color-surface`、`--color-text`、`--color-festival` 等），
不得出现 `#rrggbb` / `rgb()` 字面量 —— 这一点由单测强制。

## 许可

见 `LICENSE`（待补）。历法算法与数据来自 MIT 许可的 [tyme4ts](https://github.com/6tail/tyme4ts)。
