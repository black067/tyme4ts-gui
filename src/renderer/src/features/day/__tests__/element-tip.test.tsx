// @vitest-environment jsdom
/**
 * 五行词条的接线测试。
 *
 * 这一族是后加的：日详情里「五行」只显示一个字，此前点了没有任何反应。
 * 这里断言它现在真的有浮层，并且引用的是可逐字校验的公版原文——
 * 引文的真实性由 `tests/glossary-contract.test.ts` 守，这里只管界面接上了。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { renderApp } from '@renderer/test/harness'

afterEach(cleanup)

/** 取日详情里「五行」那一行的值按钮。 */
function elementButton(): HTMLElement {
  const row = [...document.querySelectorAll('.almanac-row')].find(
    (candidate) => candidate.querySelector('dt')?.textContent === '五行'
  )
  if (!row) throw new Error('没有找到「五行」行')
  const button = row.querySelector('button.term')
  if (!(button instanceof HTMLElement)) throw new Error('「五行」的值没有挂上术语浮层')
  return button
}

describe('五行的术语浮层', () => {
  it('日详情的五行值带浮层，并且有白话释义', async () => {
    await renderApp()

    const button = elementButton()
    // 五行只有五个取值，全都是引擎产出的名字，所以一定命中词条而不是缺口。
    expect(button).not.toHaveClass('term--gap')

    fireEvent.mouseEnter(button)

    const tip = await screen.findByRole('tooltip')
    expect(tip).toHaveTextContent('五行之一')
  })

  it('点击后带出公版出处', async () => {
    await renderApp()

    const button = elementButton()
    // 一次点击把浮层固定成详情；再点一次会收起，所以只点一次。
    fireEvent.click(button)

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('《协纪辨方书》卷一·本原一')
    // 引文是《尚书·洪范》的五行的名目，逐字校验由契约测试负责。
    expect(dialog).toHaveTextContent('一曰水二曰火三曰木四曰金五曰土')
  })
})
