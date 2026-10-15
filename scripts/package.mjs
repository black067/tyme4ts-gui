/**
 * 出产物：一个免安装的便携 exe。
 *
 *   node scripts/package.mjs              # 构建并复制到 release/
 *   node scripts/package.mjs --no-build   # 只从已有的 src-tauri/target/release 复制（迭代用）
 *
 * 取代原来的 `electron-builder --win portable`。差别是这一步不再产生"自解压包"，
 * 而就是那个 exe 本身：`tauri build --no-bundle` 编译出单文件可执行文件，前端资源由
 * `frontendDist`（`dist/`）在编译期内嵌进二进制，运行时不解压、不留临时目录，
 * 同级也不需要任何 dll。
 *
 * 构建本身交给 tauri.conf.json 的 `beforeBuildCommand`（`npm run build`：类型检查 + Vite 打包），
 * 所以这里不重复跑一遍——两条路径各自构建同一个 dist/ 只会让产物与检查脱节。
 *
 * 产物名保持 ASCII：`chinese-calendar-<版本>-portable.exe`。两个理由都不是审美问题：
 *
 * 1. `src/core/update.ts` 的 `PORTABLE_ASSET_PATTERN` 按这个名字匹配 GitHub Release 的资产，
 *    `tests/host-boundary.test.ts` 会拿本文件里的模板去核对那条正则；
 * 2. GitHub Releases 会丢弃含 CJK 的资产文件名。给人看的名字（万年历）在
 *    `tauri.conf.json` 的 `productName` 里，那是窗口标题与 exe 资源元数据，与文件名无关。
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync
} from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PROJECT_ROOT as ROOT, relativeToRoot as relative, tauriCli } from './tauri-cli.mjs'

/** 与 `src/core/update.ts` 的正则、`src/core/__tests__/update.test.ts` 的期望同源。 */
export const ARTIFACT_BASE_NAME = 'chinese-calendar'

/** cargo 产出的裸二进制名（不设 `mainBinaryName`：改名会把"构建产物"变成两处知识）。 */
const CARGO_BINARY = `${ARTIFACT_BASE_NAME}.exe`

export function artifactName(version) {
  return `${ARTIFACT_BASE_NAME}-${version}-portable.exe`
}

function formatSize(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function packageApp({ build = true } = {}) {
  const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version

  if (build) {
    console.log('› tauri build --no-bundle')
    tauriCli('build', '--no-bundle')
  }

  const built = join(ROOT, 'src-tauri', 'target', 'release', CARGO_BINARY)
  if (!existsSync(built)) {
    throw new Error(
      `找不到构建产物 ${relative(built)}（先跑一次不带 --no-build 的 npm run package）`
    )
  }

  // cargo 在 release 目录里还留着一堆 deps/ 与 .d 文件；只取这一个 exe。
  const exes = readdirSync(join(ROOT, 'src-tauri', 'target', 'release'), {
    withFileTypes: true
  })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.exe'))
    .map((entry) => entry.name)
  if (exes.length > 1) {
    console.warn(`! target/release 里有多个 exe：${exes.join(', ')}；只取 ${CARGO_BINARY}`)
  }

  const releaseDir = join(ROOT, 'release')
  mkdirSync(releaseDir, { recursive: true })

  const target = join(releaseDir, artifactName(version))
  const stale = `${target}.old`
  // 同名旧产物先移开再删：Windows 上覆盖一个正被杀毒软件扫描的文件会 EBUSY，
  // 而此时新产物已经复制成功，不该因为删不掉旧的而报"打包失败"。
  if (existsSync(target)) {
    renameSync(target, stale)
  }
  copyFileSync(built, target)
  if (existsSync(stale)) {
    rmSync(stale, { force: true })
  }

  return { target, version, size: statSync(target).size }
}

// 只有在被当作命令执行时才动作；被测试 import 时只导出函数。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { target, size } = packageApp({ build: !process.argv.includes('--no-build') })
    console.log(`✓ ${relative(target)}  ${formatSize(size)}`)
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
