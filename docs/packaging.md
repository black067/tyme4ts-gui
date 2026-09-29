# 打包与发布

## 产物形态

产出 **Windows x64 免安装便携版单文件 exe**：

```
release/chinese-calendar-<version>-portable.exe
```

文件名模板来自 `electron-builder.yml` 的 `portable.artifactName`，刻意用 ASCII：
中文文件名上传到 GitHub Release 后汉字会丢，变成 `-0.1.1-portable.exe`。应用名
（`productName`）仍然是「万年历」，只影响 exe 的文件名。
双击即用；设置写在 `%APPDATA%\万年历\settings.json`。

便携版是个自解压包：启动时先把约 246 MB 的内容解到 `%TEMP%` 下的临时目录再运行，所以首帧会比
安装版慢一点，exe 本身也因此只有 95 MB 左右。设置不放在临时目录，仍然在 `%APPDATA%` 下。

## 本地打包

```bash
npm run package       # 构建 + 出便携版单文件 exe
npm run package:dir   # 只解包到 release/win-unpacked，验证打包配置用
npm run clean         # 清理 out/ release/ .tsbuild/
```

`package` 与 `package:dir` 都会先跑 `npm run build`（含类型检查），因此打包失败通常是类型错误，
而不是 electron-builder 的问题。

### 打包注意事项

- **打包前先关掉正在运行的「万年历」**，否则 `release/win-unpacked` 被占用会报 `EBUSY`。
- **编辑器也可能锁住产物**：`.vscode/settings.json` 已把 `out/**`、`release/**`、`node_modules/**`、
  `.tsbuild/**`、`vendor/**` 加进 `files.watcherExclude` 与 `search.exclude`，避免 VS Code 的文件服务
  长期持有 `release/win-unpacked/resources/app.asar`。改动该配置之前若已被锁住，**重载一次 VS Code
  窗口**（`Developer: Reload Window`）即可释放。
- 清理产物用 `npm run clean`（或 VS Code 的 **clean** task），哪个目录被占用会明确报出来。
- 应用图标由 `electron-builder.yml` 的 `win.icon: assets/calendar.svg` 指定，electron-builder 会
  光栅化成多尺寸 `.ico` 写入 exe。开发模式跑的是原版 `electron.exe`，而 Electron 的
  `nativeImage` 不支持 SVG，所以开发时任务栏仍是 Electron 默认图标。
- **改 `productName` 会改数据目录**：Electron 用 `productName` 推导 `app.getName()`，进而决定
  `app.getPath('userData')`，所以改名之后新目录是空的，旧目录里的设置不会被读到。

### 配置要点

`electron-builder.yml` 里几处不显眼但重要的设置：

| 设置                          | 原因                                                                     |
| ----------------------------- | ------------------------------------------------------------------------ |
| `npmRebuild: false`           | 项目没有原生模块，跳过重建可以显著加快打包                               |
| `files` 排除 `src/tests/...`  | 主进程 / preload 的产物已由 electron-vite 打进 `out/`，源码不需要进 asar |
| `files` 排除 `node_modules`   | 依赖已全部打进 bundle，带上会多出约 9 MB 永远不会被 `require` 的文件     |
| `directories.output: release` | 产物集中在一个已被 `.gitignore` 忽略的目录                               |

`!node_modules/**` 是这几行里唯一有前提的：electron-vite 的 `externalizeDepsPlugin()`
会把 `dependencies` 里出现过的包改写成运行时 `require()`。所以**主进程与 preload 不得从
`dependencies` 导入任何包**（它们目前只依赖 `electron` 与 `node:` 内置模块）。

**例外要显式声明。** `tyme4ts` 会被主进程通过 `@core` 间接用到（节假日覆盖层的校验），
所以 `electron.vite.config.ts` 里把它列进 `externalizeDepsPlugin({ exclude: ['tyme4ts'] })`，
**打进 bundle 而不是留成运行时 require**。不这么做的话，产物里会出现 `require("tyme4ts")`，
而打包时 `node_modules` 已被排除——安装版一启动就崩；`npm run dev` 与 `npm test` 都发现不了，
因为开发机上 `node_modules` 就在那里。

