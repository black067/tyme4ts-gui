import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { GLOSSARY, lookupTerm, type GlossaryFamily } from '@core'
import { useSettings } from '@renderer/state/settings-context'
import { cx } from './cx'
import {
  TermTipContext,
  useTermTip,
  type ActiveTerm,
  type TermTipContextValue
} from './term-tip-context'
import './term-tip.css'

const GAP = 8
const MARGIN = 8

interface TermTipProps {
  family: GlossaryFamily
  name: string
  /** 触发元素的内容；省略时用 `name`。 */
  children?: ReactNode
  /** 附加到触发元素上的类名，用来沿用所在位置的排版。 */
  className?: string
}

/**
 * 一个术语。
 *
 * 有释义时渲染成可聚焦的按钮：悬停或聚焦出简介，点击展开详情。
 * 没有释义、或设置里关掉了「术语说明」时退化成纯文本，且不注册任何事件监听——
 * 缺口是常态（见 KNOWN_GAPS），不能让它们变成一堆点了没反应的按钮。
 */
export function TermTip({ family, name, children, className }: TermTipProps): ReactElement {
  const { enabled, active, show, pin, hideHover } = useTermTip()
  const id = useId()
  const ref = useRef<HTMLButtonElement>(null)
  const entry = useMemo(() => (enabled ? lookupTerm(family, name) : null), [enabled, family, name])

  const open = useCallback(
    (mode: ActiveTerm['mode']) => {
      const anchor = ref.current
      if (anchor === null || entry === null) return
      show({ id, family, name, entry, anchor, mode })
    },
    [entry, family, id, name, show]
  )

  if (entry === null) return <span className={className}>{children ?? name}</span>

  const isHover = active?.id === id && active.mode === 'hover'
  const isPinned = active?.id === id && active.mode === 'pinned'

  return (
    <button
      ref={ref}
      type="button"
      id={id}
      className={cx('term', className)}
      aria-describedby={isHover || isPinned ? `${id}-tip` : undefined}
      aria-expanded={isPinned}
      onMouseEnter={() => open('hover')}
      onFocus={() => open('hover')}
      onMouseLeave={() => hideHover(id)}
      onBlur={() => hideHover(id)}
      onClick={() => {
        const anchor = ref.current
        if (anchor === null) return
        pin({ id, family, name, entry, anchor, mode: 'pinned' })
      }}
    >
      {children ?? name}
    </button>
  )
}

interface Placement {
  left: number
  top: number
}

/** 浮层默认落在触发元素下方；下方不够翻到上方，左右越界则夹在视口内。 */
function place(anchor: HTMLElement, width: number, height: number): Placement {
  const rect = anchor.getBoundingClientRect()
  const below = rect.bottom + GAP
  const above = rect.top - GAP - height
  const fitsBelow = below + height + MARGIN <= window.innerHeight
  const top = fitsBelow || above < MARGIN ? below : above
  const left = Math.min(
    Math.max(MARGIN, rect.left),
    Math.max(MARGIN, window.innerWidth - width - MARGIN)
  )
  return { left, top: Math.max(MARGIN, top) }
}

/**
 * 全应用唯一的浮层。渲染在 portal 里，避开祖先的 overflow 与层叠上下文。
 *
 * 位置是**直接写 DOM** 而不是放进 state：`useLayoutEffect` 在浏览器绘制前跑完，
 * 所以首帧就落在正确的位置；走 state 会多一次渲染，也会触发
 * react-hooks/set-state-in-effect。
 */
function TermTipLayer(): ReactElement | null {
  const { active, close } = useTermTip()
  const boxRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (active === null) return
    const box = boxRef.current
    if (box === null) return
    const anchor = active.anchor

    const measure = (): void => {
      // 触发元素滚出视口就收起来，免得浮层孤零零地飘着。
      const rect = anchor.getBoundingClientRect()
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        close()
        return
      }
      const { left, top } = place(anchor, box.offsetWidth, box.offsetHeight)
      box.style.left = `${left}px`
      box.style.top = `${top}px`
    }

    measure()
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [active, close])

  if (active === null) return null

  const family = GLOSSARY[active.family]
  const pinned = active.mode === 'pinned'

  return createPortal(
    <div
      ref={boxRef}
      id={`${active.id}-tip`}
      className={cx('term-tip', pinned && 'term-tip--pinned')}
      role={pinned ? 'dialog' : 'tooltip'}
    >
      <p className="term-tip__head">
        <span className="term-tip__name">{active.name}</span>
        <span className="term-tip__family">{family.label}</span>
      </p>
      <p className="term-tip__summary">{active.entry.summary}</p>
      {active.entry.quote ? <p className="term-tip__quote">{active.entry.quote}</p> : null}
      {pinned ? (
        <>
          <p className="term-tip__source">{active.entry.source ?? family.rationale ?? ''}</p>
          <button type="button" className="term-tip__close" onClick={close}>
            关闭
          </button>
        </>
      ) : null}
    </div>,
    document.body
  )
}

/** 承载全应用唯一的术语浮层，并统一处理 Esc、点击外部、滚动与窗口失焦。 */
export function TermTipProvider({ children }: { children: ReactNode }): ReactElement {
  const { settings } = useSettings()
  const [activeState, setActiveState] = useState<ActiveTerm | null>(null)
  const enabled = settings.showGlossary
  // 关掉「术语说明」时直接当作没有活动浮层，不必用 effect 去清 state
  // （那会触发 react-hooks/set-state-in-effect）。
  const active = enabled ? activeState : null

  // 悬停不覆盖已经固定的详情，否则鼠标划过别处就把展开的详情顶掉了。
  const show = useCallback((term: ActiveTerm) => {
    setActiveState((current) => (current?.mode === 'pinned' ? current : term))
  }, [])
  const pin = useCallback((term: ActiveTerm) => {
    setActiveState((current) =>
      current?.id === term.id && current.mode === 'pinned' ? null : term
    )
  }, [])
  const hideHover = useCallback((id: string) => {
    setActiveState((current) => (current?.id === id && current.mode === 'hover' ? null : current))
  }, [])
  const close = useCallback(() => setActiveState(null), [])

  useEffect(() => {
    if (active === null) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      // 只收自己这一层，不 stopPropagation——useKeyboardNav 还要用 Esc 关设置。
      event.preventDefault()
      close()
    }
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (active.anchor.contains(target)) return
      const box = document.getElementById(`${active.id}-tip`)
      if (box !== null && box.contains(target)) return
      close()
    }
    const onBlur = (): void => close()

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [active, close])

  const value = useMemo<TermTipContextValue>(
    () => ({ enabled, active, show, pin, hideHover, close }),
    [enabled, active, show, pin, hideHover, close]
  )

  return (
    <TermTipContext.Provider value={value}>
      {children}
      <TermTipLayer />
    </TermTipContext.Provider>
  )
}
