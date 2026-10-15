/**
 * 「重启并安装」那一段状态机的行为契约。
 *
 * 为什么单独立一个文件：这一段的旧实现是
 *
 * ```ts
 * void hostInvoke(HOST_COMMAND.installUpdate, { fileName }).catch(() => fail('install-failed'))
 * return setState({ phase: 'idle', canInstall: false })
 * ```
 *
 * ——它把结果整个吞掉：进程关了没重开、为什么没换成，谁也不知道。类型检查与界面测试都抓不住它，
 * 因为每个分支看起来都"合规"。能抓住它的只有"失败必须留下可见后果"这条行为断言。
 *
 * `host.ts` 是唯一允许直接 import `@tauri-apps/*` 的文件（见 `tests/host-boundary.test.ts`），
 * 所以这里把它整块换成假实现：被测的是状态机本身，不是 Tauri 的 invoke。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invoke, httpFetch } = vi.hoisted(() => ({ invoke: vi.fn(), httpFetch: vi.fn() }))

vi.mock('../host', () => ({
  appVersionCached: () => '0.1.4',
  hostInvoke: (command: string, args?: Record<string, unknown>) => invoke(command, args),
  hostListen: () => (): void => undefined,
  httpFetch: (input: string, init?: RequestInit) => httpFetch(input, init)
}))

import { HOST_COMMAND } from '@shared/ipc'
import {
  checkForUpdates,
  downloadUpdate,
  getUpdateState,
  installUpdate,
  primeUpdaterContext
} from '../updater'

const DIGEST = 'a'.repeat(64)
const ASSET = 'chinese-calendar-0.2.0-portable.exe'

/** `/releases` 的一个正常应答：一条正式版，带一个可装产物。 */
function releasesBody(): string {
  return JSON.stringify([
    {
      tag_name: 'v0.2.0',
      name: 'v0.2.0',
      html_url: 'https://github.com/black067/tyme4ts-gui/releases/tag/v0.2.0',
      body: '更新说明',
      draft: false,
      prerelease: false,
      assets: [
        {
          name: ASSET,
          size: 10_327_040,
          digest: `sha256:${DIGEST}`,
          browser_download_url: `https://example.invalid/${ASSET}`
        }
      ]
    }
  ])
}

/** 走到「已下载、可安装」那一步。安装的所有用例都从这里出发。 */
async function readyToInstall(): Promise<void> {
  httpFetch.mockResolvedValue({ status: 200, text: async () => releasesBody() })
  invoke.mockImplementation(async (command: string) =>
    command === HOST_COMMAND.downloadUpdate ? DIGEST : undefined
  )
  await checkForUpdates()
  await downloadUpdate()
  expect(getUpdateState().canInstall).toBe(true)
  invoke.mockReset()
}

beforeEach(() => {
  invoke.mockReset()
  httpFetch.mockReset()
})

describe('安装把结果说出来，而不是吞掉', () => {
  it('安装时把 fileName 与判据摘要一起交下去', async () => {
    await readyToInstall()
    invoke.mockResolvedValue(undefined)

    await installUpdate()

    expect(invoke).toHaveBeenCalledWith(HOST_COMMAND.installUpdate, {
      fileName: ASSET,
      sha256: DIGEST
    })
  })

  it('成功之后收起可安装状态（进程马上就要没了）', async () => {
    await readyToInstall()
    invoke.mockResolvedValue(undefined)

    const state = await installUpdate()

    expect([state.phase, state.canInstall]).toEqual(['idle', false])
  })

  it('目标目录不可写：报专门的码，并且留着按钮让人重试', async () => {
    await readyToInstall()
    invoke.mockRejectedValue('target-not-writable')

    const state = await installUpdate()

    expect([state.phase, state.errorCode]).toEqual(['error', 'target-not-writable'])
    // 这一条是这个文件存在的理由之一：失败不能把"已经下载好的 10 MB"一起丢掉。
    expect(state.canInstall, '重试不该等于重下一遍').toBe(true)
    expect(invoke).not.toHaveBeenCalledWith(HOST_COMMAND.deleteUpdate, expect.anything())
  })

  it('摘要不符才真的丢掉那份字节：它已经不干净了', async () => {
    await readyToInstall()
    invoke.mockRejectedValue('checksum-mismatch')

    const state = await installUpdate()

    expect([state.phase, state.errorCode, state.canInstall]).toEqual([
      'error',
      'checksum-mismatch',
      false
    ])
    expect(invoke).toHaveBeenCalledWith(HOST_COMMAND.deleteUpdate, { fileName: ASSET })
  })

  it('认不出的失败码退回 install-failed，但不删文件', async () => {
    await readyToInstall()
    invoke.mockRejectedValue('some-new-rust-string')

    const state = await installUpdate()

    expect([state.errorCode, state.canInstall]).toEqual(['install-failed', true])
    expect(invoke).not.toHaveBeenCalledWith(HOST_COMMAND.deleteUpdate, expect.anything())
  })

  it('还没下载好就按安装：直接失败，不去动磁盘', async () => {
    httpFetch.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify([
          {
            tag_name: 'v0.2.0',
            draft: false,
            prerelease: false,
            assets: [
              {
                name: ASSET,
                size: 1,
                digest: null,
                browser_download_url: `https://example.invalid/${ASSET}`
              }
            ]
          }
        ])
    })
    await checkForUpdates()

    const state = await installUpdate()

    expect(state.errorCode).toBe('install-failed')
    expect(invoke).not.toHaveBeenCalled()
  })
})

describe('本机事实落在状态里', () => {
  it('primeUpdaterContext 把安装位置与来源版本并进快照', async () => {
    invoke.mockResolvedValue({ installPath: 'D:\\apps\\calendar.exe', updatedFrom: '0.1.4' })

    await primeUpdaterContext()

    const state = getUpdateState()
    expect([state.installPath, state.updatedFrom]).toEqual(['D:\\apps\\calendar.exe', '0.1.4'])
  })

  it('拿不到就不改状态：这一句不该变成界面上的红字', async () => {
    // 断言"没变动"而不是"errorCode 为 null"：模块级状态在同一文件里是连续的，
    // 上一条用例留下的错误态不该被这里重新解释。
    const before = getUpdateState()
    invoke.mockRejectedValue('nope')

    await primeUpdaterContext()

    const after = getUpdateState()
    expect(after.errorCode).toBe(before.errorCode)
    expect(after.installPath).toBe(before.installPath)
  })
})
