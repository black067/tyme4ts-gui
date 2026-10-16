# 架构

## 目录结构

```
src/
├─ core/        纯 TypeScript 历法内核（零框架、零 DOM、零宿主依赖）
│  └─ glossary/ 术语释义：纯数据 + 查表，同样不依赖引擎
├─ shared/      跨层共用的契约与类型：window.tyme 的形状、命令名、事件名
├─ backend/     能力层：实现 window.tyme。跑在 webview 里，是唯一知道 Tauri 存在的地方
├─ renderer/    React 界面：视图、组件、主题、语言、hooks；index.html 带零脚本
│               依赖的首帧骨架屏，public/splash.js 在首帧前写入主题/语言/首启/是否要选位置
src-tauri/      Rust 宿主：窗口、单实例、更新下载、数据位置、WebView2 运行库
│  ├─ src/      lib.rs 装配 + splash.rs 首帧 + paths.rs 数据位置 + recycle.rs 回收站
│  │            + replace.rs 原地自换 + update.rs 下载 + webview.rs 运行库
│  ├─ capabilities/default.json  文件与网络的权限清单
│  ├─ tauri.conf.json            窗口默认值、devUrl、数据目录覆盖
│  └─ icons/                     由 scripts/make-icon.mjs 从 assets/calendar.svg 生成
tests/          读取源码树的架构契约测试（配色 / token、层边界与跨语言契约、术语释义、语言、骨架）
tests/fixtures/ 术语释义校验用的公版原文与其它测试数据（不进包）
scripts/        开发辅助脚本（clean / make-icon / package / 截图验证 / 术语抓取 / 语言基线）
docs/           本目录
.vscode/        tasks.json / launch.json / settings.json（构建产物监听排除）
.github/        Actions 工作流（见 packaging.md）
vendor/tyme4ts/ 只读 git submodule，用于查阅 tyme4ts 源码
```

`src-tauri/target/` 与 `src-tauri/gen/` 是 cargo 与 Tauri 的产物目录，不进版本库。

## 模块边界（由 ESLint 强制）

1. `src/renderer/**` **只允许**从 `@core` 单一入口导入，**禁止**直接 `import 'tyme4ts'`
   或深入 `@core/*` 内部模块；也**禁止**导入 `@backend/*` 与 `@tauri-apps/*`——界面只认
   `window.tyme`，能力从哪来与它无关。
2. `src/core/**` 不得导入 React、DOM、`@tauri-apps/*`、`node:*`，也不得反向依赖 renderer。
3. `src/core` 对外暴露的全部是可序列化的普通对象（DTO），不泄露 tyme4ts 的类实例。
   core 的出口契约是「不可变」的：网格里的同一天在不同月份共享同一个对象。
4. `src/shared/**` 只放契约与类型：不得导入 `@tauri-apps/*`、`node:*`、`@backend/*`。
5. `src/backend/**` 里**只有 `host.ts`** 允许 `import '@tauri-apps/*'`；其余模块通过它拿
   能力，这样"换宿主"这件事在代码里只有一个落点。例外是 `main.tsx`：它负责装配
   `window.tyme`，因此可以导入 `@backend`。
6. `vendor/**` 被 tsconfig、ESLint、Prettier 全部忽略，不参与编译与检查。
7. 渲染层组件**禁止硬编码颜色**，只能使用语义化主题 token（见 [theming.md](theming.md)）。
8. `src/core/glossary/**` 是**纯数据**：不 import tyme4ts，也不碰 React / DOM。
   引擎的权威名单由 `tests/glossary-contract.test.ts` 交叉校验。
9. `src/renderer/src/i18n/**` 是**唯一的文案来源**：渲染层不得再写死中文，由
   `tests/i18n-contract.test.ts` 按文件守住"只减不增"（见 [i18n.md](i18n.md)）。
10. `src/renderer/index.html` 的首帧骨架屏是 i18n 目录与 `tokens.css` 的**受契约
    副本**：文案逐字一致、颜色只许用既有 token 值、非 module 脚本只许
    `public/splash.js` 一个，由 `tests/splash-contract.test.ts` 守住（见
    [i18n.md](i18n.md)）。它存在的理由：窗口出现的第一帧必须已有内容，而那时
    React 与文案层还没起来。

