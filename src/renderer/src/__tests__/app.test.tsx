// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import type { AppSettings } from '@shared/ipc'
import type { FakeBridge } from '../test/fake-bridge'
import { click, renderApp, setField, toastTexts, waitForToasts } from '../test/harness'

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

  it('switches theme and appearance through the settings screen', async () => {
    await setup()
    await click(screen.getByRole('button', { name: '设置' }))

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
})

describe('settings screen', () => {
  async function openSettings(): Promise<void> {
    await setup()
    await click(screen.getByRole('button', { name: '设置' }))
  }

  it('opens as a separate screen and hides the calendar', async () => {
    await openSettings()

    expect(screen.getByRole('region', { name: '设置' })).toBeInTheDocument()
    // The month view and the day panel give way to the settings screen.
    expect(screen.queryByRole('heading', { name: '2024年6月' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '日详情' })).not.toBeInTheDocument()
  })

  it('closes again from the 返回 button', async () => {
    await openSettings()
    await click(screen.getByRole('button', { name: '返回' }))
    expect(screen.getByRole('heading', { name: '2024年6月' })).toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    await openSettings()
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(screen.getByRole('heading', { name: '2024年6月' })).toBeInTheDocument()
  })

  it('shows the version, author and runtime from the host', async () => {
    await openSettings()

    // 这些只读信息同属一个「关于」区块：版本、作者、运行时、数据目录。
    // 版本号在这里只出现一次——「更新」区块有它自己的版本号。
    expect(await screen.findByText('0.0.0-test')).toBeInTheDocument()
    expect(screen.getByText('Tester <tester@example.com>')).toBeInTheDocument()
    expect(screen.getByText(/Tauri 0\.0\.0-test · WebView2 0\.0\.0-test/)).toBeInTheDocument()
  })

  it('lists third-party licences and the asset credit', async () => {
    await openSettings()

    expect(screen.getByRole('heading', { name: '第三方许可' })).toBeInTheDocument()
    expect(screen.getByText('tyme4ts')).toBeInTheDocument()
    expect(screen.getByText('@tanstack/react-virtual')).toBeInTheDocument()
    // Each entry links to its upstream project.
    expect(
      screen.getByRole('link', { name: 'https://github.com/6tail/tyme4ts' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'https://github.com/tauri-apps/tauri' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'https://github.com/TanStack/virtual' })
    ).toBeInTheDocument()

    expect(screen.getByRole('heading', { name: '资产署名' })).toBeInTheDocument()
    expect(screen.getByText(/paomedia \(Arnaud\)/)).toBeInTheDocument()
    expect(screen.getByText('assets/calendar.svg')).toBeInTheDocument()
  })

  it('shows where the data lives', async () => {
    await openSettings()

    // 只保留数据目录：settings.json 的完整路径只是把文件名接在目录后面，
    // 与上一行重复，看的人还得自己比对两行。
    expect(screen.getByText('/tmp/tyme-app-test')).toBeInTheDocument()
  })

  it('数据目录那一行挂着浏览与修改两个动作', async () => {
    await openSettings()

    await click(screen.getByRole('button', { name: '浏览' }))
    await click(screen.getByRole('button', { name: '修改' }))

    expect(bridge.dataDirActions).toEqual(['reveal', 'move'])
  })

  it('搬完了说的是正在重启：这一次进程里的读写还在旧目录', async () => {
    await openSettings()
    bridge.setDataDirMove({
      kind: 'moved',
      report: {
        from: '/tmp/tyme-app-test',
        to: 'D:/万年历数据',
        copied: 3,
        bytes: 4 * 1024 * 1024,
        removed: 3,
        leftBehind: 0
      }
    })

    await click(screen.getByRole('button', { name: '修改' }))

    const notes = await waitForToasts()
    expect(notes).toContain('已搬到 D:/万年历数据，正在重启')
    // 指向只能在进程开始之前定下来，所以"搬好了"必须接着说"正在重启"；只报前一半，
    // 用户会以为现在改的设置已经写进新目录了。
    expect(bridge.dataDirActions).toContain('relaunch')
    // 旧目录没打扫干净是另一句话，别混进"搬好了"那条里。
    expect(notes.join(' ')).not.toMatch(/没删掉/)
  })

  it('旧目录没打扫干净时单独说一句，并且不把责任推给"重启后"', async () => {
    await openSettings()
    bridge.setDataDirMove({
      kind: 'moved',
      report: {
        from: '/tmp/tyme-app-test',
        to: 'D:/万年历数据',
        copied: 3,
        bytes: 4 * 1024 * 1024,
        removed: 2,
        leftBehind: 1
      }
    })

    await click(screen.getByRole('button', { name: '修改' }))

    const notes = await waitForToasts()
    expect(notes).toContain('已搬到 D:/万年历数据，正在重启')
    // 数字要说得出来：那是一个还得自己删一次的文件夹。
    expect(notes).toContain('旧目录还剩 1 个文件')
  })

  it('拒绝一个混着别的东西的文件夹时，说的是换一处，而不是"出错了请重试"', async () => {
    await openSettings()
    bridge.setDataDirMove({ kind: 'rejected', reason: 'not-dedicated' })

    await click(screen.getByRole('button', { name: '修改' }))

    expect(await waitForToasts()).toContain('换一个空文件夹，或本应用用过的文件夹')
  })

  it('在对话框里按取消什么提示都不留', async () => {
    await openSettings()
    bridge.setDataDirMove({ kind: 'cancelled' })

    await click(screen.getByRole('button', { name: '修改' }))

    expect(toastTexts()).toEqual([])
    expect(document.querySelector('.settings-row__note')).toBeNull()
  })

  it('删除要按两下，第一下只把要做什么写在路径下面', async () => {
    await openSettings()
    const remove = screen.getByRole('button', { name: '删除' })

    await click(remove)

    // 第一下不碰盘：一次误触的代价是整个目录，而这一屏上没有撤销。
    expect(bridge.dataDirActions).toEqual([])
    // 要做什么写在路径下面，不在屏幕另一个角落：用户得对着这一行确认自己在删哪个目录。
    expect(screen.getByText(/回到选择位置那一屏/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认删除' })).toBeInTheDocument()

    await click(screen.getByRole('button', { name: '确认删除' }))

    expect(bridge.dataDirActions).toContain('remove')
    expect(await waitForToasts()).toContain('数据已移到回收站，正在重启')
  })

  it('persists the start view choice', async () => {
    await openSettings()
    // Scoped to the settings region: 年视图 also exists as a toolbar tab.
    const pane = screen.getByRole('region', { name: '设置' })
    await click(within(pane).getByRole('button', { name: '年视图' }))
    expect(bridge.patches.some((patch) => patch.defaultView === 'year')).toBe(true)
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
    expect(await screen.findByRole('heading', { name: '2024年7月' })).toBeInTheDocument()

    await press('PageUp')
    expect(await screen.findByRole('heading', { name: '2024年6月' })).toBeInTheDocument()

    await press('PageDown', { shiftKey: true })
    expect(await screen.findByRole('heading', { name: '2025年6月' })).toBeInTheDocument()
  })

  it('returns to today with T', async () => {
    await setup()
    await press('PageDown')
    expect(await screen.findByRole('heading', { name: '2024年7月' })).toBeInTheDocument()

    await press('t')
    expect(await screen.findByRole('heading', { name: /^2026年/ })).toBeInTheDocument()
  })

  it('switches views with Alt+number', async () => {
    await setup()

    await press('3', { altKey: true })
    expect(await screen.findByRole('heading', { name: '时间轴' })).toBeInTheDocument()

    await press('2', { altKey: true })
    expect(await screen.findByRole('heading', { name: /年$/ })).toBeInTheDocument()

    await press('1', { altKey: true })
    expect(await screen.findByRole('heading', { name: '2024年6月' })).toBeInTheDocument()
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
