import { createContext, useContext } from 'react'
import type { GlossaryFamily, TermLookup } from '@core'

/** 当前展示的术语。`mode` 决定它是悬停浮层还是点击固定的详情。 */
export interface ActiveTerm {
  /** 触发元素的稳定 id（`useId`），同时用于 aria 关联与去重。 */
  id: string
  family: GlossaryFamily
  name: string
  /** 有释义还是只有缺口说明——两者都出浮层，区别只在内容。 */
  lookup: TermLookup
  /** 触发元素，用来定位浮层。 */
  anchor: HTMLElement
  mode: 'hover' | 'pinned'
}

export interface TermTipContextValue {
  /** 设置里关掉「术语说明」时为 false，此时所有术语渲染成纯文本。 */
  enabled: boolean
  active: ActiveTerm | null
  /** 悬停或聚焦时展示。 */
  show(term: ActiveTerm): void
  /** 点击时固定详情；已固定同一个则收起。 */
  pin(term: ActiveTerm): void
  /** 悬停离开。只有当前这个仍是 hover 模式时才收起，避免把已固定的详情关掉。 */
  hideHover(id: string): void
  close(): void
}

export const TermTipContext = createContext<TermTipContextValue | null>(null)

export function useTermTip(): TermTipContextValue {
  const value = useContext(TermTipContext)
  if (value === null) throw new Error('useTermTip 必须在 TermTipProvider 内使用')
  return value
}