第 1–5 条由 `eslint.config.mjs` 强制，违反时直接报错而不是警告；第 5 条与
`src-tauri` 的跨语言契约（命令名、事件名、权限范围、产物名）另由
`tests/host-boundary.test.ts` 守住——ESLint 看不见 Rust，那些名字只能靠读源码树对账。

## 架构要点

- **`src/core` 是唯一接触 tyme4ts 的地方。** 它把引擎的类实例转换成 plain object DTO，
  因此这一层与宿主、与 React 都无耦合。
- **失败是返回值，不是异常。** `convert()` 与 `buildEightChar()` 返回
  `{ ok: false, error }`，工具页在用户输入过程中就地渲染错误。
- **引擎能力按天分档。** `DaySummary`（0.17 ms/天）服务月/年网格，
  `DayInfo`（1.6 ms/天）只在日详情与时间轴按需构建，都由 LRU 缓存记忆化。
- **选中日期是唯一真相。** 月、年、时间轴、键盘导航与侧栏全部由 `selected` 派生。
- **Rust 不做业务判断。** 宿主只剩"窗口、进程、字节"三件事：建窗与显形、单实例、
  流式下载 + SHA-256 校验、拉起新版。哪个版本算新版、下载哪个文件、失败后界面显示什么，
  全在 TypeScript 里（`src/core/update.ts` + `src/backend/updater.ts`）。

## 数据流

```
tyme4ts ──▶ src/core（DTO + LRU 缓存）──▶ React 组件
                     ▲                          │
                     │ 仅 @core 单一入口         │ 文案取自 renderer/src/i18n
                     │                          ▼
                  （同一个 realm：webview）  src/backend ──window.tyme──┘
                                  ├─ @tauri-apps/plugin-fs     settings.json / holidays 缓存
                                  ├─ @tauri-apps/plugin-http   GitHub Releases 与节假日数据源
                                  ├─ @tauri-apps/plugin-opener 外链交给系统浏览器
                                  └─ invoke / listen  ──▶ Rust 宿主
                                                          ├─ download_update  流式下载 + sha256
                                                          ├─ cancel_update    置取消标志
                                                          ├─ delete_update    删已下载文件
                                                          ├─ install_update   原地替换自己并派等待者
                                                          └─ update_context   安装位置 / 刚从哪个版本来
```

`window.tyme` 的形状定义在 `src/shared/ipc.ts`（更新部分在 `src/shared/update.ts`，
节假日部分在 `src/shared/holidays.ts`，由 `ipc.ts` re-export）。因为能力层和界面层在
同一个 realm 里，这些文件只是类型与常量，没有序列化边界：`AppInfo`、`UpdateState`
这些对象直接就是 JS 值，不需要 structured-clone 兼容。

Rust 侧只有十二个命令和一个事件，名字在 `src/shared/ipc.ts` 的 `HOST_COMMAND` /
`HOST_EVENT` 里，`tests/host-boundary.test.ts` 会去 `src-tauri/src` 里逐个核对（命令分两个模块：
`update.rs` 管更新产物，`paths.rs` 管数据目录）：

| 名字                | 方向      | 作用                                                           |
| ------------------- | --------- | -------------------------------------------------------------- |
| `download_update`   | JS → Rust | 流式下载一个发布资产到数据目录，边下边算 SHA-256               |
| `cancel_update`     | JS → Rust | 让正在下载的 `download_update` 停下来并返回 `cancelled`        |
| `delete_update`     | JS → Rust | 删掉已下载的文件（文件名先过白名单，只能碰数据目录）           |
| `install_update`    | JS → Rust | 把新字节换到正在运行的 exe 上，派等待者重启，然后退出本进程    |
| `update_context`    | JS → Rust | 安装位置，以及本次启动来自哪个版本                             |
| `reveal_data_dir`   | JS → Rust | 把当前数据目录在系统文件管理器里打开                           |
| `inspect_data_dir`  | JS → Rust | 报一个候选目录的事实：空不空、有没有标记、写不写得进去         |
| `set_data_dir`      | JS → Rust | 把数据搬到新目录：先复制并逐个核对，写了指针才删旧文件         |
| `setup_plan`        | JS → Rust | 首启那一屏的原料：两个固定位置的完整路径、有没有数据、能不能写 |
| `choose_data_dir`   | JS → Rust | 记下用户选的位置并建出目录——**全仓库唯一建用户目录的地方**     |
| `delete_data_dir`   | JS → Rust | 把整份用户数据移进回收站，并清掉指针                           |
| `relaunch`          | JS → Rust | 让同一个 exe 重起来一次，好让刚定下来的指向生效                |
| `update://progress` | Rust → JS | 下载进度（字节数与速率），80 ms 节流                           |

