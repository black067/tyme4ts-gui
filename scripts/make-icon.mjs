/**
 * 从 `assets/calendar.svg` 生成图标全套。
 *
 *   node scripts/make-icon.mjs
 *
 * 为什么要脚本，而不是把 PNG 提交进仓库就完事：图标的唯一真相是那张 24×24 的矢量图
 * （署名见 `assets/calendar-author.txt`），位图是衍生物。`tauri icon` 只吃
 * 1024×1024 的带透明方 PNG，不接受 SVG，所以中间这步光栅化得有人做。
 *
 * 两步：
 *
 * 1. sharp（librsvg）按矢量渲染成 `.tsbuild/calendar-1024.png`——注意是用 `density`
 *    让 SVG 直接在 1024 尺寸上光栅化，而不是先画 24 像素再放大，后者会得到一块马赛克。
 *    中间产物放 `.tsbuild/`：它是衍生物的衍生物，不该出现在 `assets/` 里误导人改它；
 * 2. `tauri icon` 由它生成 Windows 需要的 `icon.ico` 与各尺寸 PNG。
 *
 * 最后删掉用不上的产物：这个应用只发 Windows portable，没有安装器、没有移动端，
 * 于是 `icons/android`、`icons/ios`、`icon.icns` 和一批 MSIX 商店磁贴都是噪音。
 * `tauri.conf.json` 的 `bundle.icon` 只引用 32x32.png / 128x128.png / 128x128@2x.png /
 * icon.ico 四项，删掉它们不会让构建找不到东西——`tests/host-boundary.test.ts` 会核对这点。
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PROJECT_ROOT as ROOT, relativeToRoot as rel, tauriCli } from './tauri-cli.mjs'

const SVG = join(ROOT, 'assets', 'calendar.svg')
const PNG = join(ROOT, '.tsbuild', 'calendar-1024.png')
const ICONS = join(ROOT, 'src-tauri', 'icons')

const SIZE = 1024
/** SVG 根尺寸 24×24 → 要让它直接光栅化到 1024，density 需按 96 基准放大同样的倍数。 */
const DENSITY = Math.round(96 * (SIZE / 24))

const { default: sharp } = await import('sharp')

const buffer = await sharp(readFileSync(SVG), { density: DENSITY })
  .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer()
mkdirSync(join(ROOT, '.tsbuild'), { recursive: true })
writeFileSync(PNG, buffer)
console.log(`✓ ${rel(PNG)}  ${SIZE}×${SIZE}`)

tauriCli('icon', rel(PNG))

// 只发 Windows portable：移动端、macOS 与 MSIX 磁贴一概不需要。
const PRUNE = [
  join(ICONS, 'android'),
  join(ICONS, 'ios'),
  join(ICONS, 'icon.icns'),
  join(ICONS, 'Square30x30Logo.png'),
  join(ICONS, 'Square44x44Logo.png'),
  join(ICONS, 'Square71x71Logo.png'),
  join(ICONS, 'Square89x89Logo.png'),
  join(ICONS, 'Square107x107Logo.png'),
  join(ICONS, 'Square142x142Logo.png'),
  join(ICONS, 'Square150x150Logo.png'),
  join(ICONS, 'Square284x284Logo.png'),
  join(ICONS, 'Square310x310Logo.png'),
  join(ICONS, 'StoreLogo.png')
]
for (const path of PRUNE) {
  rmSync(path, { recursive: true, force: true })
}

// 少一个都要当失败：图标缺失时 cargo 会在 build.rs 里炸，那时错误信息离原因很远。
for (const required of [
  join(ICONS, 'icon.ico'),
  join(ICONS, '32x32.png'),
  join(ICONS, '128x128.png'),
  join(ICONS, '128x128@2x.png')
]) {
  if (!existsSync(required)) {
    console.error(`✗ 缺少 ${rel(required)}`)
    process.exit(1)
  }
}
console.log(`✓ ${rel(ICONS)}/（Windows 所需四项齐备）`)
