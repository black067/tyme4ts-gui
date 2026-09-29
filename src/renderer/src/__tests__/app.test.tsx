// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import type { AppSettings } from '@shared/ipc'
import type { FakeBridge } from '../test/fake-bridge'
import { click, renderApp } from '../test/harness'

let bridge: FakeBridge

afterEach(() => {
  cleanup()
  bridge.restore()
})

async function setup(overrides: Partial<AppSettings> = {}): Promise<void> {
  bridge = await renderApp(overrides)
}

describe('app shell', () => {
  it('restores the last browsed day from settings', async () => {
    await setup()
    expect(await screen.findByText('2024年6月26日')).toBeInTheDocument()
    expect(screen.getByText('农历甲辰年五月廿一')).toBeInTheDocument()
  })

  it('opens on the month view and can switch to every tab', async () => {
    await setup()

    expect(screen.getByRole('heading', { name: '2024年6月' })).toBeInTheDocument()

    await click(screen.getByRole('button', { name: '年视图' }))
    expect(screen.getByRole('heading', { name: '2024年' })).toBeInTheDocument()
    expect(screen.getByText('二十四节气')).toBeInTheDocument()

    await click(screen.getByRole('button', { name: '时间轴' }))
    expect(screen.getByRole('heading', { name: '时间轴' })).toBeInTheDocument()

    await click(screen.getByRole('button', { name: '工具' }))
    expect(screen.getByRole('heading', { name: '日期换算器' })).toBeInTheDocument()

    await click(screen.getByRole('button', { name: '月视图' }))
    expect(screen.getByRole('heading', { name: '2024年6月' })).toBeInTheDocument()
  })

  it('persists the chosen view', async () => {
    await setup()
    await click(screen.getByRole('button', { name: '年视图' }))
    expect(bridge.patches.some((patch) => patch.defaultView === 'year')).toBe(true)
  })

  it('pages months and keeps the day panel in step', async () => {
    await setup()

    await click(screen.getByRole('button', { name: '下一个月' }))
    expect(screen.getByRole('heading', { name: '2024年7月' })).toBeInTheDocument()
    expect(screen.getByText('农历甲辰年六月廿一')).toBeInTheDocument()

    await click(screen.getByRole('button', { name: '上一个月' }))
    expect(screen.getByRole('heading', { name: '2024年6月' })).toBeInTheDocument()
  })

  it('selects a day by clicking its cell', async () => {
    await setup()

    const grid = screen.getByRole('region', { name: '月视图' })
    expect(within(grid).getByRole('button', { name: /^2024年6月26日/ })).toHaveClass(
      'day-cell--selected'
    )

    await click(within(grid).getByRole('button', { name: /^2024年6月1日/ }))

    expect(await screen.findByText('2024年6月1日')).toBeInTheDocument()
    expect(within(grid).getByRole('button', { name: /^2024年6月1日/ })).toHaveClass(
      'day-cell--selected'
    )
    expect(within(grid).getByRole('button', { name: /^2024年6月26日/ })).not.toHaveClass(
      'day-cell--selected'
    )
  })

  it('switches theme and appearance through the settings bar', async () => {
    await setup()

    await click(screen.getByRole('button', { name: '中国传统' }))
    expect(bridge.settings.themeId).toBe('classic')
    expect(document.documentElement.dataset.theme).toBe('classic-light')

    await click(screen.getByRole('button', { name: '深色' }))
    expect(bridge.settings.appearance).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('classic-dark')
  })

  it('hides the almanac sections when the setting is off', async () => {
    await setup({ showAlmanac: false })

    expect(screen.queryByText('宜')).not.toBeInTheDocument()
    expect(screen.queryByText('彭祖百忌')).not.toBeInTheDocument()
    expect(screen.getByText('纳音')).toBeInTheDocument()
  })

  it('renders a Monday-first grid when that setting is on', async () => {
    await setup({ weekStartsOnMonday: true })

    const grid = screen.getByRole('region', { name: '月视图' })
    expect(within(grid).getByText('一')).toBeInTheDocument()
    expect(within(grid).getByRole('button', { name: /^2024年6月1日/ })).toBeInTheDocument()
  })
})
