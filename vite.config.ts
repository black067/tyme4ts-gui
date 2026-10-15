/**
 * 前端构建配置。
 *
 * 取代原来的 `electron.vite.config.ts`：那里要分别配 main / preload / renderer 三个目标，
 * 现在只剩一个目标——`src/renderer` 与 `src/backend` 一起打进 `dist/`，由 Rust 宿主内嵌。
 *
 * 三个决定值得说明：
 *
 * - `base: './'`：生产环境资源是从 `http://tauri.localhost/assets/…` 加载的，相对路径才成立
 *   （`tauri.conf.json` 里 `frontendDist` 指的是这个目录）。
 * - `__APP_AUTHOR__`：旧版"关于"面板的作者来自运行时读的 `package.json`；产物里没有这个文件了，
 *   所以构建时把它格式化后注进常量。唯一真相仍是 `package.json`，不会和 exe 元数据打架。
 * - 不配 `externalizeDepsPlugin`：`tyme4ts` 由 Rollup 正常打进 bundle，
 *   旧版那条"必须打包否则运行时 require 不到"的问题随主进程一起消失了。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
  author?: string | { name?: string; email?: string }
}

/** 与旧版 `src/main/index.ts` 的 `formatAuthor()` 逐字一致：`名字 <邮箱>`，没名字就空串。 */
function formatAuthor(author: typeof manifest.author): string {
  if (typeof author === 'string') return author
  if (!author?.name) return ''
  return author.email ? `${author.name} <${author.email}>` : author.name
}

export default defineConfig({
  root: 'src/renderer',
  base: './',
  // `tauri dev` 与 Vite 共用同一个控制台：清屏会把 cargo 的编译进度和宿主日志刷掉。
  clearScreen: false,
  plugins: [react()],
  resolve: {
    alias: {
      // @core 指向引擎的门面文件，界面只能通过这一个入口用到日历推算（ESLint 同样在守这条）。
      '@core': resolve('src/core/index.ts'),
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer/src'),
      '@backend': resolve('src/backend')
    }
  },
  define: {
    __APP_AUTHOR__: JSON.stringify(formatAuthor(manifest.author))
  },
  build: {
    outDir: resolve('dist'),
    emptyOutDir: true,
    // WebView2 是常青浏览器，但运行时版本由用户机器上的更新决定；走 Vite 的默认
    // （各主流引擎的"广泛可用"基线）最稳，没必要为了省几 KB 假设用户是最新版。
    sourcemap: false
  },
  server: {
    // `tauri dev` 的 devUrl 指到这个端口；strictPort 让它宁可启动失败也不要静默换端口，
    // 否则宿主会对着一个没有服务在听的 5173 白屏。
    port: 5173,
    strictPort: true
  }
})
