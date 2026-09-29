# 万年历

[![CI](https://github.com/black067/tyme4ts-gui/actions/workflows/ci.yml/badge.svg)](https://github.com/black067/tyme4ts-gui/actions/workflows/ci.yml)
[![Release](https://github.com/black067/tyme4ts-gui/actions/workflows/release.yml/badge.svg)](https://github.com/black067/tyme4ts-gui/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

一个运行在 Windows 上的桌面万年历程序，基于 **Electron + React + TypeScript**，历法数据全部来自
[`tyme4ts`](https://github.com/6tail/tyme4ts)。

## 功能

| 模块     | 内容                                                                   |
| -------- | ---------------------------------------------------------------------- |
| 基础日历 | 公历、农历、星期、节气、传统节日、公历节日                             |
| 黄历     | 宜忌、建除十二神、神煞、二十八宿、胎神、五行、彭祖百忌、物候、数九三伏 |
| 附加信息 | 干支、生肖、星座、月相、纳音、小六壬、六曜、九星                       |
| 视图     | 月视图、日详情侧栏、年视图、时间轴                                     |
| 工具     | 日期换算（公历↔农历↔回历↔藏历↔儒略日）、择日区间检索、八字排盘         |
| 外观     | 两套主题（现代简约 / 中国传统）× 浅色深色 × 跟随系统                   |

功能与交互细节见 [docs/usage.md](docs/usage.md)。

## 快速开始

```bash
git clone --recurse-submodules https://github.com/black067/tyme4ts-gui.git
cd tyme4ts-gui
npm install
npm run dev
```

需要 Node.js `^20.19.0 || >=22.12.0`。已经 clone 过但 `vendor/tyme4ts` 是空的，执行
`git submodule update --init --depth 1` 补齐即可。

## 下载与打包

Windows x64 免安装便携版可以直接从 [Releases](https://github.com/black067/tyme4ts-gui/releases)
下载。自己构建：

```bash
npm run package   # → release/chinese-calendar-<version>-portable.exe
```

细节见 [docs/packaging.md](docs/packaging.md)。

## 文档

| 文档                                               | 内容                                     |
| -------------------------------------------------- | ---------------------------------------- |
| [docs/usage.md](docs/usage.md)                     | 视图、设置项、键盘快捷键                 |
| [docs/development.md](docs/development.md)         | 环境准备、脚本、VS Code 任务与调试、测试 |
| [docs/architecture.md](docs/architecture.md)       | 目录结构、模块边界、数据流               |
| [docs/packaging.md](docs/packaging.md)             | 打包细节、CI/CD 与发版流程               |
| [docs/theming.md](docs/theming.md)                 | 新增一个主题                             |
| [docs/data-boundaries.md](docs/data-boundaries.md) | tyme4ts 的能力边界与降级行为             |
| [docs/licensing.md](docs/licensing.md)             | 第三方许可清单与资产署名                 |

## 许可

本仓库自身代码采用 **MIT 许可**，全文见 [`LICENSE`](LICENSE)。

历法与节假日数据来自 [`tyme4ts`](https://github.com/6tail/tyme4ts)，桌面运行时为
[Electron](https://github.com/electron/electron)，界面用 [React](https://github.com/facebook/react)，
时间轴虚拟滚动用 [TanStack Virtual](https://github.com/TanStack/virtual)，主进程辅助用
[electron-toolkit](https://github.com/alex8088/electron-toolkit)：均为 MIT。应用图标来自
[paomedia](https://github.com/paomedia)，授权以来源页面为准。

完整清单与署名见 [docs/licensing.md](docs/licensing.md)，应用内「设置 → 第三方许可 / 资产署名」
展示同一份内容。