`reveal_data_dir` / `inspect_data_dir` / `set_data_dir` / `choose_data_dir` 同样遵循"TS 判断、
Rust 报事实"：`inspect_data_dir` 不回答"能不能搬"，取舍在 `src/backend/data-dir.ts`。

**改完之后一定要重起来一次。** `$APPDATA` 这个变量在插件初始化（早于任何 `setup` 钩子）时就被
解析完了，而命令能碰到的一切都在那之后——"当场生效"唯一的办法是让同一个 exe 重新起来。所以选定
位置、搬运、删除三条链路后面都跟着 `relaunch`：界面说"正在重启"而不是"好了"。重启用的是与
`install_update` 同一个隐藏等待者（`src-tauri/src/replace.rs` 的 `relaunch`），不用
`tauri::process::restart()`——那个 API 会先建新进程，而它会被单实例互斥体挡在外面，结果是应用
关了再没打开。调试版按规矩不自动重启（那个 exe 连的是 dev 服务器），于是 `relaunch` 回 `dev`
一个码，`src/backend/data-dir.ts` 把它收成 `manual`：位置已经记下，自己重开一次就生效。

`install_update` 是这五个里唯一一个「判断成分为零、操作系统语义占满」的命令，所以它整个待在
宿主里（`src-tauri/src/replace.rs`）：Windows 不允许覆盖正在运行的映像但允许改名，而新实例必须
等旧进程结束之后才允许启动——`tauri-plugin-single-instance` 的互斥体只按 `identifier` 命名，
不含版本号。形状因此是「旧进程换字节 + 同一个 exe 的隐藏等待者负责重启」。为什么非得这样、
以及它踩过什么坑（应用关了再没打开、用户找不到下载的新版本），写在 `docs/packaging.md`
的「便携版怎么把自己换掉」。

文件与网络的可达范围由 `src-tauri/capabilities/default.json` 决定：文件只允许
`$APPDATA/**`（读写、建目录、改名），网络只允许 `api.github.com`、`cdn.jsdelivr.net`、
`unpkg.com` 三个域，外链只允许 `https`。这十二个命令是 `invoke` 的自定义命令，
不需要出现在能力清单里；`update://progress` 由宿主发出，同样发给 `main` 窗口。
唯一为"挑一个文件夹"新增的权限是 `dialog:allow-open`——它不授予任何路径，只是让用户自己
选一个文件夹（`tests/host-boundary.test.ts` 钉着"它不许带 scope"）。首启那一屏与设置里的
「修改」用的是同一个窗口、同一份能力，所以能力清单里的 `windows` 始终是 `["main"]`。

## 首帧与窗口生命周期

窗口在 `tauri.conf.json` 里声明但 `create: false`、`visible: false`：真正建窗的是
`src-tauri/src/lib.rs`，因为只有它能先读 `<数据目录>\settings.json` 决定主题与底色。

0. 在读设置之前，`paths::apply_override(context.config_mut())` 先看一眼盘上有没有用户目录，
   回一个 `StartupPlan`：`Adopted`（沿用现有的，包括指针指过去的）或 `NeedsChoice`。启动**不建
   目录**——没有目录时该问一句，而不是替用户决定。这一条是整个首帧流程的分叉点。
1. `splash::build(&handle, choosing)` 读设置，得出「主题 id-深浅色 / 语言 / 是否首启 / 是否要
   选位置」，拼成一段 `window.__TAYME_SPLASH__ = {...}` 的初始化脚本，并算出窗口底色（与骨架屏
   同一个 `--color-bg`，见 `tests/splash-contract.test.ts` 里两侧规则的对账）。目录不存在时读不到
   设置，那一路走默认主题与默认语言——骨架屏要能画，不代表它得猜出一个数据目录来。
2. `WebviewWindowBuilder::from_config()` 复用配置里的窗口参数，加上
   `background_color`、`theme`、`initialization_script`。这一步让窗口出现的第一帧就是
   正确底色，`public/splash.js` 则在 React 起来之前画出骨架屏。要选位置时窗口换成 560×520
   的小尺寸（`visible:false` 之前设好，没有尺寸从大到小跳一下的过程），而骨架屏整个不显示：
   `setup:true` 时 `splash.js` 在 `<html>` 上落 `data-setup`，`index.html` 里
   `html[data-setup] #splash { display: none; }` 那条规则把它藏掉——那一屏不该先闪一张"日历
   正在准备"的假画。
