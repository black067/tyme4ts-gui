// 删除构建产物。用于清掉前端与宿主的构建缓存，或在打包报 EBUSY 后清理被占用的 release/。
//
//   node scripts/clean.mjs              # 清理 dist/ release/ .tsbuild/
//   node scripts/clean.mjs dist         # 只清理指定目录
//   node scripts/clean.mjs host         # 额外清理 Rust 的 src-tauri/target/（很大，重新编译要几分钟）
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

const DEFAULT_TARGETS = ['dist', 'release', '.tsbuild']

// `host` 不是目录名，是一个开关：Rust 的产物目录在 src-tauri 下面，路径写法不同。
const RUST_TARGET = ['src-tauri/target', 'src-tauri/gen/schemas']

const args = process.argv.slice(2)
const withRust = args.includes('host')
const targets = [...(withRust ? RUST_TARGET : []), ...args.filter((arg) => arg !== 'host')]
const effective = targets.length > 0 ? targets : DEFAULT_TARGETS

for (const target of effective) {
  const path = resolve(process.cwd(), target)
  try {
    rmSync(path, { recursive: true, force: true })
    console.log(`removed  ${target}/`)
  } catch (error) {
    console.error(`failed   ${target}/: ${error instanceof Error ? error.message : String(error)}`)
    console.error('  → 若有正在运行的应用或编辑器占用该目录，先关闭再重试。')
    process.exitCode = 1
  }
}
