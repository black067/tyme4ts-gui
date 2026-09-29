# 许可与署名

本仓库自身代码采用 **MIT 许可**，全文见 [`LICENSE`](../LICENSE)。

## 第三方项目

许可证标识取自各自安装包内的 `package.json`，并非照抄文档；应用内「设置 → 第三方许可」展示同一
份清单（源码在 `src/renderer/src/features/settings/third-party.ts`）。

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

## 资产署名

| 资产             | 作者              | 来源                                                                                                  |
| ---------------- | ----------------- | ----------------------------------------------------------------------------------------------------- |
| 应用图标（日历） | paomedia (Arnaud) | [github.com/paomedia][icon-src]（`assets/calendar.svg`；同目录 `calendar-author.txt` 为原始署名信息） |

[icon-src]: https://github.com/paomedia

图标的具体授权条款以来源页面为准；该署名同时展示在应用内「设置 → 资产署名」。

## 与打包的关系

打包时 electron-builder 会把 `assets/calendar.svg` 光栅化成多尺寸 `.ico` 写入 exe。开发模式下
运行的是原版 `electron.exe`，而 Electron 的 `nativeImage` 不支持 SVG，因此**开发时任务栏显示的
是 Electron 默认图标**，打包后才显示本图标。
