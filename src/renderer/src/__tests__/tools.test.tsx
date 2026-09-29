// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import type { AppSettings } from '@shared/ipc'
import type { FakeBridge } from '../test/fake-bridge'
import { click, renderApp, setField } from '../test/harness'

let bridge: FakeBridge

afterEach(() => {
  cleanup()
  bridge.restore()
})

async function openTools(overrides: Partial<AppSettings> = {}): Promise<void> {
  bridge = await renderApp(overrides)
  await click(screen.getByRole('button', { name: '工具' }))
}

/** The value currently shown in a converter field. */
function fieldValue(label: string): string {
  const pane = screen.getByRole('region', { name: '日期换算器' })
  const field = within(pane)
    .getAllByText(label, { selector: '.field__label' })
    .map((node) => node.parentElement)
    .find((node) => node !== null)
  const input = field?.querySelector('input')
  return input?.value ?? ''
}

describe('converter tool', () => {
  it('seeds the fields from the browsed day', async () => {
    await openTools()
    expect(fieldValue('年')).toBe('2024')
    expect(fieldValue('月')).toBe('6')
    expect(fieldValue('日')).toBe('26')
    expect(screen.getByText('2024年6月26日 星期三')).toBeInTheDocument()
  })

  it('re-resolves when a solar field changes', async () => {
    await openTools()
    await setField(screen.getByDisplayValue('2024'), '2024')
    await setField(screen.getByDisplayValue('26'), '10')

    expect(await screen.findByText('2024年6月10日 星期一')).toBeInTheDocument()
    // The lunar representation follows the new day.
    expect(screen.getByText('农历甲辰年五月初五')).toBeInTheDocument()
  })

  it('re-seeds the fields when the input calendar changes', async () => {
    await openTools()
    await click(screen.getByRole('button', { name: '农历' }))

    // 2024-06-26 is 农历 2024 年 五月 廿一.
    expect(fieldValue('年')).toBe('2024')
    expect(fieldValue('月')).toBe('5')
    expect(fieldValue('日')).toBe('21')
  })

  it('resolves a lunar input back to a solar day', async () => {
    await openTools()
    await click(screen.getByRole('button', { name: '农历' }))

    // Move to 农历 正月初一, which is 2024-02-10.
    await setField(screen.getByDisplayValue('5'), '1')
    await setField(screen.getByDisplayValue('21'), '1')

    expect(await screen.findByText('2024年2月10日 星期六')).toBeInTheDocument()
    expect(screen.getByText('农历甲辰年正月初一')).toBeInTheDocument()
  })

  it('reports an invalid input instead of crashing', async () => {
    await openTools()
    await setField(screen.getByDisplayValue('6'), '13')

    expect(await screen.findByText(/公历日期无效/)).toBeInTheDocument()
    // The last valid result is still shown.
    expect(screen.getAllByText('2024年6月26日 星期三').length).toBeGreaterThan(0)
  })

  it('supports the Julian day input', async () => {
    await openTools()
    await click(screen.getByRole('button', { name: '儒略日' }))

    await setField(screen.getByDisplayValue('2460487.5'), '2460000')
    expect(await screen.findByText('2023年2月24日 星期五')).toBeInTheDocument()
  })

  it('can jump back to the browsed day', async () => {
    await openTools()
    await setField(screen.getByDisplayValue('26'), '10')
    expect(await screen.findByText('2024年6月10日 星期一')).toBeInTheDocument()

    await click(screen.getByRole('button', { name: '用浏览中的日期' }))
    expect(await screen.findByText('2024年6月26日 星期三')).toBeInTheDocument()
  })
})

describe('search tool', () => {
  async function openSearch(): Promise<void> {
    await openTools()
    await click(screen.getByRole('button', { name: '择日检索' }))
  }

  it('finds every day when no criteria are set', async () => {
    await openSearch()
    await click(screen.getByRole('button', { name: '开始检索' }))

    expect(await screen.findByText(/命中 90 天/)).toBeInTheDocument()
    expect(screen.getByText(/共扫描 90 天/)).toBeInTheDocument()
  })

  it('filters by 宜 and reports the criteria', async () => {
    await openSearch()

    await click(screen.getByRole('button', { name: /宜（需同时包含）/ }))
    await click(screen.getByRole('button', { name: '嫁娶' }))
    await click(screen.getByRole('button', { name: '开始检索' }))

    expect(await screen.findByText(/命中/)).toBeInTheDocument()
    // Every listed hit is a real day with 宜 chips rendered.
    const hits = screen.getAllByRole('button', { name: /^在月视图中打开/ })
    expect(hits.length).toBeGreaterThan(0)
  })

  it('filters by solar term', async () => {
    await openSearch()

    await click(screen.getByRole('button', { name: /节气（任一）/ }))
    await click(screen.getByRole('button', { name: '秋分' }))
    await click(screen.getByRole('button', { name: '开始检索' }))

    expect(await screen.findByText(/命中 1 天/)).toBeInTheDocument()
    expect(screen.getByText('2024年9月22日')).toBeInTheDocument()
  })

  it('rejects an inverted range', async () => {
    await openSearch()
    await setField(screen.getByDisplayValue('2024-06-26'), '2024-12-31')
    await setField(screen.getByDisplayValue('2024-09-23'), '2024-01-01')
    await click(screen.getByRole('button', { name: '开始检索' }))

    expect(await screen.findByText('起始日期不能晚于结束日期。')).toBeInTheDocument()
  })

  it('clears every criterion', async () => {
    await openSearch()
    await click(screen.getByRole('button', { name: /宜（需同时包含）/ }))
    await click(screen.getByRole('button', { name: '嫁娶' }))
    expect(screen.getByRole('button', { name: '嫁娶' })).toHaveClass('is-active')

    await click(screen.getByRole('button', { name: '清空条件' }))
    expect(screen.getByRole('button', { name: '嫁娶' })).not.toHaveClass('is-active')
  })

  it('opens a hit in the month view', async () => {
    await openSearch()
    await click(screen.getByRole('button', { name: /节气（任一）/ }))
    await click(screen.getByRole('button', { name: '秋分' }))
    await click(screen.getByRole('button', { name: '开始检索' }))
    await screen.findByText(/命中 1 天/)

    await click(screen.getAllByRole('button', { name: /^在月视图中打开/ })[0]!)

    expect(await screen.findByRole('heading', { name: '2024年9月' })).toBeInTheDocument()
    expect(screen.getByText('农历甲辰年八月二十')).toBeInTheDocument()
  })
})
