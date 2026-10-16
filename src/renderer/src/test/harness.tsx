import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect } from 'vitest'
import type { AppSettings } from '@shared/ipc'
import { App } from '../App'
import { SetupApp } from '../features/setup/SetupApp'
import { installFakeBridge, type FakeBridge, type FakeDataDir } from './fake-bridge'

/**
 * Clicks and waits for the settings round-trip.
 *
 * Every interaction that changes a setting also fires an async write, so the
 * click is wrapped in an async `act` that flushes the resulting promise before
 * the test makes its assertions.
 */
export async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(element)
  })
}

/** Types into an uncontrolled field and flushes the resulting state updates. */
export async function setField(element: HTMLElement, value: string): Promise<void> {
  await act(async () => {
    fireEvent.change(element, { target: { value } })
  })
}

/**
 * 右下角那些 toast 的文本，按出现的先后。
 *
 * 断言消息去了哪儿，光看"页面上有没有这句话"不够——内联段落也满足它。这里只认 `.toast__text`
 * 里的那些，所以一个把消息改回常驻段落的实现会红。（不用 `role="status"` 去挑：界面里本来就
 * 有别的活动区域，`<output>` 的隐式角色也是 status，那种写法会一次捞出几条不相干的东西。）
 */
export function toastTexts(): string[] {
  return [...document.querySelectorAll('.toast__text')].map((node) => node.textContent ?? '')
}

/**
 * 等至少一条 toast 挂上来，再读整个队列。
 *
 * 提示都是操作的结果，而操作要过一层 promise：`act()` 里点下去的那一下并不会等宿主答完。
 * 只等"有没有"，具体是哪一句由调用方断言——一次操作可能说两条（搬好了、旧目录还剩几个），
 * 逐条 `findBy` 反而会把"第二句没来"这种真 bug 读成超时。
 */
export async function waitForToasts(): Promise<string[]> {
  await waitFor(() => expect(toastTexts()).not.toEqual([]))
  return toastTexts()
}

/** Installs the fake `window.tyme` facade and renders the app once settings load. */
export async function renderApp(overrides: Partial<AppSettings> = {}): Promise<FakeBridge> {
  const bridge = installFakeBridge({
    lastViewedDate: '2024-06-26',
    defaultView: 'month',
    ...overrides
  })
  render(<App />)
  await screen.findByRole('heading', { name: '万年历' })
  // 标题出现只说明这次提交画出来了，不代表被动 effect 已经执行。键盘测试紧接着就
  // dispatch keydown，而 useKeyboardNav 的监听是在 effect 里挂的——不冲一次微任务，
  // 事件会偶发地落在监听器挂上之前，测试随机失败。
  await act(async () => {})
  return bridge
}

/**
 * 首启那一屏。
 *
 * `dataDir` 在渲染**之前**落下：那一屏在挂载时问一次"有哪些位置可选"，之后不再问，
 * 所以想让它看见 U 盘没了、看见某个位置写不进去，就得赶在它问之前改好答复。
 */
export async function renderSetup(
  overrides: Partial<AppSettings> = {},
  dataDir: Partial<FakeDataDir> = {}
): Promise<FakeBridge> {
  const bridge = installFakeBridge({
    lastViewedDate: '2024-06-26',
    defaultView: 'month',
    ...overrides
  })
  if (Object.keys(dataDir).length > 0) bridge.setDataDir(dataDir)
  render(<SetupApp />)
  await screen.findByRole('radio', { name: /用户目录/ })
  await act(async () => {})
  return bridge
}
