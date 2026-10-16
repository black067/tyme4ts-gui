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
- **改 `productName` 不再改数据目录**：数据目录的**默认**位置由 `tauri.conf.json` 里
  `app.appDirectoriesOverride.data = "$DATA/万年历"` 定下，与产品名解耦；改显示名不会让老用户
  的设置"消失"。用户后来把它搬到别处时，位置记在 `%APPDATA%\<identifier>\location.json`
  （见 [architecture.md](architecture.md) 的「数据位置」）。
- **第一次启动不建目录，而是问一句**，其中一项是 exe 同级的 `.chinese-calendar`。裸 exe 的
  意义正在这儿：把文件拷进 U 盘、选这一项，数据就跟着程序走（`release/` 里因此可能多出这么一个
  目录，它不是构建产物，`.gitignore` 已排除）。反过来说，只有 exe 的机器上写不进去时（只读介质、
  权限受限的目录），那一项在界面上是灰的，而不是按下去才知道不行。
- **反过来，改 `identifier` 现在有两处代价**：一是 WebView2 的缓存目录
  （`%LOCALAPPDATA%\<identifier>\`，里面只有缓存），二是上面那个指针——identifier 一改就找不到
  它，应用会回到默认目录去。数据本身不会丢（还在用户搬去的那个文件夹里），但"记得它在哪"这件事
  是跟着 identifier 存的。所以 `identifier` 与 `productName` 一样，发出去之后就不要动。

### 配置要点

`src-tauri/tauri.conf.json` 里几处不显眼但重要的设置：

| 设置                              | 原因                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `windows[0].create: false`        | 窗口由 Rust 现建，才能先读设置决定主题与底色（骨架屏的前提）                                            |
| `windows[0].visible: false`       | 同上：页面加载完成（或 2500 ms 看门狗到点）才显形，不留白窗                                             |
| `windows[0].backgroundColor`      | 与骨架屏的 `--color-bg` 同源，由 `tests/host-boundary.test.ts` 核对                                     |
| `appDirectoriesOverride.data`     | 数据目录的默认位置 `%APPDATA%\万年历`：老用户的设置与节假日缓存原地可用。用户搬走时启动早期会被指针覆盖 |
| `security.csp: null`              | CSP 只写在 `src/renderer/index.html` 的 meta 里，配置再注入一份就是两个真相                             |
| `security.freezePrototype: false` | `tyme4ts` 与部分序列化路径依赖原型链，冻结会让界面直接报错                                              |
| `bundle.active: false`            | 只发裸 exe，不出安装包；产物名由 `scripts/package.mjs` 决定                                             |
| `version: "../package.json"`      | 版本号只有 `package.json` 一处真相                                                                      |

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
6. `invoke('install_update')` **原地替换正在运行的那个 exe**，见下一节。

**校验值直接来自 GitHub API 的资产字段**，所以发版流程不需要额外上传 checksum 文件；
反过来，拿不到 digest 时**拒绝下载**——装一个无法校验的 exe 比不更新更糟。

取消下载**不算错误**：`cancel_update` 只置标志位，`download_update` 返回 `cancelled`，
能力层把状态收回「有更新可用」，不往界面抛任何东西。用户按「取消」之后看到红字报错，
是这条链路最容易写错的地方。

## 便携版怎么把自己换掉

「安装」这两个字在这里没有安装器可指：产物是一个裸 exe，用户把它放在哪，哪就是安装位置。
所以自更新必须同时满足三条，而它们互相咬住（实现整个在 `src-tauri/src/replace.rs`）：

1. **必须落在 `current_exe()` 上。** 把新版写进 `%APPDATA%\万年历\updates\` 再让用户去那儿
   双击，等于把桌面快捷方式、"下次别再提示更新"、以及launcher 三件事都丢给用户。曾经就是这样：
   用户下载完找不到新版，因为"新版"在另一个文件夹里，而他还从旧文件启动。
   现在界面在下载完成时就显示安装位置（`update_context` 命令回答的那个路径）。
2. **新实例必须等旧进程结束之后才启动。** `tauri-plugin-single-instance` 的互斥体只按
   `identifier` 命名（没开 `semver` feature，因此不含版本号）：旧进程一退出，锁就没了，跟"第几版"
   无关。所以"先 spawn 新版、四百毫秒后 `app.exit(0)`"不是竞争而是必坏——新实例在自己的
   plugin setup 里被认成第二个实例，`std::process::exit(0)`，那时窗口都还没建，表现就是
   **应用关了再没打开**。一个进程也无法在退出之后再做事情，所以必须有**进程外的等待者**。
3. **Windows 不允许覆盖或删除正在运行的映像，但允许重命名它。** 于是腾位置靠 rename。

于是安装分成两半：

```text
旧进程                          等待者（同一个 exe，--__updater-wait）
  预检目标目录可写                  等旧进程结束（OpenProcess + WaitForSingleObject，20 s 上限）
  暂存 → <exe>.new（同目录）        删掉 <exe>.old.exe
  在新字节就位后复验 SHA-256         拉起 current_exe()（带 --updated-from <旧版本>）
  rename <exe> → <exe>.old.exe     起不来就用 explorer /select 选中那个文件
  rename <exe>.new → <exe>         退出
  spawn 自己（--__updater-wait）
  删掉 updates\ 里的暂存文件
  exit(0)
