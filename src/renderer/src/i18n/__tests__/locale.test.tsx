// @vitest-environment jsdom
/**
 * 语言骨架的接线测试。
 *
 * 这些断言看着琐碎，但它们是"骨架真的接上了"的唯一证据：文案目录存在不等于
 * 界面在用；`<html lang>` 与窗口标题这两处又恰好都不走组件渲染，断言不到就会
 * 悄悄错。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { click, renderApp } from '@renderer/test/harness'
import { screen } from '@testing-library/react'

afterEach(() => {
  document.documentElement.removeAttribute('lang')
  document.documentElement.removeAttribute('data-locale')
  document.title = ''
})

describe('语言骨架接线', () => {
  it('把语言写到 <html lang> 与 data-locale 上', async () => {
    await renderApp()

    expect(document.documentElement.lang).toBe('zh-Hans')
    expect(document.documentElement.dataset.locale).toBe('zh-Hans')
  })

  it('窗口标题带上版本号（Electron 用它推导原生标题栏）', async () => {
    await renderApp()

    // 版本来自 fake bridge 的 app:get-info，是异步的，等它落地。
    expect(document.title).toBe('万年历 v0.0.0-test')
  })

  it('设置页里能选语言，并写回主进程', async () => {
    const bridge = await renderApp()

    await click(screen.getByRole('button', { name: '设置' }))

    // 语言分区以它的标题作为 SegmentedControl 的无障碍标签。
    expect(screen.getByRole('region', { name: '设置' })).toBeInTheDocument()

    const chinese = screen.getByRole('button', { name: '简体中文' })
    // 当前语言要被标成选中，否则"设置了但没生效"也能通过。
    expect(chinese).toHaveAttribute('aria-pressed', 'true')

    await click(chinese)

    expect(bridge.patches).toContainEqual({ locale: 'zh-Hans' })
  })

  it('界面文案取自目录，而不是散落在组件里', async () => {
    await renderApp()

    // 这几个字符串同时出现在 App 与设置页，改目录就能全改。
    expect(screen.getByRole('button', { name: '设置' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '月视图' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '主视图切换' })).toBeInTheDocument()
  })
})
