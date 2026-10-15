import type { TymeApi } from '@shared/ipc'

declare global {
  interface Window {
    tyme: TymeApi
  }

  /**
   * 宿主在页面任何脚本之前注入的首帧输入（`src-tauri/src/splash.rs`）。
   *
   * 只有 `splash.js` 读它：那一刻 React、i18n、`window.tyme` 都不存在，
   * 骨架屏能拿到的只有这个对象，或者——直接用浏览器打开页面时的查询串。
   */
  interface Window {
    __TAYME_SPLASH__?: { dt?: string; locale?: string; first?: boolean }
  }
}

export {}
