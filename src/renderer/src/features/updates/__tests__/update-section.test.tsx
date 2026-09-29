// @vitest-environment jsdom
/**
 * 更新小节的接线测试。
 *
 * 重点是「主进程推状态 → 界面跟着变」这条链路：只断言能渲染出按钮没有意义，
 * 真正容易坏的是订阅（少订阅一次就永远停在首帧）与按钮的可用状态。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { act } from '@testing-library/react'
import { click, renderApp } from '@renderer/test/harness'

afterEach(cleanup)

/** 打开设置页并等它渲染出来。 */
async function openSettings(): Promise<void> {
  await click(screen.getByRole('button', { name: '设置' }))
  await screen.findByRole('heading', { name: '设置' })
}

describe('更新小节', () => {
  it('显示当前版本，并给出检查按钮', async () => {
    await renderApp()
    await openSettings()

    expect(screen.getByText('当前版本 0.0.0-test')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '检查更新' })).toBeInTheDocument()
    // 从未检查过时不能编一个时间出来。
    expect(screen.getByText('尚未检查过')).toBeInTheDocument()
  })

  it('点击检查会请求主进程', async () => {
    const bridge = await renderApp()
    await openSettings()

    await click(screen.getByRole('button', { name: '检查更新' }))

    expect(bridge.updateActions).toContain('check')
  })

  it('发现新版本时给出下载入口', async () => {
    const bridge = await renderApp()
    await openSettings()

    // 主进程推送「有新版本」。
    act(() => {
      bridge.setUpdates({ phase: 'available', latestVersion: '9.9.9' })
    })

    expect(screen.getByText('发现新版本 9.9.9')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下载更新' })).toBeInTheDocument()
    // 还没下载完，就不该出现安装按钮。
    expect(screen.queryByRole('button', { name: '重启并安装' })).toBeNull()
  })

  it('下载中显示进度并可取消', async () => {
    const bridge = await renderApp()
    await openSettings()

    act(() => {
      bridge.setUpdates({
        phase: 'downloading',
        latestVersion: '9.9.9',
        progress: { transferred: 25, total: 100 }
      })
    })

    expect(screen.getByText('正在下载 25%')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '取消下载' })).toBeInTheDocument()
    // 下载中不允许再点检查，避免并发请求。
    expect(screen.getByRole('button', { name: '检查更新' })).toBeDisabled()
  })

  it('下载完成后给出重启安装', async () => {
    const bridge = await renderApp()
    await openSettings()

    act(() => {
      bridge.setUpdates({ phase: 'ready', latestVersion: '9.9.9', canInstall: true })
    })

    const install = screen.getByRole('button', { name: '重启并安装' })
    await click(install)

    expect(bridge.updateActions).toContain('install')
  })

  it('出错时按错误码给出对应说法', async () => {
    const bridge = await renderApp()
    await openSettings()

    act(() => {
      bridge.setUpdates({ phase: 'error', errorCode: 'checksum-mismatch' })
    })

    // 校验失败要说清楚「已丢弃」，否则用户会以为装上了。
    expect(screen.getByText('下载文件的校验值不符，已丢弃，请重试。')).toBeInTheDocument()
  })

  it('已是最新时明说，不留悬念', async () => {
    const bridge = await renderApp()
    await openSettings()

    act(() => {
      bridge.setUpdates({ phase: 'up-to-date' })
    })

    expect(screen.getByText('已是最新版本。')).toBeInTheDocument()
  })
})
