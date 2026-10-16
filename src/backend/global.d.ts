import type { TymeApi } from '@shared/ipc'

declare global {
  interface Window {
    tyme: TymeApi
  }

  /**
   * 宿主在页面任何脚本之前注入的首帧输入（`src-tauri/src/splash.rs`）。
   *
   * 两个读者：`splash.js` 用它给骨架屏上色并把 `setup` 落成 `<html data-setup>`（样式据此
   * 隐藏骨架屏）；`main.tsx` 用同一个 `setup` 决定装载日历还是装载选目录那一屏。读的是同一个
   * 对象，所以不会出现"骨架屏藏了、界面却还是日历"那种半截状态。
   *
   * 字段全部可选：查询串回落（浏览器里直接跑 `npm run dev:web`）只带得上标量。
   */
  interface Window {
    __TAYME_SPLASH__?: { dt?: string; locale?: string; first?: boolean; setup?: boolean }
  }
}

export {}
