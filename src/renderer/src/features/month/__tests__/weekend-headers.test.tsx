// @vitest-environment jsdom
/**
 * 月视图表头的周末高亮。
 *
 * 这段逻辑原先比较**渲染出来的中文标签**（`label === '日' || label === '六'`），
 * 一旦星期名改由文案层提供就会静默失效，所以改成按星期索引判断。这里用 DOM
 * 断言把新写法钉住：周末列必须跟着「一周从哪天开始」的设置在移动。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { cleanup } from '@testing-library/react'
import { renderApp } from '@renderer/test/harness'

/** 表头里被标成周末的星期名，按从左到右的顺序。 */
function weekendHeaders(): string[] {
  const header = document.querySelector('.month-view__weekdays')
  if (header === null) throw new Error('没有找到月视图表头')
  return [...header.querySelectorAll('.month-view__weekday')]
    .filter((cell) => cell.classList.contains('is-weekend'))
    .map((cell) => cell.textContent ?? '')
}

afterEach(cleanup)

describe('月视图表头的周末高亮', () => {
  it('周日开始时，日是周末列', async () => {
    await renderApp({ weekStartsOnMonday: false })

    // 顺序为 日一二三四五六，周末落在首尾两列。
    expect(weekendHeaders()).toEqual(['日', '六'])
  })

  it('周一开始时，周末同样落在最后两列', async () => {
    await renderApp({ weekStartsOnMonday: true })

    // 顺序为 一二三四五六日，周末仍是周六与周日，只是位置不同。
    expect(weekendHeaders()).toEqual(['六', '日'])
  })

  it('表头始终有七列', async () => {
    await renderApp()

    const all = document.querySelectorAll('.month-view__weekday')
    expect(all).toHaveLength(7)
    // 保证上面的断言不是因为选择器没匹配到而空转通过。
    expect(screen.getByRole('grid')).toBeInTheDocument()
  })
})
