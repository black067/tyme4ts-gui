/**
 * 「修改数据目录」那一段取舍的行为契约。
 *
 * 这个模块的全部价值在于它把三种"什么都没发生"分得很清楚：用户在对话框里按取消、选中的地方
 * 不能用、以及搬运本身失败。三种情况在界面上说的是三句不同的话——而它们最初都来自同一个
 * `Promise` 的 reject，很容易写着写着就并成一条"操作失败"。
 *
 * 第二条规则最值得钉：`not-dedicated` 不是苛刻，是因为能力清单里 `$APPDATA/**` 的范围**跟着
 * 数据目录走**（见 `src-tauri/src/paths.rs` 的模块说明），让用户随手指一个混着别的东西的
 * 文件夹，等于把整个文件夹交给 webview 读写。
 *
 * `host.ts` 整块换成假实现：被测的是取舍，不是 Tauri 的对话框与 invoke。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invoke, pick, userData } = vi.hoisted(() => ({
  invoke: vi.fn(),
  pick: vi.fn(),
  userData: vi.fn()
}))

vi.mock('../host', () => ({
  hostInvoke: (command: string, args?: Record<string, unknown>) => invoke(command, args),
  pickDirectory: (defaultPath: string) => pick(defaultPath),
  userDataPath: () => userData()
}))

import { HOST_COMMAND } from '@shared/ipc'
import type { DataDirFacts, DataDirMoveReport } from '@shared/data-dir'
import { moveDataDir, revealDataDir } from '../data-dir'

function facts(overrides: Partial<DataDirFacts> = {}): DataDirFacts {
  return {
    current: 'C:/Users/me/AppData/Roaming/万年历',
    exists: true,
    empty: true,
    marker: false,
    same: false,
    nested: false,
    writable: true,
    ...overrides
  }
}

const REPORT: DataDirMoveReport = {
  from: 'C:/Users/me/AppData/Roaming/万年历',
  to: 'D:/万年历数据',
  copied: 3,
  bytes: 4 * 1024 * 1024,
  removed: 3,
  leftBehind: 0
}

beforeEach(() => {
  invoke.mockReset()
  pick.mockReset()
  userData.mockReset()
  userData.mockResolvedValue('C:/Users/me/AppData/Roaming/万年历')
})

describe('修改数据目录', () => {
  it('在对话框里按取消：一次命令都不该发出去，也不留任何结果', async () => {
    pick.mockResolvedValue(null)

    expect(await moveDataDir()).toEqual({ kind: 'cancelled' })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('非空、又没有本应用的标记 = 不能选，也就绝不发起搬运', async () => {
    pick.mockResolvedValue('D:/下载')
    invoke.mockResolvedValue(facts({ empty: false }))

    expect(await moveDataDir()).toEqual({ kind: 'rejected', reason: 'not-dedicated' })
    expect(invoke.mock.calls.map((call) => call[0])).toEqual([HOST_COMMAND.inspectDataDir])
  })

  it('用过的目录（有标记）即使非空也可以再指回去', async () => {
    pick.mockResolvedValue('D:/万年历数据')
    invoke
      .mockResolvedValueOnce(facts({ empty: false, marker: true }))
      .mockResolvedValueOnce(REPORT)

    expect(await moveDataDir()).toEqual({ kind: 'moved', report: REPORT })
  })

  it('两个命令都只带一个 path 参数', async () => {
    pick.mockResolvedValue('D:/万年历数据')
    invoke.mockResolvedValueOnce(facts()).mockResolvedValueOnce(REPORT)

    await moveDataDir()

    expect(invoke.mock.calls).toEqual([
      [HOST_COMMAND.inspectDataDir, { path: 'D:/万年历数据' }],
      [HOST_COMMAND.setDataDir, { path: 'D:/万年历数据' }]
    ])
  })

  it('套娃比"非空"更该先说：从当前目录里挑了个子目录时，清空格子解决不了问题', async () => {
    pick.mockResolvedValue('C:/data/里面的文件夹')
    invoke.mockResolvedValue(facts({ empty: false, nested: true }))

    expect(await moveDataDir()).toEqual({ kind: 'rejected', reason: 'nested' })
  })

  it('写不进去是"地方不行"，不是"这次没成"', async () => {
    pick.mockResolvedValue('E:/')
    invoke.mockResolvedValue(facts({ writable: false }))

    expect(await moveDataDir()).toEqual({ kind: 'rejected', reason: 'not-writable' })
  })

  it('动手之前宿主再核一遍：它报 not-dedicated 时仍算"换一个地方"', async () => {
    // 从对话框到写盘之间，用户完全可能自己往那个文件夹里放了东西。
    pick.mockResolvedValue('D:/万年历数据')
    invoke.mockResolvedValueOnce(facts()).mockRejectedValueOnce('not-dedicated')

    expect(await moveDataDir()).toEqual({ kind: 'rejected', reason: 'not-dedicated' })
  })

  it('摘要对不上时说的是"数据还在老地方"', async () => {
    pick.mockResolvedValue('D:/万年历数据')
    invoke.mockResolvedValueOnce(facts()).mockRejectedValueOnce('verify')

    expect(await moveDataDir()).toEqual({ kind: 'failed', reason: 'verify' })
  })

  it('认不出来的错误不猜成"地方不行"', async () => {
    pick.mockResolvedValue('D:/万年历数据')
    invoke.mockResolvedValueOnce(facts()).mockRejectedValueOnce(new Error('boom'))

    expect(await moveDataDir()).toEqual({ kind: 'failed', reason: 'unknown' })
  })

  it('当前目录只是对话框的起点，拿不到它也要能继续', async () => {
    userData.mockRejectedValue(new Error('宿主还没答上来'))
    pick.mockResolvedValue(null)

    expect(await moveDataDir()).toEqual({ kind: 'cancelled' })
    expect(pick).toHaveBeenCalledWith('')
  })

  it('浏览走的是那条只开文件的命令', async () => {
    invoke.mockResolvedValue(undefined)

    await revealDataDir()

    expect(invoke.mock.calls).toEqual([[HOST_COMMAND.revealDataDir, undefined]])
  })
})
