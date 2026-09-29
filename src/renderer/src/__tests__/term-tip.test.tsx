// @vitest-environment jsdom
/**
 * 术语浮层的行为测试。
 *
 * 术语是从「这一天真实会渲染出来的标签」里挑的，不是硬编码的名字——这样引擎升级
 * 换了当天的神煞也不会让测试假通过。
 *
 * 有释义和没释义的**都要出浮层**：后者诚实说明缺什么，并尽量指出位置。
 */
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { buildDayInfo, fromIsoDate, lookupTerm, type GlossaryEntry } from '@core'
import { renderApp } from '@renderer/test/harness'

const DAY = '2024-06-26'

/** renderApp 固定在 2024-06-26，这里取出同一天的引擎结果用来挑术语。 */
function dayInfo() {
  const key = fromIsoDate(DAY)
  if (key === null) throw new Error(`测试日期无效：${DAY}`)
  return buildDayInfo(key)
}

/** 取一个确定有释义的引擎名，顺带把它的词条带出来。 */
function pickEntry(): { name: string; entry: GlossaryEntry } {
  const god = dayInfo().gods?.find((item) => lookupTerm('god', item.name)?.kind === 'entry')
  if (!god) throw new Error('2024-06-26 没有带释义的吉神凶煞，换一个测试日期')
  const found = lookupTerm('god', god.name)
  if (found?.kind !== 'entry') throw new Error('unreachable')
  return { name: god.name, entry: found.entry }
}

/** 取一个确定是缺口的引擎名。 */
function pickGap(): string {
  const sixStar = dayInfo().sixStar
  if (!sixStar || lookupTerm('sixStar', sixStar)?.kind !== 'gap') {
    throw new Error('2024-06-26 的六曜不是缺口，换一个测试日期')
  }
  return sixStar
}

/** 取一个缺口里还带得出处的引擎名——用来验证「找不到释义也要把位置指出来」。 */
function pickSourcedGap(): { name: string; source: string } {
  for (const god of dayInfo().gods ?? []) {
    const found = lookupTerm('god', god.name)
    if (found?.kind === 'gap' && found.note.source) {
      return { name: god.name, source: found.note.source }
    }
  }
  throw new Error('2024-06-26 没有带出处的缺口神煞，换一个测试日期')
}

/** 浮层渲染在 portal 里，所以查 document 而不是渲染容器。 */
function tooltip(): HTMLElement | null {
  return screen.queryByRole('tooltip')
}

describe('悬停与聚焦出简介', () => {
  it('悬停有释义的术语时显示白话释义与原文引文', async () => {
    const { name, entry } = pickEntry()
    await renderApp()
    const trigger = screen.getByRole('button', { name })

    expect(tooltip()).toBeNull()
    fireEvent.mouseOver(trigger)

    const tip = tooltip()
    expect(tip).not.toBeNull()
    expect(tip).toHaveTextContent(entry.summary)
    expect(tip).toHaveTextContent(entry.quote as string)
    expect(trigger).toHaveAttribute('aria-describedby', `${trigger.id}-tip`)
  })

  it('键盘聚焦同样出简介，移开焦点就收起', async () => {
    const { name } = pickEntry()
    await renderApp()
    const trigger = screen.getByRole('button', { name })

    fireEvent.focus(trigger)
    expect(tooltip()).not.toBeNull()

    fireEvent.blur(trigger)
    expect(tooltip()).toBeNull()
  })
})

describe('缺口的浮层诚实说明缺什么', () => {
  it('悬停没有释义的术语时说明暂无释义，并给出理由', async () => {
    const name = pickGap()
    const found = lookupTerm('sixStar', name)
    expect(found?.kind).toBe('gap')

    await renderApp()
    const trigger = screen.getByRole('button', { name })
    expect(trigger).toHaveClass('term', 'term--gap')

    fireEvent.mouseOver(trigger)
    const tip = tooltip()
    expect(tip).not.toBeNull()
    expect(tip).toHaveTextContent('暂无释义')
    if (found?.kind === 'gap') expect(tip).toHaveTextContent(found.note.reason)
  })

  it('缺口能指得出位置时，详情里把位置也显示出来', async () => {
    const picked = pickSourcedGap()

    await renderApp()
    const trigger = screen.getByRole('button', { name: picked.name })
    fireEvent.click(trigger)

    const detail = screen.queryByRole('dialog')
    expect(detail).not.toBeNull()
    expect(detail).toHaveTextContent('暂无释义')
    expect(detail).toHaveTextContent(picked.source)
  })
})

describe('点击展开详情', () => {
  it('详情带上出处，再次点击收起', async () => {
    const { name, entry } = pickEntry()
    await renderApp()
    const trigger = screen.getByRole('button', { name })

    fireEvent.click(trigger)
    const detail = screen.queryByRole('dialog')
    expect(detail).not.toBeNull()
    expect(detail).toHaveTextContent(entry.summary)
    expect(detail).toHaveTextContent(entry.source as string)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(trigger)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Esc 关闭，且不打断设置页自己的 Esc 行为', async () => {
    const { name } = pickEntry()
    await renderApp()
    const trigger = screen.getByRole('button', { name })

    fireEvent.click(trigger)
    expect(screen.queryByRole('dialog')).not.toBeNull()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()

    // 同一次 Esc 仍然关掉了设置页：说明我们没有把事件吞掉。
    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    expect(screen.getByRole('region', { name: '设置' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('region', { name: '设置' })).toBeNull()
  })

  it('点击别处关闭详情', async () => {
    const { name } = pickEntry()
    await renderApp()
    fireEvent.click(screen.getByRole('button', { name }))
    expect(screen.queryByRole('dialog')).not.toBeNull()

    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('详情固定后，鼠标划过别的术语不会把它顶掉', async () => {
    const { name } = pickEntry()
    await renderApp()
    fireEvent.click(screen.getByRole('button', { name }))

    const others = screen
      .getAllByRole('button')
      .filter((element) => element.classList.contains('term') && element.textContent !== name)
    expect(others.length).toBeGreaterThan(0)
    fireEvent.mouseOver(others[0] as HTMLElement)

    const detail = screen.queryByRole('dialog')
    expect(detail).not.toBeNull()
    expect(detail).toHaveTextContent(name)
  })
})

describe('退化情形', () => {
  it('设置里关掉术语说明后，术语变回纯文本', async () => {
    const { name } = pickEntry()
    await renderApp({ showGlossary: false })

    expect(screen.queryByRole('button', { name })).toBeNull()
    expect(screen.getAllByText(name).length).toBeGreaterThan(0)
    expect(document.querySelector('.term')).toBeNull()
  })

  it('建除与二十八宿的值也带浮层', async () => {
    await renderApp()
    const info = dayInfo()

    if (info.duty && lookupTerm('duty', info.duty)?.kind === 'entry') {
      expect(screen.getByRole('button', { name: info.duty })).toBeInTheDocument()
    }
    if (info.twentyEightStar && lookupTerm('star28', info.twentyEightStar.name)) {
      const star = info.twentyEightStar
      const trigger = screen.getByRole('button', {
        name: `${star.name}宿（${star.zone}方${star.beast}）· ${star.luck}`
      })
      fireEvent.mouseOver(trigger)
      const found = lookupTerm('star28', star.name)
      if (found?.kind === 'entry') expect(tooltip()).toHaveTextContent(found.entry.summary)
    }
  })
})
