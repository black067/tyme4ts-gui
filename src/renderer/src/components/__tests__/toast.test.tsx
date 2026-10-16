// @vitest-environment jsdom
/**
 * toast 那一层自己的测试。
 *
 * 它只管三件事：说一句话、待几秒钟、自己走。文案不归它管（那是各个功能的事），
 * 所以这里测的全是"话是怎么挂上去、怎么没的"——而那几条恰恰是最容易被 later 的改动碰坏的：
 * 去重写坏了会变成同一句话刷三遍，定时写坏了会挡住后面的操作，卸载清理写坏了会在
 * jsdom 关掉之后往已卸载的组件里 setState。
 */
import { useEffect, type ReactElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { toastTexts } from '@renderer/test/harness'
import { StaticLocaleProvider } from '@renderer/i18n'
import { ToastProvider } from '@renderer/components/ToastProvider'
import { useToast, type ToastTone } from '@renderer/components/toast-context'

/** 一句话，一个语气：测试用它把消息送进这层。 */
function Talk({ text, tone }: { text: string; tone?: ToastTone }): ReactElement {
  const toast = useToast()
  useEffect(() => {
    toast.notify(text, tone)
  }, [toast, text, tone])
  return <span />
}

function withToasts(children: ReactNode): ReactNode {
  return (
    <StaticLocaleProvider>
      <ToastProvider>{children}</ToastProvider>
    </StaticLocaleProvider>
  )
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('应用内提示', () => {
  it('把那句话挂到右下角，并且是一条活动区', () => {
    render(withToasts(<Talk text="已搬到 D:/万年历数据，正在重启" />))

    expect(toastTexts()).toEqual(['已搬到 D:/万年历数据，正在重启'])
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('空串与全空白不算一句话，不占位置', () => {
    render(withToasts(<Talk text="   " />))

    expect(toastTexts()).toEqual([])
    // 容器本身要一直挂着：读屏器得先看见这个区域，之后往里加的句子才会被念出来。
    expect(document.querySelector('.toast-stack')).not.toBeNull()
  })

  it('同一句话不重复挂第二遍', () => {
    render(
      withToasts(
        <>
          <Talk text="连不上 GitHub，稍后再试" />
          <Talk text="连不上 GitHub，稍后再试" />
        </>
      )
    )

    // 顶掉第一条会更糟：那看起来像"又失败了一次"，而实际上只是同一句的第二遍。
    expect(toastTexts()).toEqual(['连不上 GitHub，稍后再试'])
  })

  it('语气写进类名，坏消息不能长得像好消息', () => {
    render(
      withToasts(
        <>
          <Talk text="下载完成" />
          <Talk text="校验不符，已丢弃" tone="error" />
        </>
      )
    )

    expect(document.querySelector('.toast--info')).not.toBeNull()
    const row = document.querySelector('.toast--error')
    expect(row).not.toBeNull()
    expect(row?.querySelector('.toast__text')?.textContent).toBe('校验不符，已丢弃')
  })

  it('屏幕右下角最多挂三条', () => {
    render(
      withToasts(
        <>
          <Talk text="第一句" />
          <Talk text="第二句" />
          <Talk text="第三句" />
          <Talk text="第四句" />
        </>
      )
    )

    // 第四条挤掉最早的：再多说明有东西在反复失败，那该去看日志，不是数气泡。
    expect(toastTexts()).toEqual(['第二句', '第三句', '第四句'])
  })

  it('信息停 4.5 秒，错误停 9 秒：用户得先读完再决定换哪个文件夹', () => {
    vi.useFakeTimers()
    render(
      withToasts(
        <>
          <Talk text="下载完成" />
          <Talk text="校验不符，已丢弃" tone="error" />
        </>
      )
    )

    act(() => {
      vi.advanceTimersByTime(4500)
    })
    expect(toastTexts()).toEqual(['校验不符，已丢弃'])

    act(() => {
      vi.advanceTimersByTime(4499)
    })
    expect(toastTexts()).toEqual(['校验不符，已丢弃'])

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(toastTexts()).toEqual([])
  })

  it('手动关掉那一条，其余不受影响', () => {
    render(
      withToasts(
        <>
          <Talk text="旧目录还剩 1 个文件" tone="error" />
          <Talk text="已搬到 D:/万年历数据，正在重启" />
        </>
      )
    )

    // 关掉一条的按钮只有名字可认（内容是那个 ×，读屏器念不出来），所以 aria-label 是它的本体。
    const dismiss = screen.getAllByRole('button', { name: '关闭' })[0]
    expect(dismiss).toBeDefined()
    act(() => {
      dismiss?.click()
    })

    expect(toastTexts()).toEqual(['已搬到 D:/万年历数据，正在重启'])
  })

  it('卸载之后不再有定时器在跑', () => {
    vi.useFakeTimers()
    const view = render(withToasts(<Talk text="下载完成" />))

    view.unmount()

    // 定时器跟着那一条一起没了；这一步是空转，而不是"到点之后往已卸载的组件里 setState"。
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(10_000)
      })
    }).not.toThrow()
    expect(toastTexts()).toEqual([])
  })
})

/** 这层不带文案：它照单念。句子从哪儿来是各个功能的事，这里只保证不加工。 */
describe('提示这层不自己造句子', () => {
  it('给什么念什么，包括英文与标点', () => {
    render(withToasts(<Talk text="Keep original: C:/x" tone="error" />))

    expect(toastTexts()).toEqual(['Keep original: C:/x'])
  })
})
