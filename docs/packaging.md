# 打包与发布

## 产物形态

产出 **Windows x64 免安装便携版单文件 exe**：

```
release/chinese-calendar-<version>-portable.exe     # 0.1.4 实测 9.9 MB
```

文件名模板来自 `scripts/package.mjs` 的 `artifactName()`，刻意用 ASCII：中文文件名上传到
GitHub Release 后汉字会丢，变成 `-0.1.1-portable.exe`。给人看的名字（「万年历」）是
`tauri.conf.json` 的 `productName`，它进窗口标题与 exe 资源元数据，与文件名无关。
`tests/host-boundary.test.ts` 拿这个模板去核对 `src/core/update.ts` 的
`PORTABLE_ASSET_PATTERN`，两边不会各说各话。

双击即用；设置写在 `%APPDATA%\万年历\settings.json`。

它是**真正的单文件**：前端资源由 `tauri build` 在编译期嵌进二进制（`frontendDist: ../dist`），
运行时不解压、不在 `%TEMP%` 留任何东西，同级也不需要 dll。旧版是 electron-builder 的
portable 自解压包——exe 95.5 MB，启动时先把约 246 MB 解到临时目录再运行，首帧慢就慢在这里。

WebView2 运行时由系统提供（Win11 与近年的 Win10 已自带）。缺的时候应用在启动前自己下载
微软官方 bootstrapper 并静默安装，装不上才提示并退出——见 `src-tauri/src/webview.rs`。
这一步没有走 `bundle.windows.webviewInstallMode`：那个选项只在**打安装器**时生效，
而我们不出安装器。

## 本地打包

```bash
npm run package                  # 类型检查 + Vite 构建 + cargo release 构建 + 复制到 release/
npm run package -- --no-build    # 只从 src-tauri/target/release 复制（迭代产物名时用）
npm run clean                    # 清理 dist/ release/ .tsbuild/
node scripts/clean.mjs host      # 再清掉 src-tauri/target（几个 GB，重新编译要几分钟）
npm run icon                     # 从 assets/calendar.svg 重新生成 src-tauri/icons/
```

`package` 会先跑 `tauri.conf.json` 里的 `beforeBuildCommand`（即 `npm run build`，含类型检查），
所以打包失败通常是类型错误，而不是构建配置的问题。

### 打包注意事项

- **打包前先关掉正在运行的「万年历」**：Windows 不允许替换正在运行的映像，`release/` 里的
  旧产物会被占用。`scripts/package.mjs` 因此先把同名旧文件改名再删，删不掉也不影响新产物。
- **编辑器也可能锁住产物**：`.vscode/settings.json` 已把 `src-tauri/target/**`、`release/**`、
  `dist/**`、`node_modules/**`、`.tsbuild/**`、`vendor/**` 加进 `files.watcherExclude` 与
  `search.exclude`，避免 VS Code 的文件服务长期持有这些目录。改动该配置之前若已被锁住，
  **重载一次 VS Code 窗口**（`Developer: Reload Window`）即可释放。
- **图标不是手画的**：`assets/calendar.svg` 由 `scripts/make-icon.mjs` 用 sharp 光栅化成
  1024×1024 PNG，再交给 `tauri icon` 生成 `.ico` 与几个 PNG；脚本随后删掉用不到的
  android / ios / `.icns` / 商店磁贴。`tauri build` 只认 `src-tauri/icons/` 里现成的文件，
  不会自己转 SVG——这与 electron-builder 直接吃 SVG 的行为不同。
