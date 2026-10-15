# 万年历

[![Release](https://github.com/black067/tyme4ts-gui/actions/workflows/release.yml/badge.svg)](https://github.com/black067/tyme4ts-gui/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

一个运行在 Windows 上的桌面万年历程序，基于 **Tauri 2 + React + TypeScript**，历法数据全部来自
[`tyme4ts`](https://github.com/6tail/tyme4ts)。界面与历法推算都跑在系统自带的 WebView2 里，
产物是一个免安装 exe（9.9 MB），启动时不解压、不留临时目录。

## 功能

| 模块     | 内容                                                                    |
| -------- | ----------------------------------------------------------------------- |
| 基础日历 | 公历、农历、星期、节气、传统节日、公历节日                              |
| 黄历     | 宜忌、建除十二神、神煞、二十八宿、胎神、五行、彭祖百忌、物候、数九三伏  |
| 附加信息 | 干支、生肖、星座、月相、纳音、小六壬、六曜、九星                        |
| 视图     | 月视图、日详情侧栏、年视图、时间轴                                      |
| 工具     | 日期换算（公历↔农历↔回历↔藏历↔儒略日）、择日区间检索、八字排盘          |
| 外观     | 两套主题（现代简约 / 中国传统）× 浅色深色 × 跟随系统                    |
| 语言     | 界面文案独立成层，可扩展新语言（目前只有简体中文）                      |
| 更新     | 从 GitHub Releases 检查新版本，自动下载并校验 SHA-256                   |
| 节假日   | 从国务院公告的公开数据源在线更新法定假日，补全引擎内置表的截止范围      |
| 交互     | 首帧骨架屏、全键盘导航、可切换的快捷键说明、ARIA 网格语义、选中日期朗读 |
| 释义     | 悬停/聚焦看白话释义，点击看出处（宜忌、神煞、建除、二十八宿、节气等）   |

功能与交互细节见 [docs/usage.md](docs/usage.md)。

## 快速开始

```bash
git clone --recurse-submodules https://github.com/black067/tyme4ts-gui.git
cd tyme4ts-gui
npm install
npm run dev
```

需要 Node.js `^20.19.0 || >=22.12.0` 与 Rust 稳定版（MSVC 工具链，含 C++ 生成工具）；
Windows 上的 WebView2 运行时通常已随系统装好。已经 clone 过但 `vendor/tyme4ts` 是空的，
执行 `git submodule update --init --depth 1` 补齐即可。第一次 `npm run dev` 会编译整个
Rust 依赖树，需要几分钟，之后都是增量。

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
| [docs/packaging.md](docs/packaging.md)             | 打包细节与 GitHub Actions 发版流程       |
| [docs/theming.md](docs/theming.md)                 | 新增一个主题                             |
| [docs/i18n.md](docs/i18n.md)                       | 文案层与新增一种语言                     |
| [docs/data-boundaries.md](docs/data-boundaries.md) | tyme4ts 的能力边界与降级行为             |
| [docs/licensing.md](docs/licensing.md)             | 第三方许可清单与资产署名                 |

## 许可

本仓库自身代码采用 **MIT 许可**，全文见 [`LICENSE`](LICENSE)。

历法与节假日数据来自 [`tyme4ts`](https://github.com/6tail/tyme4ts)，桌面宿主为
[Tauri 2](https://github.com/tauri-apps/tauri)（渲染引擎是系统自带的
[WebView2](https://developer.microsoft.com/microsoft-edge/webview2/)），界面用
[React](https://github.com/facebook/react)，时间轴虚拟滚动用
[TanStack Virtual](https://github.com/TanStack/virtual)：Tauri 与其余项目均为
MIT（Tauri 为 MIT 或 Apache-2.0 双许可，可任选）。应用图标来自
[paomedia](https://github.com/paomedia)，授权以来源页面为准。

完整清单与署名见 [docs/licensing.md](docs/licensing.md)，应用内「设置 → 第三方许可 / 资产署名」
展示同一份内容。
