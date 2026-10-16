# 开发

## 环境要求

- Node.js `^20.19.0 || >=22.12.0`（开发机验证版本：`v24.14.0`）
- npm（开发机验证版本：`11.9.0`）
- Git（开发机验证版本：`2.50.1.windows.1`）
- Rust 稳定版 GNU/MSVC 工具链（开发机验证版本：`cargo 1.98.0`，`stable-msvc`）
- Microsoft C++ 生成工具（VS 2022/2026 的「使用 C++ 的桌面开发」工作负载）：链接
  `webview2loader.lib` 之类不需要它，但 `ring` 一类的 C 依赖需要；本机是 MSVC 14.51.36231
- WebView2 运行时：Win11 与近年的 Win10 已随系统装好；没有的话应用会自己下载官方
  bootstrapper 并静默安装（见 [packaging.md](packaging.md)）

## 首次准备

```bash
npm install
npm run dev      # 第一次会编译整个 Rust 依赖树，几分钟量级
```

> 与 Electron 时代的最大差别：没有"首次运行才下载的 120 MB 运行时"。Node 侧装完就能跑，
> 慢的那一次是 cargo 首次编译，之后都是增量。

> 首次 clone 后如果 `vendor/tyme4ts` 是空的，执行：
> `git submodule update --init --depth 1`

## 常用脚本