- **改 `productName` 不再改数据目录**：数据目录由 `tauri.conf.json` 里
  `app.appDirectoriesOverride.data = "$DATA/万年历"` 钉死，与产品名解耦；改显示名不会让老用户
  的设置"消失"。反过来，改 `identifier` 会挪动 WebView2 的缓存目录
  （`%LOCALAPPDATA%\<identifier>\`），那里面只有缓存，没有用户数据。

### 配置要点

`src-tauri/tauri.conf.json` 里几处不显眼但重要的设置：

| 设置                              | 原因                                                                        |
| --------------------------------- | --------------------------------------------------------------------------- |
| `windows[0].create: false`        | 窗口由 Rust 现建，才能先读设置决定主题与底色（骨架屏的前提）                |
| `windows[0].visible: false`       | 同上：页面加载完成（或 2500 ms 看门狗到点）才显形，不留白窗                 |
| `windows[0].backgroundColor`      | 与骨架屏的 `--color-bg` 同源，由 `tests/host-boundary.test.ts` 核对         |
| `appDirectoriesOverride.data`     | 把数据目录保持在 `%APPDATA%\万年历`，老用户的设置与节假日缓存原地可用       |
| `security.csp: null`              | CSP 只写在 `src/renderer/index.html` 的 meta 里，配置再注入一份就是两个真相 |
| `security.freezePrototype: false` | `tyme4ts` 与部分序列化路径依赖原型链，冻结会让界面直接报错                  |
| `bundle.active: false`            | 只发裸 exe，不出安装包；产物名由 `scripts/package.mjs` 决定                 |
| `version: "../package.json"`      | 版本号只有 `package.json` 一处真相                                          |

**依赖全部打进二进制，没有运行时 `node_modules`。** 这条约束从 Electron 时代继承下来，
但检查的位置变了：Vite 会把 `dependencies` 打进 `dist/`，`tauri build` 再把 `dist/` 嵌进 exe，
所以只要有人从 `dependencies` 里 import 了带 Node API 的包，产物会在运行时炸。
`tests/host-boundary.test.ts` 因此直接查**构建产物** `dist/assets/*.js`：里面不得出现
`require('…')`，也不得出现 `'node:…'` 这样的模块路径。`dist/` 不存在时它会自己跑一次
`npx vite build`，而不是静默跳过——读起来像通过的检查比没有更糟。

## GitHub Actions

只有一个工作流 `release.yml`，跑在 `windows-latest` 上（应用只面向 Windows，直接和目标平台
保持一致）。

### `release.yml` — 出包与发版

唯一触发方式是 push 一个 `v*` tag：静态检查（typecheck / lint / format:check / 单测 +
`cargo fmt --check` / `cargo check`）→ 校验 tag 与版本一致 → 打包 → 上传 workflow artifact →
创建 GitHub Release 并附上 exe。没有第二条能创建 Release 的路径，所以不会出现同一个版本被发两次。

缓存 `%LOCALAPPDATA%` 下的 cargo `registry` 与 `index`（下载的 crate 与索引），命中后省掉
几分钟的解析与下载。**不缓存 `src-tauri/target/`**：增量构建的失效条件（features、profile、
依赖版本、runner 上的 MSVC 版本）在 Windows 上很难对齐，缓存错一次的代价比重新编译一次大。

Release 建成 **draft**：流程跑完后到 Releases 页面确认 exe 能跑，再点 **Publish** 转正。
同一个 tag 被重复推送时会走 `gh release upload --clobber` 覆盖资产，不会报「已存在」。

创建 Release 用的是 runner 自带的 `gh` CLI（`GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`），没有引入
任何第三方 Action：`actions/checkout`、`actions/setup-node`、`actions/cache`、
`actions/upload-artifact` 与 `dtolnay/rust-toolchain` 是全部的外部依赖。

## 应用内检查更新

判断逻辑在 `src/core/update.ts`（纯函数），编排与状态在 `src/backend/updater.ts`（跑在
webview 里），Rust 只干一件事：`download_update` 把字节流写进文件并顺手算 SHA-256。

**没有用 `tauri-plugin-updater`**：它要求发布方用自己的私钥给每个包签名，验签失败就不装。
本应用的发布资产是 GitHub Release 上的裸 exe，没有签名环节；而资产自带的 `digest` 已经
提供了 SHA-256，用它校验既够强又不需要保管任何私钥。

流程：

1. `check()` → `GET https://api.github.com/repos/black067/tyme4ts-gui/releases`（走
   `@tauri-apps/plugin-http`，权限由 `capabilities/default.json` 放行）；
2. `parseReleases` 把响应当**不可信输入**校验，`selectLatestPortableRelease` 在可安装的
   release 里挑版本号最大的一个（draft 与预发布默认排除）；
3. `isNewerVersion` 与宿主报告的当前版本比较；
4. `invoke('download_update')` 流式下载到 `%APPDATA%\万年历\updates\`，边下边算 SHA-256，
   进度以 `update://progress` 事件回推（80 ms 节流）；
5. 与资产自带的 `digest`（`sha256:<hex>`）比对，不符就删掉文件并报错；下载完整文件后
   才 `.part` → 正式名的原子改名。

**校验值直接来自 GitHub API 的资产字段**，所以发版流程不需要额外上传 checksum 文件；
反过来，拿不到 digest 时**拒绝下载**——装一个无法校验的 exe 比不更新更糟。

取消下载**不算错误**：`cancel_update` 只置标志位，`download_update` 返回 `cancelled`，
能力层把状态收回「有更新可用」，不往界面抛任何东西。用户按「取消」之后看到红字报错，
是这条链路最容易写错的地方。

安装是「启动新版然后退出本进程」：Windows 不允许替换正在运行的映像，所以只能是启动新文件
而不是覆盖自己；拉不起来时退一步用 `explorer.exe /select` 把文件所在目录打开，让用户手动跑。

请求都带 `User-Agent`（GitHub 拒绝无 UA 请求）；未认证接口限额为 60 次/小时，403/429
会被映射成 `rate-limited` 而不是笼统的网络错误。启动后 3 秒才检查，慢或不通的 GitHub
不会拖慢窗口出现。

## 发版流程

```bash
npm run release:patch   # 或 release:minor / release:major
```

这一条命令做三件事：`npm version` 提升版本号并生成提交与 `v*` 标签 → 推送分支 → 推送标签，
标签推送触发 `release.yml` 完成打包与发版。

`npm version` 要求工作区干净，所以本地未提交的改动会先被拦下来。

也可以手工走：

```bash
npm version patch -m "chore(release): v%s"
git push --follow-tags
```

> `--follow-tags` 只推送**附注标签**（`npm version` 默认就是附注标签），轻量标签不会被带上。
