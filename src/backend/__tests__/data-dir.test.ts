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

import { HOST_COMMAND, RESTART_REFUSED } from '@shared/ipc'
import type { DataDirFacts, DataDirMoveReport, SetupPlanView } from '@shared/data-dir'
import {
  chooseDataDir,
  deleteDataDir,
  moveDataDir,
  pickDataDir,
  relaunchDataDir,
  revealDataDir,
  setupPlan
} from '../data-dir'

function facts(overrides: Partial<DataDirFacts> = {}): DataDirFacts {
  return {
    current: 'C:/Users/me/AppData/Roaming/万年历',
    exists: true,
    empty: true,
    marker: false,
    settings: false,
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

/** 首启那一屏拿到的原料：两条命令，一条问位置，一条定位置。 */
const PLAN: SetupPlanView = {
  user: {
    id: 'user',
    path: 'C:/Users/me/AppData/Roaming/万年历',
    exists: false,
    writable: true
  },
  exe: { id: 'exe', path: 'D:/tools/万年历/.chinese-calendar', exists: false, writable: true },
  reason: 'first-run',
  recorded: null
}

describe('首启选定位置', () => {
  it('问原料只发一条命令，不带参数', async () => {
    invoke.mockResolvedValue(PLAN)

    expect(await setupPlan()).toEqual(PLAN)
    expect(invoke.mock.calls).toEqual([[HOST_COMMAND.setupPlan, undefined]])
  })

  it('先看事实再动手：两条命令都只带那一个 path', async () => {
    invoke.mockResolvedValueOnce(facts({ exists: false })).mockResolvedValueOnce(PLAN.user.path)

    await chooseDataDir(PLAN.user.path)

    expect(invoke.mock.calls).toEqual([
      [HOST_COMMAND.inspectDataDir, { path: PLAN.user.path }],
      [HOST_COMMAND.chooseDataDir, { path: PLAN.user.path }]
    ])
  })

  it('选中默认位置时 same 不是理由：那一刻还没有"当前目录"可言', async () => {
    // 这一屏最希望发生的就是"东西落在 %APPDATA%\万年历"。拿搬运那套判据来拦，
    // 等于把用户最可能选的那一项拒之门外。
    invoke.mockResolvedValueOnce(facts({ same: true, nested: true })).mockResolvedValueOnce('x')

    expect(await chooseDataDir(PLAN.user.path)).toEqual({ kind: 'chosen', path: 'x' })
  })

  it('混着别的东西的文件夹不建第二份证据也不动：只看 empty / marker / settings', async () => {
    pick.mockResolvedValue('D:/下载')
    invoke.mockResolvedValue(facts({ empty: false }))

    expect(await chooseDataDir('D:/下载')).toEqual({ kind: 'rejected', reason: 'not-dedicated' })
    // 这条命令是全仓库唯一会建用户目录的地方，被拦下时必须一次都没发出去。
    expect(invoke.mock.calls.map((call) => call[0])).toEqual([HOST_COMMAND.inspectDataDir])
  })

  it('老目录没有标记文件，那份 settings.json 是它的第二份证据', async () => {
    invoke.mockResolvedValueOnce(facts({ empty: false, settings: true })).mockResolvedValueOnce('x')

    expect(await chooseDataDir('D:/老数据').then((o) => o.kind)).toBe('chosen')
  })

  it('磁盘根由宿主拦：回来的 is-root 是"换个位置"那个形状', async () => {
    invoke.mockRejectedValue('is-root')

    expect(await chooseDataDir('E:/')).toEqual({ kind: 'rejected', reason: 'is-root' })
  })

  it('写不进去是"地方不行"，不是"这次没成"', async () => {
    invoke.mockResolvedValue(facts({ writable: false }))

    expect(await chooseDataDir('E:/')).toEqual({ kind: 'rejected', reason: 'not-writable' })
  })

  it('认不出来的错误不猜成"地方不行"', async () => {
    invoke.mockResolvedValueOnce(facts()).mockRejectedValueOnce(new Error('boom'))

    expect(await chooseDataDir('D:/万年历数据')).toEqual({ kind: 'failed', reason: 'unknown' })
  })

  it('浏览只是问一个路径，它不授予任何读写权限', async () => {
    pick.mockResolvedValue('D:/挑好的地方')

    expect(await pickDataDir()).toBe('D:/挑好的地方')
    expect(pick).toHaveBeenCalledWith('C:/Users/me/AppData/Roaming/万年历')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('当前目录还没定下来时，浏览照样能开（起点只是个起点）', async () => {
    userData.mockRejectedValue(new Error('还没有用户目录'))
    pick.mockResolvedValue(null)

    expect(await pickDataDir()).toBeNull()
    expect(pick).toHaveBeenCalledWith('')
  })
})

describe('删除用户数据', () => {
  it('成功就是"进了回收站 + 那个路径"', async () => {
    invoke.mockResolvedValue('C:/Users/me/AppData/Roaming/万年历')

    expect(await deleteDataDir()).toEqual({
      kind: 'deleted',
      path: 'C:/Users/me/AppData/Roaming/万年历'
    })
    expect(invoke.mock.calls).toEqual([[HOST_COMMAND.deleteDataDir, undefined]])
  })

  it('U 盘上没有回收站：这不是"换个位置"，是这次删不成', async () => {
    invoke.mockRejectedValue('no-recycle-bin')

    expect(await deleteDataDir()).toEqual({ kind: 'failed', reason: 'no-recycle-bin' })
  })

  it('有文件被占用时说的是关掉它，而不是把整个目录删了', async () => {
    invoke.mockRejectedValue('busy')

    expect(await deleteDataDir()).toEqual({ kind: 'failed', reason: 'busy' })
  })

  it('目录已经不在了不必吓人：按失败处理，界面上那句"还在原处"不说', async () => {
    invoke.mockRejectedValue('missing')

    expect(await deleteDataDir()).toEqual({ kind: 'failed', reason: 'missing' })
  })

  it('根目录是"地方不对"那一句：删下去收不回来的是整块盘', async () => {
    invoke.mockRejectedValue('is-root')

    expect(await deleteDataDir()).toEqual({ kind: 'rejected', reason: 'is-root' })
  })

  it('错误码后面跟着细节也认得：取冒号前面那一段', async () => {
    // 宿主目前只回裸码（`paths.rs` 那批 `ERR_*`），但错误串是最容易被改长的东西：
    // 有人某天加一句 os error 5，判据不该跟着变成"认不出来"。
    invoke.mockRejectedValue('busy: 3 个文件正被占用')

    expect(await deleteDataDir()).toEqual({ kind: 'failed', reason: 'busy' })
  })
})

describe('重启一次让指向生效', () => {
  it('按规矩重启成了就不必再说别的', async () => {
    invoke.mockResolvedValue(undefined)

    expect(await relaunchDataDir()).toEqual({ kind: 'restarting' })
    expect(invoke.mock.calls).toEqual([[HOST_COMMAND.relaunch, undefined]])
  })

  it('调试版拒绝自动重启，那不是失败', async () => {
    invoke.mockRejectedValue(RESTART_REFUSED)

    // 位置已经记下来了，只差用户自己重开一次。收成 failed 会让界面说"失败了"，
    // 而实际上没有东西坏掉。
    expect(await relaunchDataDir()).toEqual({ kind: 'manual' })
  })

  it('真的起不来时不假装是调试版', async () => {
    invoke.mockRejectedValue('failed')

    expect(await relaunchDataDir()).toEqual({ kind: 'failed' })
  })
})
