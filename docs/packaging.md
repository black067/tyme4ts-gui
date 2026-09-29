# 打包与发布

## 产物形态

产出 **Windows x64 免安装便携版单文件 exe**：

```
release/万年历-<version>-portable.exe
```

文件名模板来自 `electron-builder.yml` 的 `portable.artifactName`（`${productName}-${version}-portable.${ext}`）。
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
这条约束由 `tests/packaging-contract.test.ts` 在 `npm test` 里守着，不需要等到打包才发现。

打包命令统一带 `--publish never`：electron-builder 的 `--publish` 默认值是 `onTagOrDraft`，
在 CI 里跑且恰好能拿到 token 时会自作主张建 Release。发版统一走 `release.yml` 里的 `gh`
步骤，行为更可预期。

## GitHub Actions

两个工作流，都在 `windows-latest` 上跑（应用只面向 Windows，直接和目标平台保持一致）。

### `ci.yml` — 提交即验证

触发：push 到 `main`、所有 pull request、手动 `workflow_dispatch`。

| Job       | 内容                                                      |
| --------- | --------------------------------------------------------- |
| `check`   | `npm ci` → `format:check` → `lint` → `typecheck` → `test` |
| `package` | `npm ci` → `package:dir`，确认打包配置没被改坏            |

`ci.yml` 的 `package` job 与 `release.yml` 都缓存了 `%LOCALAPPDATA%` 下的两个目录：`electron\Cache`
（Electron 发行包 zip，约 120 MB）和 `electron-builder\Cache`（nsis / winCodeSign / 7zip 等工具）。
缓存命中后打包基本只剩解包时间。同一分支上的新推送会取消上一次仍在跑的检查
（`concurrency.cancel-in-progress`）。

### `release.yml` — 出包与发版

| 触发方式                 | 行为                                                |
| ------------------------ | --------------------------------------------------- |
| push tag `v*`            | 打包 → 上传 workflow artifact → 创建 GitHub Release |
| 手动 `workflow_dispatch` | 打包 → 只上传 workflow artifact（不发版）           |

手动触发那条路径的意义是：**不需要本地 Windows 环境也能拿到便携版 exe**。到
`Actions → Release → Run workflow` 跑一次，结束后在运行页面的 Artifacts 里下载。

发版时还会校验 tag 与 `package.json` 的 `version` 是否一致，不一致直接失败——避免出现
「exe 文件名里的版本号和 Release 标题对不上」这种事后才发现的问题。

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
