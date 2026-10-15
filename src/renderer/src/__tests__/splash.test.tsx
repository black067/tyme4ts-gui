// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import type { FakeBridge } from '../test/fake-bridge'
import { renderApp } from '../test/harness'
import { dismissSplash } from '../splash'

/** 在 DOM 里放一个与 `index.html` 同 id 的骨架节点，模拟"首帧已画出"。 */
function placeSplash(): HTMLElement {
  const el = document.createElement('div')
  el.id = 'splash'
  document.body.appendChild(el)
  return el
}

let bridge: FakeBridge | undefined

afterEach(() => {
  cleanup()
  document.getElementById('splash')?.remove()
  bridge?.restore()
  bridge = undefined
})

describe('骨架屏退场', () => {
  it('节点不存在时安静返回（热更新重挂载不会抛错）', () => {
    expect(() => {
      dismissSplash()
      dismissSplash()
    }).not.toThrow()
  })

  it('标记 dismissed、加淡出类，淡出结束从 DOM 移除', async () => {
    const el = placeSplash()

    dismissSplash()
    expect(el.dataset.dismissed).toBe('1')
    expect(el.classList.contains('splash--hiding')).toBe(true)

    // 幂等：第二次调用不重复标记，也不安排第二次移除。
    dismissSplash()
    expect(el.isConnected).toBe(true)

    await vi.waitFor(() => expect(document.getElementById('splash')).toBeNull(), { timeout: 2000 })
  })

  it('真实渲染链：AppShell 首次 commit 后骨架屏自己退场', async () => {
    placeSplash()
    bridge = await renderApp()

    // 标题出现说明 shell 已经画进 DOM。
    expect(document.querySelector('.app-shell')).not.toBeNull()

    await vi.waitFor(() => expect(document.getElementById('splash')).toBeNull(), { timeout: 2000 })
  })
})
