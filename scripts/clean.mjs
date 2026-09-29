// 删除构建产物。用于清掉电子构建缓存、或在打包报 EBUSY 后清理被占用的 release/。
//
//   node scripts/clean.mjs            # 清理 out/ release/ .tsbuild/
//   node scripts/clean.mjs out        # 只清理指定目录
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

const DEFAULT_TARGETS = ['out', 'release', '.tsbuild']
const targets = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_TARGETS

for (const target of targets) {
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
