// @vitest-environment jsdom
/**
 * 首启那一屏：盘上还没有用户目录，先请用户挑一个位置。
 *
 * 这一屏的测试分两类，缺一类都会留下真实的窟窿：
 *
 * - **看得见路径。** 光有"用户目录"四个字，用户不知道自己以后要去哪儿翻东西。
 * - **一次都不碰盘。** 目录是按下确定之后才建出来的，而这件事在 jsdom 里没有任何副作用
 *   可以观察——只能查这一屏有没有去读设置（读了就等于在一个还没有的目录上动手）。
 *
 * 拒绝理由这里是**写在表单旁边**的一行字，不是右下角那条会自己消失的提示：用户接下来要在
 * 同一个地方改输入，那句理由得留在那儿给他对着读。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { DataDirCandidate, SetupPlanView } from '@shared/data-dir'
import { installFakeBridge, type FakeBridge } from '@renderer/test/fake-bridge'
import { click, renderSetup, setField, toastTexts } from '@renderer/test/harness'
import { SetupApp } from '@renderer/features/setup/SetupApp'

const USER_PATH = 'C:/Users/Tester/AppData/Roaming/万年历'
const EXE_PATH = 'D:/tools/万年历/.chinese-calendar'
const REMEMBERED = 'E:/万年历数据'

/** 一个位置。测试里不建目录，只把路径与"这儿有没有东西、写不写得进去"摆出来。 */
function spot(
  id: DataDirCandidate['id'],
  path: string,
  over: Partial<Pick<DataDirCandidate, 'exists' | 'writable'>> = {}
): DataDirCandidate {
  return { id, path, exists: over.exists ?? false, writable: over.writable ?? true }
}

function plan(over: Partial<SetupPlanView> = {}): SetupPlanView {
  return {
    user: spot('user', USER_PATH),
    exe: spot('exe', EXE_PATH),
    reason: 'first-run',
    recorded: null,
    ...over
  }
}

let bridge: FakeBridge

afterEach(() => {
  cleanup()
  bridge?.restore()
})

