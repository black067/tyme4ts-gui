// @vitest-environment jsdom
/**
 * 干支逐字浮层的接线测试。
 *
 * 干支串没有整体释义，所以按字分流到十干/十二支两族。这里断言分流真的生效：
 * 一个字挂错族（或压根没挂）都不会让别的测试失败。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { renderApp } from '@renderer/test/harness'

afterEach(cleanup)

/** 日详情里「干支」那一行的值按钮，按出现顺序。 */
function ganzhiButtons(): HTMLElement[] {
  const row = [...document.querySelectorAll('.almanac-row')].find(
    (candidate) => candidate.querySelector('dt')?.textContent === '干支'
  )
  if (!row) throw new Error('没有找到「干支」行')
  return [...row.querySelectorAll('button.term')].filter(
    (node): node is HTMLElement => node instanceof HTMLElement
  )
}

describe('干支的逐字浮层', () => {
  it('三柱六个字都挂上了浮层', async () => {
    await renderApp()

    // 日详情的干支是「年柱 月柱 日柱」，三个干支共六个字。
    expect(ganzhiButtons()).toHaveLength(6)
  })

  it('每两个相邻字分属十干与十二支，浮层内容各自正确', async () => {
    await renderApp()

    const buttons = ganzhiButtons()
    // 一个干支由干与支组成：干字取自十干训诂，支字取自十二支训诂。
    // 甲/辰 都在这套训诂里，所以两条浮层都应给得出释义，而不是缺口。
    for (const button of buttons) {
      expect(button).not.toHaveClass('term--gap')
    }

    fireEvent.mouseEnter(buttons[0]!)
    const first = await screen.findByRole('tooltip')
    // 该日年柱是甲辰：甲 → 万物剖符甲而出。
    expect(first).toHaveTextContent('剖符甲而出')

    fireEvent.mouseLeave(buttons[0]!)
    fireEvent.mouseEnter(buttons[1]!)
    const second = await screen.findByRole('tooltip')
    expect(second).toHaveTextContent('辰者言万物之蜄也')
  })
})