| 命令                        | 说明                                                                            |
| --------------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`               | Tauri 开发模式：起 Vite + 编译并启动 Rust 宿主，前端改动热更新，改 Rust 重编译  |
| `npm run dev:web`           | 只起 Vite（在浏览器里看界面；涉及宿主能力的部分因为没有 `window.tyme` 不工作）  |
| `npm run build`             | 类型检查 + 构建前端到 `dist/`（快速验证用，不产出 exe）                         |
| `npm run package`           | 构建并产出免安装便携版 exe 到 `release/`（`--no-build` 只从已有产物复制）       |
| `npm run icon`              | 从 `assets/calendar.svg` 重新生成 `src-tauri/icons/`（需要网络装 sharp 时同理） |
| `npm run clean`             | 删除 `dist/` `release/` `.tsbuild/`；`node scripts/clean.mjs host` 再清 Rust    |
| `npm run typecheck`         | Node 侧 + webview 侧类型检查                                                    |
| `npm run lint`              | ESLint                                                                          |
| `npm run format`            | Prettier 格式化（会改写文件）                                                   |
| `npm run format:check`      | Prettier 只检查不修改（提交前跑一次，免得格式问题混进提交）                     |
| `npm test`                  | Vitest 单测                                                                     |
| `npm run test:watch`        | Vitest 监听模式                                                                 |
| `npm run release:patch`     | 出正式版本：升版本号 + 提交 + 打标签 + 推送（见 [packaging.md](packaging.md)）  |
| `scripts/glossary/*.mjs`    | 术语释义的原文抓取与抽取工具，需要网络，用法见 [glossary.md](glossary.md)       |
| `scripts/i18n/cjk-scan.mjs` | 统计渲染层里硬编码中文的行数，`--update` 重建基线，见 [i18n.md](i18n.md)        |

Rust 侧另有两条常用命令：

```bash
cd src-tauri && cargo fmt            # 格式化宿主代码（CI 会跑 --check）
cd src-tauri && cargo check --all-targets
```

> **dev 与便携版共用同一个 WebView2 用户数据目录**（`%LOCALAPPDATA%\com.tyme.desktop\EBWebView`，
> 位置由 `identifier` 决定）。同一时刻只开一个：两个都在，后起的那个会在创建 webview 时失败。
> 强杀进程（任务管理器、`Stop-Process -Force`）也可能留下占着这个目录的 `msedgewebview2.exe`
> 子进程，下一次启动就报"请求的资源在使用中"——等它退出或手动结束即可，正常关窗口不会有这问题。
>
> 在受限环境里（沙箱、CI、某些作业对象）新编译的 debug 版可能起不来，报 `拒绝访问 (os error 5)`：
> WebView2 要在 `%LOCALAPPDATA%` 下建目录并拉起浏览器进程，这类写入被拦时就是这一个样子。
> 宿主起不来时会把要用的缓存目录一并打出来（对话框 + stderr），照着判断是被权限挡了还是有别的实例。
> 这种环境下验证界面请改用 `npm run package` 出来的 exe。

## 在 VS Code 里开发

仓库内置 `.vscode/tasks.json` 与 `.vscode/launch.json`，`Ctrl+Shift+P` → **Tasks: Run Task** 即可看到：

| Task                                              | 对应命令                  | 用途                                     |
| ------------------------------------------------- | ------------------------- | ---------------------------------------- |
| **dev**（默认构建任务）                           | `npm run dev`             | `Ctrl+Shift+B` 直接起开发模式            |
| **dev:webview**                                   | `npm run dev` + 9222 端口 | 给前端调试配置用（见下）                 |
| **dev:web**                                       | `npm run dev:web`         | 只起 Vite                                |
| **build**                                         | `npm run build`           | 快速验证前端产物                         |
| **package**                                       | `npm run package`         | 出便携版 exe 到 `release/`               |
| **build:host:debug / host:debug:prepare**         | `cargo build`（+ Vite）   | 宿主调试用：编译 debug exe 并备好 devUrl |
| **clean**                                         | `npm run clean`           | 清理 `dist/` `release/` `.tsbuild/`      |
| **typecheck / lint / test / test:watch / format** | 同名脚本                  | 日常检查                                 |
| **format:check**                                  | `npm run format:check`    | 提交前确认格式没问题                     |

`dev` 与 `dev:webview` 配了 problem matcher，以宿主打印的
`[tyme-app] main window ready` 作为就绪信号，因此 `launch.json` 里的调试配置可以拿它当
`preLaunchTask`：按 F5 会先起应用再挂调试器。

| 调试配置                   | 说明                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| 调试界面（WebView2）       | 用 Chrome 调试器附加到 9222；端口由 `dev:webview` 通过 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` 打开 |
| 调试宿主（Rust）           | `cppvsdbg` 启动 debug 版 exe（`preLaunchTask` 先 cargo 再起 Vite），可断点 Rust 代码                |
| 调试界面（仅附加，不启动） | 应用（或 `dev:webview`）已经在跑时手动附加                                                          |

装的是 CodeLLDB 的话，把宿主调试配置的 `type` 换成 `lldb` 即可，`program` 路径不变。

渲染层也可以直接按 `F12` 打开 DevTools：开发模式的窗口默认开着，不需要额外参数。

## 测试

| 层次       | 位置                                                                                        | 覆盖内容                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 引擎一致性 | `src/core/__tests__/tyme4ts-conformance`                                                    | 直接移植 `vendor/tyme4ts/test/**` 的断言，作为 DTO 字段映射是否正确                                                                  |
| 引擎单元   | `src/core/__tests__/*`                                                                      | 日期步进、月/年网格、换算、检索、八字、术语表、性能预算                                                                              |
| 渲染层集成 | `src/renderer/src/__tests__/*`                                                              | jsdom + 伪 `window.tyme`：视图切换、选日、主题、工具页、快捷键；操作结果落在 toast 上而不是常驻段落                                  |
| 首启与提示 | `src/renderer/src/features/setup/*`、`src/renderer/src/components/__tests__/toast.test.tsx` | 选位置那一屏（路径看得见、不读设置、拒绝理由写在旁边）与那层提示本身（去重、最多三条、各自消失的时刻）                               |
| 架构契约   | `tests/theme-tokens.test.ts`                                                                | 配色是否越界、主题 token 是否完整                                                                                                    |
| 宿主契约   | `tests/host-boundary.test.ts`                                                               | 分层禁令、命令/事件/参数名跨语言对账、`tauri.conf.json` 不变式、能力清单范围、产物名与更新器正则同源、打出的 bundle 不留裸 `require` |
| 后端状态机 | `src/backend/__tests__/*`                                                                   | 装不上必须留下可见后果：失败码分得开、重试不必重下一遍、只有摘要不符才丢掉那份字节（`updater-install.test.ts`）                      |
| 释义契约   | `tests/glossary-contract.test.ts`                                                           | 词条的 key 都在引擎表里、引文逐字可查、缺口显式                                                                                      |
| 文案契约   | `tests/i18n-contract.test.ts`                                                               | 各语言目录的键对齐、渲染层硬编码中文只减不增                                                                                         |
| 骨架契约   | `tests/splash-contract.test.ts`                                                             | 首帧骨架的文案与目录逐字一致、配色全在 tokens 里、Rust 侧注入规则与 TS 规范同源                                                      |

`perf.test.ts` 用宽松上限（约实测值的 10 倍）守住数量级回退，例如网格单元不得退化成构建完整黄历。

渲染层测试通过在文件顶部加 `// @vitest-environment jsdom` 单独选择 DOM 环境，`vitest.config.ts`
的默认环境仍是 `node`（core 测试不需要 DOM，跑得更快）。

`tests/host-boundary.test.ts` 里那组「打出的 bundle」检查会读 `dist/`，缺产物时自己跑一次
`npx vite build`；平时先 `npm run build` 再 `npm test`，能省掉这十几秒。

## 自更新只能手动冒烟

原地替换跑在**产物**上：它换的是 `current_exe()`，而调试版里那是 `target\debug\` 下的开发二进制，
那道闸门默认就把它拒绝掉了（`TYME_ALLOW_DEV_IN_PLACE_UPDATE=1` 可以强开，见 `docs/packaging.md`）。
单元测试覆盖判断与失败清理，覆盖不了"进程没了、过了一会儿新版自己起来了"这一段。

发版前值得跑一遍的三个观察点：

1. 把 `release\chinese-calendar-<旧版>-portable.exe` 放在一个**可写**目录里，启动它，
   设置 → 更新 → 下载 → 重启并安装。对了的表现是：应用关掉，几秒钟后**自己再打开**，
   界面上出现「已从 v<旧版> 更新到 v<新版>」；文件名还是原来那个，内容已经是新版。
2. 换一个**不可写**的位置（就地设只读，或放进写保护的 U 盘）再点安装：应用不该消失，
   界面上应是「当前所在位置无法写入」，而不是按下按钮之后窗口一关、再无下文。
3. 装完到 exe 所在目录看一眼：不该留下 `*.old.exe` 或 `*.exe.new`；`%APPDATA%\万年历\updates\`
   里那一份也已经删掉。有残留说明等待者没跑完，回到第 1 步的现象去查。

## 选位置、搬家、删除也只能手动冒烟

同一道闸门也管着数据位置那三条链路：调试版里 `relaunch` 默认拒绝自动重启，界面因此说的是
「位置已经记下，重启后生效」而不是「正在重启」。要在 `npm run tauri dev` 里走完整条链路，
先设 `TYME_ALLOW_DEV_RELAUNCH=1`（它只放开重启这一段，位置与权限的判断照旧）。

发版前值得跑一遍的四个观察点：

1. **第一次启动问一句。** 把 `%APPDATA%\万年历` 临时改名，再删掉
   `%APPDATA%\com.tyme.desktop\location.json`，启动产物。对了的表现是：出现一个 560×520 的小窗，
   两个固定位置旁边印着完整路径，而**没有**先闪一下日历骨架屏。选「用户目录」按确定，应用自己
   重起来一次，第二次启动直接进日历、不再问。
2. **启动不该建目录。** 上面那一步按确定之前，`%APPDATA%\万年历` 不该已经被造出来——这条只能
   用眼睛查，因为它是"什么都不发生"。同样，指针目录
   （`%APPDATA%\com.tyme.desktop\`）会先被建出来放 `location.json`，那不是用户数据。
3. **搬家与删除各自重起来一次。** 设置 → 关于 → 数据目录：搬到别处之后旧目录里只剩 `updates\`
   那类可再生的东西（界面上会说还剩几个文件）；点「删除」要按两下，八秒内不按第二下就作废。
   删完之后重启，应该回到选位置那一屏，回收站里能找到那个目录。
4. **U 盘拔走的那一次。** 选「可执行文件所在目录」，把整个文件夹拷到 U 盘、启动一次、拔掉，
   再从本机启动：这一次是选位置那一屏，而"自定义"里已经填着 U 盘那个路径——把盘插回去直接按
   确定就行，不该让人重新找一遍。
