/**
 * 跑 Tauri CLI 的共用出口。
 *
 * 不用 `npx tauri`：Windows 上 npx 是 `npx.cmd`，得开 shell 才能 spawn，而 Node 24
 * 对"带 shell 又带参数"已经发了 DEP0190 弃用警告。CLI 本身就是个 js 文件，用当前
 * node 可执行文件直接跑它，不经过 shell，也不需要 PATH，跨平台同一份代码。
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const PROJECT_ROOT = ROOT

export function tauriCli(...args) {
  const cli = join(ROOT, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')
  if (!existsSync(cli)) {
    throw new Error(`找不到 Tauri CLI：${cli}（先跑 npm install）`)
  }
  execFileSync(process.execPath, [cli, ...args], { cwd: ROOT, stdio: 'inherit' })
}

/** 相对仓库根的路径，用正斜杠：日志与传给 CLI 的参数都要稳定可读。 */
export function relativeToRoot(absolute) {
  return absolute.slice(ROOT.length + 1).replace(/\\/g, '/')
}
