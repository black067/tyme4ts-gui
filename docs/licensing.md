# 许可与署名

本仓库自身代码采用 **MIT 许可**，全文见 [`LICENSE`](../LICENSE)。

## 第三方项目

许可证标识取自各自安装包内的 `package.json`，并非照抄文档；应用内「设置 → 第三方许可」展示同一
份清单（源码在 `src/renderer/src/features/settings/third-party.ts`）。

| 项目                        | 许可                   | 用途                                                             |
| --------------------------- | ---------------------- | ---------------------------------------------------------------- |
| [tyme4ts][tyme4ts]          | MIT                    | 全部历法、节假日与黄历数据（公历/农历/藏历/回历/节气/宜忌/八字） |
| [chinese-days][chinesedays] | MIT                    | 在线更新的法定节假日数据（其 CI 抓取国务院公告，按年发布 JSON）  |
| [Tauri 2][tauri]            | MIT OR Apache-2.0      | 桌面宿主：窗口、单实例、文件/网络/外链权限（含三个官方插件）     |
| [WebView2][webview2]        | Microsoft 软件许可条款 | 渲染引擎与 JS 运行时（Edge 内核，系统自带或应用自行下载安装）    |
| [reqwest 等 crate][crates]  | MIT / Apache-2.0 / ISC | 宿主侧的流式下载、SHA-256、异步 IO、注册表读取                   |
| [React][react]              | MIT                    | 界面渲染                                                         |
| [TanStack Virtual][tv]      | MIT                    | 时间轴视图的虚拟滚动                                             |

[tyme4ts]: https://github.com/6tail/tyme4ts
[chinesedays]: https://github.com/vsme/chinese-days
[tauri]: https://github.com/tauri-apps/tauri
[webview2]: https://developer.microsoft.com/microsoft-edge/webview2/
[crates]: https://crates.io/
[react]: https://github.com/facebook/react
[tv]: https://github.com/TanStack/virtual

`chinese-days` 不是运行时依赖：应用只通过 HTTP 读取它发布的 JSON，所以它不出现在
`package.json` 里，但用户看到的是它的数据，因此照旧列在这里与「设置 → 第三方许可」中。
每份数据都记录了自己对应的 gov.cn 公告链接，并在设置页展示出来——源头始终可追溯。

Rust 侧的依赖只列直接依赖（`src-tauri/Cargo.toml`），完整清单与精确版本在
`src-tauri/Cargo.lock`；WebView2 是系统组件，不随 exe 分发，用户机器上没有时由应用
自己下载微软官方 bootstrapper 安装。

## 资产署名

| 资产             | 作者              | 来源                                                                                                  |
| ---------------- | ----------------- | ----------------------------------------------------------------------------------------------------- |
| 应用图标（日历） | paomedia (Arnaud) | [github.com/paomedia][icon-src]（`assets/calendar.svg`；同目录 `calendar-author.txt` 为原始署名信息） |

[icon-src]: https://github.com/paomedia

图标的具体授权条款以来源页面为准；该署名同时展示在应用内「设置 → 资产署名」。

## 词语释义的公版原文

术语释义的引文与校验文本取自**公有领域**的古籍，转录自维基文库：

| 典籍                   | 成书 | 状态                                       | 用途                     |
| ---------------------- | ---- | ------------------------------------------ | ------------------------ |
| 《钦定协纪辨方书》     | 1741 | 公有领域（作者逝世逾百年、1931 年前出版）  | 神煞、建除、二十八宿释义 |
| 《晋书·天文志》        | 648  | 公有领域（唐修，成书于 1931 年前）         | 昴毕觜井鬼五宿的释义     |
| [维基文库][wikisource] | —    | 仅作转录来源，正文本身属公有领域，无新版权 | 原文文本来源             |

[wikisource]: https://zh.wikisource.org/zh-hant/%E6%AC%BD%E5%AE%9A%E5%8D%94%E7%B4%80%E8%BE%A8%E6%96%B9%E6%9B%B8_(%E5%9B%9B%E5%BA%AB%E5%85%A8%E6%9B%B8%E6%9C%AC)

校验用的原文放在 `tests/fixtures/` 下（`xieji-bianfangshu/`、`jinshu-tianwenzhi/`），只在测试里
读取。数据来源、依据分档与已知缺口见 [glossary.md](glossary.md)。

## 与打包的关系

应用图标只有一个来源文件：`assets/calendar.svg`。`npm run icon`（`scripts/make-icon.mjs`）
先用 sharp 把它光栅化成 1024×1024 PNG，再交给 `tauri icon` 生成 `src-tauri/icons/` 下的
`.ico` 与几个 PNG；`tauri build` 只认这个目录里现成的文件，不会自己转 SVG。

因为开发与发布跑的是同一个 exe（都是本 crate 编译出来的 `chinese-calendar.exe`），
**开发模式下任务栏显示的就是本图标**——旧版跑的是原版 `electron.exe`，只有打包后才换图标。

改完 `assets/calendar.svg` 记得重跑 `npm run icon`，否则 exe 上还是旧图标。