这条约束由 `tests/packaging-contract.test.ts` 守，而且查的是**两处**：

1. 源码里 `src/main`、`src/preload` 没有从 `dependencies` 导入任何包；
2. **构建产物** `out/main/index.js` 与 `out/preload/index.js` 里的 `require()` 只有
   `electron` 与 `node:` 内置模块。

第 2 条是后加的，因为第 1 条看不见 `externalizeDepsPlugin()` 做的改写——源码可以很干净，
产物却带着一个包里没有的 require。这条断言在 `out/` 不存在时会**失败而不是跳过**：
静默跳过的检查读起来像通过，比没有更糟。`release.yml` 先测试后打包，所以发版路径上
一定有一份产物可查。

打包命令统一带 `--publish never`：electron-builder 的 `--publish` 默认值是 `onTagOrDraft`，
在有 token 的自动化环境里会自作主张建 Release。发版统一走 `release.yml` 里的 `gh` 步骤，
行为更可预期。

## GitHub Actions

只有一个工作流 `release.yml`，跑在 `windows-latest` 上（应用只面向 Windows，直接和目标平台
保持一致）。

### `release.yml` — 出包与发版

唯一触发方式是 push 一个 `v*` tag：跑测试 → 打包 → 上传 workflow artifact → 创建 GitHub
Release 并附上 exe。没有第二条能创建 Release 的路径，所以不会出现同一个版本被发两次。

缓存了 `%LOCALAPPDATA%` 下的两个目录：`electron\Cache`（Electron 发行包 zip，约 120 MB）和
`electron-builder\Cache`（nsis / winCodeSign / 7zip 等工具）。缓存命中后打包基本只剩解包时间。

发版前会校验 tag 与 `package.json` 的 `version` 是否一致，不一致直接失败——避免出现
「exe 文件名里的版本号和 Release 标题对不上」这种事后才发现的问题。

Release 建成 **draft**：流程跑完后到 Releases 页面确认 exe 能跑，再点 **Publish** 转正。
同一个 tag 被重复推送时会走 `gh release upload --clobber` 覆盖资产，不会报「已存在」。

## 应用内检查更新

实现见 `src/main/updater.ts`，版本比较与资产选择在纯逻辑层 `src/core/update.ts`。

**没有用 `electron-updater`**：官方文档列出的可自动更新目标只有 macOS DMG、Linux
AppImage/DEB/Pacman/RPM 与 **Windows NSIS**——本应用发布的是 `portable` 单文件 exe，
不在其中；引入它还会违反「主进程不得依赖 `dependencies`」那条打包约束。

流程：

1. `updates:check` → `GET https://api.github.com/repos/black067/tyme4ts-gui/releases`；
2. `parseReleases` 把响应当**不可信输入**校验，`selectLatestPortableRelease` 在可安装的
   release 里挑版本号最大的一个（draft 与预发布默认排除）；
3. `isNewerVersion` 与 `app.getVersion()` 比较；
4. `updates:download` 流式下载到 `%APPDATA%\万年历\updates\`，边下边算 SHA-256；
5. 与资产自带的 `digest`（`sha256:<hex>`）比对，不符就删掉文件并报错。

**校验值直接来自 GitHub API 的资产字段**，所以发版流程不需要额外上传 checksum 文件；
反过来，拿不到 digest 时**拒绝下载**——装一个无法校验的 exe 比不更新更糟。

安装是「启动新版然后退出本进程」：便携版启动时会把内容解到自己的临时目录，所以新旧两版
不会争抢文件；而 Windows 不允许替换正在运行的映像，所以只能是启动新文件而不是覆盖自己。

请求都带 `User-Agent`（GitHub 拒绝无 UA 请求）；未认证接口限额为 60 次/小时，403/429
会被映射成 `rate-limited` 而不是笼统的网络错误。启动后 3 秒才检查，慢或不通的 GitHub
不会拖慢窗口出现。

创建 Release 用的是 runner 自带的 `gh` CLI（`GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`），没有引入
任何第三方 Action：`actions/checkout`、`actions/setup-node`、`actions/cache`、
`actions/upload-artifact` 是全部的外部依赖，且都是 GitHub 一方的。

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
