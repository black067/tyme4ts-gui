/**
 * 首帧骨架屏的退场。
 *
 * 骨架屏是 `index.html` 里的静态节点（`#splash`），React 从不渲染它，因此也由
 * 渲染层显式移除：`AppShell` 首次 commit 后调用本函数，淡出 200 ms 后删掉。
 * 幂等——StrictMode 的双执行、HMR 重挂载、或节点本来就不存在（测试、热更后），
 * 都只安静返回，绝不抛错。
 */
const SPLASH_ID = 'splash'

/** 与 `index.html` 里 `.splash--hiding` 的 transition 时长保持一致（含余量）。 */
const FADE_MS = 220

export function dismissSplash(): void {
  const el = document.getElementById(SPLASH_ID)
  if (!el || el.dataset.dismissed === '1') return
  el.dataset.dismissed = '1'

  const remove = (): void => {
    el.remove()
  }

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    remove()
    return
  }
  el.classList.add('splash--hiding')
  window.setTimeout(remove, FADE_MS)
}
