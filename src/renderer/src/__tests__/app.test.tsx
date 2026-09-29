// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { App } from '../App'
import { installFakeBridge, type FakeBridge } from '../test/fake-bridge'

let bridge: FakeBridge

beforeEach(() => {
  bridge = installFakeBridge({ lastViewedDate: '2024-06-26', defaultView: 'month' })
})

afterEach(() => {
  cleanup()
  bridge.restore()
})

/**
 * Clicks and waits for the settings round-trip.
 *
 * Every interaction that changes a setting also fires an async write, so the
 * click is wrapped in an async `act` that flushes the resulting promise before
 * the test makes its assertions.
 */
async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(element)
  })
}

/** Waits for the shell, which only mounts once settings have loaded. */
async function renderApp(): Promise<void> {
  render(<App />)
  await screen.findByRole('heading', { name: '万年历' })
}

describe('app shell', () => {
  it('restores the last browsed day from settings', async () => {
    await renderApp()
    expect(await screen.findByText('2024年6月26日')).toBeInTheDocument()
    expect(screen.getByText('农历甲辰年五月廿一')).toBeInTheDocument()
  })

  it('opens on the month view and can switch to the other tabs', async () => {
    await renderApp()

    // Month view is the default.
    expect(screen.getByRole('heading', { name: '2024年6月' })).toBeInTheDocument()

    await click(screen.getByRole('button', { name: '年视图' }))
    expect(screen.getByRole('heading', { name: '2024年' })).toBeInTheDocument()
    expect(screen.getByText('二十四节气')).toBeInTheDocument()

    await click(screen.getByRole('button', { name: '时间轴' }))
    expect(screen.getByRole('heading', { name: '时间轴' })).toBeInTheDocument()

    await click(screen.getByRole('button', { name: '月视图' }))
    expect(screen.getByRole('heading', { name: '2024年6月' })).toBeInTheDocument()
  })

  it('persists the chosen view', async () => {
    await renderApp()
    await click(screen.getByRole('button', { name: '年视图' }))
    expect(bridge.patches.some((patch) => patch.defaultView === 'year')).toBe(true)
  })

  it('pages months and keeps the day panel in step', async () => {
    await renderApp()

    await click(screen.getByRole('button', { name: '下一个月' }))
    expect(screen.getByRole('heading', { name: '2024年7月' })).toBeInTheDocument()
    // 2024-07-26 is 五月廿一 -> 六月廿一 in the lunar calendar.
    expect(screen.getByText('农历甲辰年六月廿一')).toBeInTheDocument()

    await click(screen.getByRole('button', { name: '上一个月' }))
    expect(screen.getByRole('heading', { name: '2024年6月' })).toBeInTheDocument()
  })

  it('selects a day by clicking its cell', async () => {
    await renderApp()

    const grid = screen.getByRole('region', { name: '月视图' })
    expect(within(grid).getByRole('button', { name: /^2024年6月26日/ })).toHaveClass(
      'day-cell--selected'
    )

    await click(within(grid).getByRole('button', { name: /^2024年6月1日/ }))

    // The day panel now describes the 1st, and the selection marker moved.
    expect(await screen.findByText('2024年6月1日')).toBeInTheDocument()
    expect(within(grid).getByRole('button', { name: /^2024年6月1日/ })).toHaveClass(
      'day-cell--selected'
    )
    expect(within(grid).getByRole('button', { name: /^2024年6月26日/ })).not.toHaveClass(
      'day-cell--selected'
    )
  })

  it('switches theme and appearance through the settings bar', async () => {
    await renderApp()

    await click(screen.getByRole('button', { name: '中国传统' }))
    expect(bridge.settings.themeId).toBe('classic')
    expect(document.documentElement.dataset.theme).toBe('classic-light')

    await click(screen.getByRole('button', { name: '深色' }))
    expect(bridge.settings.appearance).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('classic-dark')
  })

  it('hides the almanac sections when the setting is off', async () => {
    bridge = installFakeBridge({
      lastViewedDate: '2024-06-26',
      defaultView: 'month',
      showAlmanac: false
    })
    await renderApp()

    expect(screen.queryByText('宜')).not.toBeInTheDocument()
    expect(screen.queryByText('彭祖百忌')).not.toBeInTheDocument()
    // The non-almanac facts stay visible.
    expect(screen.getByText('纳音')).toBeInTheDocument()
  })

  it('renders a Monday-first grid when that setting is on', async () => {
    bridge = installFakeBridge({
      lastViewedDate: '2024-06-26',
      defaultView: 'month',
      weekStartsOnMonday: true
    })
    await renderApp()

    const grid = screen.getByRole('region', { name: '月视图' })
    expect(within(grid).getByText('一')).toBeInTheDocument()
    // 2024-06-26 is a Wednesday; Monday-first puts it in the column after 二.
    expect(within(grid).getByRole('button', { name: /^2024年6月1日/ })).toBeInTheDocument()
  })
})