```

几个不那么显然的取舍：

- **等待者等的是进程句柄，不是那把互斥体。** 命名对象只要还有一个句柄开着就仍然存在，
  `CreateMutexW` 照样返回 `ERROR_ALREADY_EXISTS`——握着锁去等锁释放，等于把原来的 bug
  搬进等待者。`--pid` 参数要的就是那个 PID。
- **参数是冻结的跨版本契约。** 换完字节之后跑等待者代码的是**新版本**的二进制，而命令行是
  旧版本拼的。`--__updater-wait` / `--pid` / `--updated-from` 改名不会坏在当前版本上，
  只会让"从上一个版本升上来"那一次退化成固定等三秒（`parse_wait_request` 认不全参数时仍然把活干完）。
- **提交点之前不留中间态。** 复制与复验都在 `<exe>.new` 上完成，之后才两次同目录 rename；
  任一步失败就滚回去（`<exe>.old.exe` 换回原名），并且**本进程不退出**，界面拿得到一个错误码。
  旧版是发射后不管：`void invoke(...).catch(() => fail('install-failed'))`。
- **失败之后不用重下。** 只有"摘要不符"才会删掉 `updates\` 里那份暂存文件（它已经不干净了）；
  目录不可写、磁盘满、`rename` 被占用都保留 `canInstall`，再按一次「重启并安装」就是重试。
  10 MB 的重下一次的代价不该由"你的文件夹不让写"来付。
- **暂存文件的删除路径不来自命令行。** 旧进程换完字节自己删 `updates\` 里那份；等待者只被允许
  删由自身路径派生的 `<exe>.old.exe`。少一个"从命令行取路径去删"的原语，就少一个旁人来删任意文件的口子。
- **写完就扫，而不是装完就扫。** `.old.exe`、`.part`、过了 7 天的暂存资产由下一个真正活下来的
  实例在 `setup` 里清扫（`replace::cleanup_exe_dir` + `update::sweep_updates_dir`）。"安装成功之后"
  那段代码属于正在退出的进程，而等待者未必跑完。
- **不加 Mark-of-the-Web。** 下载由 Rust 直接写文件，不经过会打 MOTW 的路径；换来的代价是
  新 exe 双击时没有 SmartScreen 那句"来自互联网"的提示。校验靠的是 SHA-256 而非区域标记，
  这里认为可接受——真要收紧，该收的是发布流程（签名）而不是这个位。
- **`--updated-from` 只跟一次启动**，来自命令行而不是设置文件：它的用途是让"重启并安装"
  这个按钮第一次有了可观测的结果（界面显示"已从 v0.1.4 更新到 v0.2.0"），持久化它只会多一个
  需要清空的脏状态。
- **换数据位置用的是同一个等待者，但少带一个参数。** 选定位置、搬运、删除三条链路做完之后都
  要重起来一次（原因见 [architecture.md](architecture.md) 的「数据位置」），走的是
  `replace::relaunch` → `spawn_wait(target, "")`：没有新字节要换，也就没有 `.old.exe` 要删，
  而**不能带 `--updated-from`**——那会让新版界面凭空说一句"已从 vX 更新到 vY"。同样不能图省事用
  `tauri::process::restart()`：它先建新进程再退出旧的，而新进程会被自己那把互斥体挡掉，表现还是
  "应用关了再没打开"。调试版拒绝自动重启（回 `dev` 一个码），界面因此说的是另一句话；要在那儿
  试这条链路，设 `TYME_ALLOW_DEV_RELAUNCH=1`。

**调试版默认拒绝原地替换**：换掉 `src-tauri/target/debug/chinese-calendar.exe` 会让 cargo 以为
那个文件还是它刚产出的。要在本机验证这条链路，用 `npm run package` 的产物；实在需要在调试版上跑，
临时设 `TYME_ALLOW_DEV_IN_PLACE_UPDATE=1`。

**这个修复救不了正在坏着的那一次。** 原地替换的逻辑活在新字节里，而"关掉应用却不再打开"这个
症状发生在**旧字节**执行它自己的安装时——旧版是"直接 spawn 下载好的文件然后自杀"，新实例被
互斥体挡掉，谁也没机会读到上面这段。所以已经装了坏版本的人需要**手动覆盖一次**：

```powershell
# 关掉正在运行的万年历，然后：
Copy-Item "$env:APPDATA\万年历\updates\chinese-calendar-0.2.0-portable.exe" `
  "你的启动路径\chinese-calendar-0.1.4-portable.exe" -Force
```

覆盖之后 launcher、快捷方式与"别再提示更新"三件事同时归位，往后就交给这条链路自己跑。

产物名里的版本号（`chinese-calendar-<version>-portable.exe`）与原地替换是两件独立的事：
原地换的是**文件内容**，用户启动的那个文件名保持不变。所以从 `release/` 里那个 0.1.4 命名的文件
更新到 0.2.0 之后，磁盘上仍然是 `…-0.1.4-portable.exe`，内容却是 0.2.0，界面显示 `v0.2.0`。
这看着别扭，但改它要同时动 `scripts/package.mjs`、`PORTABLE_ASSET_PATTERN` 与发布资产名；
真要消掉"永远提示有更新"的另一半原因是 **launcher 指向旧文件**——原地替换已经把这一半解决了。

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