3. `on_page_load(Finished)` 里 `show()`；另有 2500 ms 看门狗兜底，页面加载失败也不会
   留一个永远不出现的窗口。`show()` 用 `AtomicBool` 保证只执行一次。
4. `on_document_title_changed` 把 `document.title` 同步到原生标题栏，界面层照常
   `useEffect` 设标题即可（含版本号），不需要额外的命令。

渲染层按 `__TAYME_SPLASH__.setup` 分叉成两棵树（`src/renderer/src/main.tsx`）：日历走
`startBackend()` + `<App />`，选位置走 `startSetupBackend()` + `<SetupApp />`。后者只装桥，
不读设置、不排定时器、不碰节假日缓存——那一刻还没有能读的目录，读它就是去建一个。它也不带
`SettingsProvider`，所以语言与文案那一层用的是 `StaticLocaleProvider`。

## 数据位置

`app.appDirectoriesOverride.data = "$DATA/万年历"` 把应用数据目录默认钉在
`%APPDATA%\万年历`，与 Electron 时代逐字相同：老用户的 `settings.json` 与
`holidays/*.json` 原地可读，`tests/host-boundary.test.ts` 也钉着这一条。
WebView2 自己的缓存与 cookie 落在 `%LOCALAPPDATA%\com.tyme.desktop\`，那部分不是用户数据。

用户可以选一个位置（首启那一屏），也可以搬走或删掉（设置里的「数据目录」那一行，
`src-tauri/src/paths.rs`）。这条链路的六个决定：

- **启动不建目录。** 建目录的代码就在手边，`app_data_dir()` 顺手一调就把 `%APPDATA%\万年历`
  造出来了，而用户还没说他要放哪儿。唯一会建用户目录的是 `choose_data_dir`——因为那一下是他按的。
  搬运的落点与 `reveal_data_dir` 也建目录，但那些同样是用户点出来的。
- **指针不能存在数据目录里。** 它记的内容就是"数据目录在哪"，而那个目录正是等着被搬走的东西。
  锚点因此是 `%APPDATA%\com.tyme.desktop\location.json`——按 `identifier` 取名，与 WebView2
  的缓存同层但不同目录；启动时 `paths::apply_override()` 在 `Builder::default()` 之前把它
  读进 `config_mut()`。锚点目录自己可以被建出来：那不是用户数据。
- **选中的位置也记在同一个指针里**，所以第二次启动不问第二遍：`Adopted` 之后一切照旧。反过来，
  指针指着一个不在了的位置（U 盘被拔走）时，`NeedsChoice{RecordedMissing}` 带着那条路径去问，
  首启那一屏把它原样填在"自定义"里——插回盘就能按确定，不用重找一遍。
- **权限不用放宽，也正因为如此要挑一个专属目录。** 能力清单里的 `$APPDATA/**` 是照着最终的
  override 解析的：改指向，范围自己跟过去。反过来，用户随手指一个混着别的东西的文件夹，就等于
  把整个文件夹交给 webview 读写——所以非空、又没有本应用标记的目录一律拒绝。
- **每个本应用持有的目录留一个 `.tyme-data-dir` 标记**，搬走之后旧目录也留着它，于是"再指回去"
  时那个空壳仍然认得出是自己人。老目录没有标记文件，那份 `settings.json` 是第二份证据。
- **顺序是先复制、逐个核对、写指针，最后才删旧文件。** 任何一步失败最多退化成"两边各有一份"，
  不会出现"旧删了、新的没成"。`updates/` 里的下载产物不算数据：可再生的东西不占搬运的体积。
- **删除是移到回收站，不是就地删掉**（`src-tauri/src/recycle.rs`：`SHFileOperationW` +
  `FOF_ALLOWUNDO`）。U 盘、网络盘上没有回收站，那一次会被拒（`no-recycle-bin`）而不是悄悄
  销毁——宁可让用户先把程序挪到本机硬盘，也不做一件收不回来的事。删完指针一起清掉，于是重启
  之后回到选位置那一屏。

搬完、选完、删完都要重起来一次才能生效，原因见上面「十二个命令」那一段：`$APPDATA` 在插件
初始化时就解析完了。界面上因此说"正在重启"，而调试版说"重启后生效"。
