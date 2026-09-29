// @vitest-environment jsdom
/**
 * 节假日小节的接线测试。
 *
 * 这块的价值全在「说清楚数据从哪来、什么时候更新的」，所以断言的重点是
 * 来源链接、更新时间和「没有数据时不冒充有数据」。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, screen } from '@testing-library/react'
import { click, renderApp } from '@renderer/test/harness'

afterEach(cleanup)

async function openSettings(): Promise<void> {
  await click(screen.getByRole('button', { name: '设置' }))
  await screen.findByRole('heading', { name: '设置' })
}

describe('节假日数据小节', () => {
  it('没有数据时不冒充有数据', async () => {
    await renderApp()
    await openSettings()

    expect(screen.getByText('尚未更新过。')).toBeInTheDocument()
    // 没有覆盖年份时不该出现年份行。
    expect(screen.queryByText(/已覆盖年份/)).toBeNull()
  })

  it('更新成功后显示年份、时间与国务院公告链接', async () => {
    const bridge = await renderApp()
    await openSettings()

    act(() => {
      bridge.setHolidayStatus({
        years: [2026, 2027],
        lastUpdatedAt: '2026-09-29T10:00:00.000Z',
        papers: ['https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm']
      })
    })

    expect(screen.getByText(/已覆盖年份/)).toBeInTheDocument()
    expect(screen.getByText(/2026、2027/)).toBeInTheDocument()
    expect(screen.getByText(/上次更新：/)).toBeInTheDocument()

    // 主源是关键：数据出自国务院公告，要能一键核对。
    const paper = screen.getByRole('link', {
      name: 'https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm'
    })
    expect(paper).toHaveAttribute('target', '_blank')
  })

  it('点击立即更新会请求主进程', async () => {
    const bridge = await renderApp()
    await openSettings()

    await click(screen.getByRole('button', { name: '立即更新' }))

    expect(bridge.holidayActions).toContain('refresh')
  })

  it('刷新中禁用按钮并改文案', async () => {
    const bridge = await renderApp()
    await openSettings()

    act(() => {
      bridge.setHolidayStatus({ refreshing: true })
    })

    expect(screen.getByRole('button', { name: '正在更新…' })).toBeDisabled()
  })

  it('拉取失败时保留已有数据，只提示错误', async () => {
    const bridge = await renderApp()
    await openSettings()

    act(() => {
      bridge.setHolidayStatus({
        years: [2026],
        lastUpdatedAt: '2026-09-29T10:00:00.000Z',
        errorCode: 'network'
      })
    })

    // 关键点：报错的同时年份仍在——旧数据比没有数据有用得多。
    // 用完整句子匹配，`/2026/` 会同时命中月视图的日期格子。
    expect(screen.getByText('已覆盖年份：2026')).toBeInTheDocument()
    expect(screen.getByText('无法获取节假日数据，将继续使用已有数据。')).toBeInTheDocument()
  })

  it('时间戳被改坏时不显示 Invalid Date', async () => {
    const bridge = await renderApp()
    await openSettings()

    act(() => {
      bridge.setHolidayStatus({ lastUpdatedAt: '不是时间' })
    })

    expect(screen.queryByText(/Invalid Date/)).toBeNull()
    expect(screen.getByText('尚未更新过。')).toBeInTheDocument()
  })
})
