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

/** Opens the 工具 tab and switches to the 八字排盘 sub-tool. */
async function openPillars(overrides: Partial<AppSettings> = {}): Promise<void> {
  bridge = await renderApp({ lastViewedDate: '1990-05-20', ...overrides })
  await click(screen.getByRole('button', { name: '工具' }))
  await click(screen.getByRole('button', { name: '八字排盘' }))
}

function chart(): HTMLElement {
  return screen.getByRole('table', { name: '四柱' })
}

describe('八字排盘 tool', () => {
  it('renders the four pillars for the browsed day', async () => {
    await openPillars()

    const table = within(chart())
    expect(table.getByText('年柱')).toBeInTheDocument()
    expect(table.getByText('月柱')).toBeInTheDocument()
    expect(table.getByText('日柱')).toBeInTheDocument()
    expect(table.getByText('时柱')).toBeInTheDocument()

    // 1990-05-20 14:30, male.
    expect(table.getByText('庚午')).toBeInTheDocument()
    expect(table.getByText('辛巳')).toBeInTheDocument()
    expect(table.getByText('乙酉')).toBeInTheDocument()
    expect(table.getByText('癸未')).toBeInTheDocument()
  })

  it('shows 十神, 藏干, 五行 and 纳音 rows', async () => {
    await openPillars()
    const table = within(chart())

    expect(table.getByText('正官')).toBeInTheDocument()
    expect(table.getByText('七杀')).toBeInTheDocument()
    expect(table.getByText('日主')).toBeInTheDocument()
    expect(table.getByText('偏印')).toBeInTheDocument()
    expect(table.getByText('泉中水')).toBeInTheDocument()
    expect(table.getByText('辛')).toBeInTheDocument()
  })

  it('reports the day master and the element tally', async () => {
    await openPillars()

    expect(screen.getByText('日主 乙木')).toBeInTheDocument()
    const tally = screen.getByLabelText('五行统计')
    for (const element of ['木', '火', '土', '金', '水']) {
      expect(within(tally).getByText(element)).toBeInTheDocument()
    }
  })

  it('reports 起运 and lists 大运 and 流年', async () => {
    await openPillars()

    expect(screen.getByText('5 年 6 个月 21 天')).toBeInTheDocument()
    expect(screen.getByText('顺行')).toBeInTheDocument()

    expect(screen.getByText('壬午')).toBeInTheDocument()
    expect(screen.getByText('6–15 岁')).toBeInTheDocument()
    expect(screen.getByText('1995 起')).toBeInTheDocument()

    expect(screen.getByText('流年（起运后）')).toBeInTheDocument()
    expect(screen.getAllByText('偏财').length).toBeGreaterThan(0)
  })

  it('recomputes when the birth time changes', async () => {
    await openPillars()
    expect(within(chart()).getByText('癸未')).toBeInTheDocument()

    await setField(screen.getByLabelText('出生时刻'), '08:00')

    // 08:00 falls in 辰时 rather than 未时.
    expect(within(chart()).getByText('庚辰')).toBeInTheDocument()
    expect(within(chart()).queryByText('癸未')).not.toBeInTheDocument()
  })

  it('switches gender', async () => {
    await openPillars()
    expect(screen.getByText('顺行')).toBeInTheDocument()

    await click(screen.getByRole('button', { name: '女' }))
    // A female born in the same 阳年 runs the 大运 the other way.
    expect(screen.getByText('逆行')).toBeInTheDocument()
  })

  it('explains the 晚子时 rule and applies it', async () => {
    await openPillars()
    expect(screen.getByText(/晚子时/)).toBeInTheDocument()

    const afternoonDay = within(chart()).getAllByRole('cell')[2]?.textContent
    await setField(screen.getByLabelText('出生时刻'), '23:30')
    const lateDay = within(chart()).getAllByRole('cell')[2]?.textContent
    expect(lateDay).not.toBe(afternoonDay)
  })

  it('reports an unsupported date instead of crashing', async () => {
    await openPillars({ lastViewedDate: '0001-01-01' })
    const pane = screen.getByRole('region', { name: '八字排盘' })
    expect(within(pane).getByText(/超出历法可推算范围/)).toBeInTheDocument()
    // The four-pillar table is not rendered when the engine refuses the date.
    expect(screen.queryByRole('table', { name: '四柱' })).not.toBeInTheDocument()
  })
})