describe('选择用户目录那一屏', () => {
  it('两个固定位置旁边印着完整路径，标题也跟着这一屏改', async () => {
    bridge = await renderSetup()

    expect(screen.getByText(USER_PATH)).toBeInTheDocument()
    expect(screen.getByText(EXE_PATH)).toBeInTheDocument()
    // 原生标题栏读的是 document.title（`src-tauri/src/lib.rs` 的 on_document_title_changed）。
    expect(document.title).toBe('万年历 · 选择用户目录')
  })

  it('这一屏一次都不读设置：那儿还没有能读的目录', async () => {
    bridge = await renderSetup()

    // 读设置就等于先在默认位置把一个目录摸出来，而用户还没说他要放哪儿。
    expect(bridge.settingsReads()).toBe(0)
    expect(bridge.patches).toEqual([])
  })

  it('按下确定交出选中的那个位置，并且请宿主重启一次', async () => {
    bridge = await renderSetup()

    await click(screen.getByRole('button', { name: '确定' }))

    expect(bridge.dataDirActions).toEqual(['plan', `choose:${USER_PATH}`, 'relaunch'])
  })

  it('自己填的位置也照样交得出去', async () => {
    bridge = await renderSetup()

    await click(screen.getByRole('radio', { name: /自定义/ }))
    await setField(screen.getByRole('textbox', { name: '自定义' }), 'D:/日历数据')

    await click(screen.getByRole('button', { name: '确定' }))

    expect(bridge.dataDirActions).toContain(`choose:D:/日历数据`)
  })

  it('上次记的位置不在盘上了，就把那个路径原样填回来，而不是让人重找一遍', async () => {
    bridge = await renderSetup(
      {},
      { plan: plan({ reason: 'recorded-missing', recorded: REMEMBERED }) }
    )

    // 那句话与原路径是并排的两个节点（路径自己是一个 `<code>`，为了它能整行断开重排），
    // 所以分开认：合在一起匹配的是元素自己的文本，不是整棵子树。
    expect(screen.getByText('上次记在这里：')).toBeInTheDocument()
    expect(screen.getByText(REMEMBERED)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /自定义/ })).toBeChecked()
    expect(screen.getByRole('textbox', { name: '自定义' })).toHaveValue(REMEMBERED)
    // 插回 U 盘之后按确定就行，所以这时候不该有第二次"问有哪些位置可选"。
    expect(bridge.dataDirActions.filter((action) => action === 'plan')).toEqual(['plan'])
  })

  it('写不进去的那一项是灰的，默认落在按得动的那一项上', async () => {
    bridge = await renderSetup(
      {},
      {
        plan: plan({
          user: spot('user', USER_PATH, { writable: false }),
          exe: spot('exe', EXE_PATH, { exists: true })
        })
      }
    )

    expect(screen.getByRole('radio', { name: /用户目录/ })).toBeDisabled()
    expect(screen.getByText('不能写')).toBeInTheDocument()
    // 把一个按下去注定失败的位置摆成默认值，等于让用户先失败一次才知道要换。
    expect(screen.getByRole('radio', { name: /可执行文件所在目录/ })).toBeChecked()
    // 已有数据是另一回事：选它只会往里写，不会动别人的文件，值得单独标出来。
    expect(screen.getByText('已有数据')).toBeInTheDocument()
  })

  it('没有可执行文件目录可说时（开发机），那一栏干脆不出现', async () => {
    bridge = await renderSetup({}, { plan: plan({ exe: null }) })

    expect(screen.queryByRole('radio', { name: /可执行文件所在目录/ })).toBeNull()
    expect(screen.getByRole('radio', { name: /用户目录/ })).toBeChecked()
  })

  it('浏览按钮把系统对话框选中的路径填进输入框；按取消就什么都不动', async () => {
    bridge = await renderSetup({}, { pick: 'D:/挑好的地方' })

    await click(screen.getByRole('button', { name: '浏览…' }))
    expect(screen.getByRole('textbox', { name: '自定义' })).toHaveValue('D:/挑好的地方')

    // 取消（`pick` 答 null）不是失败，界面上连一句提示都不该有。
    bridge.setDataDir({ pick: null })
    await click(screen.getByRole('button', { name: '浏览…' }))
    expect(screen.getByRole('textbox', { name: '自定义' })).toHaveValue('D:/挑好的地方')
    expect(toastTexts()).toEqual([])
  })

  it('什么都没填的时候确定按钮按不下去', async () => {
    bridge = await renderSetup()

    await click(screen.getByRole('radio', { name: /自定义/ }))

    // 与其让人按一次、等一次往返、再看一句"先填一个路径"，不如一开始就不给按。
    expect(screen.getByRole('button', { name: '确定' })).toBeDisabled()
    expect(bridge.dataDirActions).toEqual(['plan'])
  })

  it('被拒绝时理由是写在表单旁边的一行字，不是右下角那条会消失的提示', async () => {
    bridge = await renderSetup({}, { choose: { kind: 'rejected', reason: 'not-dedicated' } })

    await click(screen.getByRole('button', { name: '确定' }))

    expect(await screen.findByText('换一个空文件夹，或本应用用过的文件夹')).toBeInTheDocument()
    // 用户接下来要在同一个地方改输入：那句理由得留在那儿对着读，而不是几秒后自己走掉。
    expect(toastTexts()).toEqual([])
    // 位置没定下来就不该有第二次启动：那会把一个没选的界面重启成同一个没选的界面。
    expect(bridge.dataDirActions).not.toContain('relaunch')
  })

  it('调试版不自动重启时，那句话留在屏幕上而不是假装在重启', async () => {
    bridge = await renderSetup({}, { relaunch: { kind: 'manual' } })

    await click(screen.getByRole('button', { name: '确定' }))

    expect(await screen.findByText('位置已经记下，重启后生效')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确定' })).toBeEnabled()
  })

  it('问不到可选位置时说实话，而不是摆出两个假路径', async () => {
    bridge = installFakeBridge()
    // 这一条要的恰恰是"没有答复"，所以借完假 bridge 就把 `plan` 换成一条必碎的 promise：
    // 让它随挂载失败，而不是先答好再改口。
    const dataDir = window.tyme.dataDir
    Object.defineProperty(window, 'tyme', {
      value: {
        ...window.tyme,
        dataDir: { ...dataDir, plan: () => Promise.reject(new Error('no host')) }
      },
      configurable: true,
      writable: true
    })
    render(<SetupApp />)

    // 连"有哪些位置可选"都问不到，这一屏能说的只有重开一次：摆两个空路径让人选是骗人。
    expect(await screen.findByText('问不到可用的位置，重开一次试试')).toBeInTheDocument()
  })
})
