// @vitest-environment jsdom
/**
 * 更新小节的接线测试。
 *
 * 重点是「后端推状态 → 界面跟着变」这条链路，以及「已是最新」是**标记**而不是
 * 一句话——那是刻意的排版决定，顺手用测试钉住。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, screen } from '@testing-library/react'
import { click, renderApp, toastTexts } from '@renderer/test/harness'

afterEach(cleanup)

async function openSettings(): Promise<void> {
  await click(screen.getByRole('button', { name: '设置' }))
  await screen.findByRole('heading', { name: '设置' })
}

describe('更新小节', () => {
  it('显示当前版本与检查按钮，从未检查时说明未检查', async () => {
    await renderApp()
    await openSettings()

    expect(screen.getByText('v0.0.0-test')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '检查更新' })).toBeInTheDocument()
    expect(screen.getByText('尚未检查过')).toBeInTheDocument()
  })

  it('已是最新时只给一个小标记，不再单起一行说明', async () => {
    const bridge = await renderApp()
    await openSettings()

    act(() => {
      bridge.setUpdates({ phase: 'up-to-date' })
    })

    expect(screen.getByText('最新')).toBeInTheDocument()
  })

  it('版本号与检查按钮、时间戳在同一行里', async () => {
    await renderApp()
    await openSettings()

    // 时间戳与按钮同行：它是这次操作的上下文，不该另起一行占位。
    // 两处都必须在**同一个** .updates__row 内查询——把时间戳挪出这一行应当让
    // 测试失败，否则这条测的就不是「同行」。
    const row = document.querySelector('.updates__row')
    expect(row).not.toBeNull()
    expect(row?.querySelector('button')).not.toBeNull()
    expect(row?.querySelector('.updates__stamp')).not.toBeNull()
    expect(screen.getByText(/上次检查|尚未检查过/)).toBeInTheDocument()
  })

  it('点击检查会请求后端', async () => {
    const bridge = await renderApp()
    await openSettings()

    await click(screen.getByRole('button', { name: '检查更新' }))

    expect(bridge.updateActions).toContain('check')
  })

  it('发现新版本时把新版本号显示出来，并给出下载入口', async () => {
    const bridge = await renderApp()
    await openSettings()

    act(() => {
      bridge.setUpdates({ phase: 'available', latestVersion: '9.9.9' })
    })

    expect(screen.getByText('v9.9.9')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下载' })).toBeInTheDocument()
    // 还没下载完，就不该出现安装按钮。
    expect(screen.queryByRole('button', { name: '重启并安装' })).toBeNull()
  })

  it('下载中显示进度并可取消，且不能重复点检查', async () => {
    const bridge = await renderApp()
    await openSettings()

    act(() => {
      bridge.setUpdates({
        phase: 'downloading',
        latestVersion: '9.9.9',
        progress: { transferred: 25, total: 100 }
      })
    })

    expect(screen.getByRole('button', { name: '下载中 25%' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument()
  })

  it('下载完成后给出重启安装', async () => {
    const bridge = await renderApp()
    await openSettings()

    act(() => {
      bridge.setUpdates({ phase: 'ready', latestVersion: '9.9.9', canInstall: true })
    })

    await click(screen.getByRole('button', { name: '重启并安装' }))

    expect(bridge.updateActions).toContain('install')
  })

  it('出错时按错误码给出对应说法', async () => {
    const bridge = await renderApp()
    await openSettings()

    act(() => {
      bridge.setUpdates({ phase: 'error', errorCode: 'checksum-mismatch' })
    })

    // 校验失败要说清楚「已丢弃」，否则用户会以为装上了。说法走 toast：一次失败不该在
    // 这一页留下擦不掉的痕迹（切走再回来，那段红的还在那儿）。
    expect(toastTexts()).toContain('校验不符，已丢弃')
  })

  it('目录写不进去要说成一件做得完的事，而不是「启动失败」', async () => {
    const bridge = await renderApp()
    await openSettings()

    act(() => {
      bridge.setUpdates({ phase: 'error', errorCode: 'target-not-writable' })
    })

    // 这一条的代价是"把程序挪个地方"，混进 install-failed 就没人知道该改什么。
    expect(toastTexts()).toContain('程序所在位置不能写，换个文件夹再更新')
  })

  it('发现新版本时就写出要替换的是哪个文件，不必等下载完', async () => {
    const bridge = await renderApp()
    await openSettings()

    act(() => {
      bridge.setUpdates({ phase: 'available', latestVersion: '9.9.9' })
    })

    // 便携版没有「装到哪里」可选：更新就是把用户双击的那一个文件换掉。
    // 这条同时也是 `update_context` 那条命令在界面上的落点——它没答上来时这里应当是空的。
    expect(screen.getByText(/^安装位置：/)).toBeInTheDocument()
  })

  it('刚更新完的那一次说一声现在是什么版本', async () => {
    const bridge = await renderApp()
    await openSettings()

    // 原地替换之后文件名不变，版本号是唯一能自证「换了」的信号。
    act(() => {
      bridge.setUpdates({ updatedFrom: '0.1.4' })
    })

    // 说完就走：这是一次发生过的事件，不是这一页此后一直成立的状态。
    expect(toastTexts()).toContain('已更新到 v0.0.0-test')
  })
})
