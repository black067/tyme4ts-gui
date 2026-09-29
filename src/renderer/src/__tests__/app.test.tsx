// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import type { AppSettings } from '@shared/ipc'
import type { FakeBridge } from '../test/fake-bridge'
import { click, renderApp, setField } from '../test/harness'

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

    const grid = screen.getByRole('grid', { name: /^2024年6月/ })
    expect(within(grid).getByRole('gridcell', { name: /^2024年6月26日/ })).toHaveClass(
      'day-cell--selected'
    )

    await click(within(grid).getByRole('gridcell', { name: /^2024年6月1日/ }))

    expect(await screen.findByText('2024年6月1日')).toBeInTheDocument()
    expect(within(grid).getByRole('gridcell', { name: /^2024年6月1日/ })).toHaveClass(
      'day-cell--selected'
    )
    expect(within(grid).getByRole('gridcell', { name: /^2024年6月26日/ })).not.toHaveClass(
      'day-cell--selected'
    )
  })

  it('marks the selected cell as selected for assistive technology', async () => {
    await setup()
    const grid = screen.getByRole('grid', { name: /^2024年6月/ })

    const cell = within(grid).getByRole('gridcell', { name: /^2024年6月26日/ })
    expect(cell).toHaveAttribute('aria-selected', 'true')
    expect(cell).toHaveAttribute('tabindex', '0')
    // 2024-06-26 is not "today", so it carries no current-date marker.
    expect(cell).not.toHaveAttribute('aria-current')

    // Roving tabindex: every other cell is skipped by Tab.
    const other = within(grid).getByRole('gridcell', { name: /^2024年6月1日/ })
    expect(other).toHaveAttribute('aria-selected', 'false')
    expect(other).toHaveAttribute('tabindex', '-1')
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

    const grid = screen.getByRole('grid', { name: /^2024年6月/ })
    expect(screen.getByText('一')).toBeInTheDocument()
    expect(within(grid).getByRole('gridcell', { name: /^2024年6月1日/ })).toBeInTheDocument()
  })
})

describe('keyboard navigation', () => {
  const press = async (key: string, init: KeyboardEventInit = {}): Promise<void> => {
    await act(async () => {
      fireEvent.keyDown(window, { key, ...init })
    })
  }

  it('moves the selection by day, week and month', async () => {
    await setup()

    await press('ArrowRight')
    expect(await screen.findByText('2024年6月27日')).toBeInTheDocument()

    await press('ArrowLeft')
    expect(await screen.findByText('2024年6月26日')).toBeInTheDocument()

    await press('ArrowDown')
    expect(await screen.findByText('2024年7月3日')).toBeInTheDocument()

    await press('ArrowUp')
    expect(await screen.findByText('2024年6月26日')).toBeInTheDocument()

    await press('PageDown')
    expect(screen.getByRole('heading', { name: '2024年7月' })).toBeInTheDocument()

    await press('PageUp')
    expect(screen.getByRole('heading', { name: '2024年6月' })).toBeInTheDocument()

    await press('PageDown', { shiftKey: true })
    expect(screen.getByRole('heading', { name: '2025年6月' })).toBeInTheDocument()
  })

  it('returns to today with T', async () => {
    await setup()
    await press('PageDown')
    expect(screen.getByRole('heading', { name: '2024年7月' })).toBeInTheDocument()

    await press('t')
    expect(screen.getByRole('heading', { name: /^2026年/ })).toBeInTheDocument()
  })

  it('switches views with Alt+number', async () => {
    await setup()

    await press('3', { altKey: true })
    expect(screen.getByRole('heading', { name: '时间轴' })).toBeInTheDocument()

    await press('2', { altKey: true })
    expect(screen.getByRole('heading', { name: /年$/ })).toBeInTheDocument()

    await press('1', { altKey: true })
    expect(screen.getByRole('heading', { name: '2024年6月' })).toBeInTheDocument()
  })

  it('toggles the shortcut help with ? and closes it with Escape', async () => {
    await setup()
    expect(screen.queryByRole('region', { name: '键盘快捷键' })).not.toBeInTheDocument()

    await press('?')
    const help = screen.getByRole('region', { name: '键盘快捷键' })
    expect(within(help).getByText('回到今天')).toBeInTheDocument()
    expect(within(help).getByText('← / →')).toBeInTheDocument()

    await press('Escape')
    expect(screen.queryByRole('region', { name: '键盘快捷键' })).not.toBeInTheDocument()
  })

  it('ignores navigation keys while typing in a field', async () => {
    await setup()
    await click(screen.getByRole('button', { name: '工具' }))

    const year = screen.getByDisplayValue('2024')
    await setField(year, '2020')
    await act(async () => {
      fireEvent.keyDown(year, { key: 'ArrowRight' })
    })

    // The converter still shows the typed value; the shell did not move on.
    expect(screen.getByDisplayValue('2020')).toBeInTheDocument()
  })
})
