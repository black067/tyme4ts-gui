import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'
import { useMessages } from '@renderer/i18n'
import { ToastContext, type ToastApi, type ToastTone } from './toast-context'
import './toast.css'

/** 屏幕上最多同时挂几条。再多就说明有东西在反复失败，那该去看日志而不是数气泡。 */
const MAX_VISIBLE = 3
/** 一条信息停 4.5 秒：读完一遍还有余量，又不至于挡住下一次操作。 */
const INFO_MS = 4500
/** 错误久一点：用户得先读完，再决定换哪个文件夹、要不要重试。 */
const ERROR_MS = 9000

interface Toast {
  id: number
  text: string
  tone: ToastTone
}

/**
 * 应用内提示的容器。
 *
 * 取代的是两类旧东西：标题栏下面那条只在出错时才出现的 `app-error`，以及设置页里那些
 * `tool__error`/`settings-note` 段落。它们有一个共同的毛病——话说的是"这一次操作怎么样"，
 * 位置却钉在某个区块里，于是用户读完之后那句话一直赖在那儿，看起来像那个功能的永久状态。
 * 提示本来就是几秒钟的事，就该有几秒钟的存在方式。
 *
 * 这一层不带文案：调用方给什么句子它就说什么句子，因为"该说什么"是各个功能自己的事
 * （见 `features/updates`、`features/holidays`、`features/settings`）。
 */
export function ToastProvider({ children }: { children: ReactNode }): ReactElement {
  const [toasts, setToasts] = useState<readonly Toast[]>([])
  const nextId = useRef(0)

  const notify = useCallback((text: string, tone: ToastTone = 'info'): void => {
    if (text.trim() === '') return
    setToasts((current) => {
      // 同一条消息不重复挂：连点两次"检查更新"都失败时，第二句没有任何新信息，
      // 却会把第一条顶掉，让第一条看起来像刚刚才发生。
      if (current.some((item) => item.text === text)) return current
      return [...current, { id: ++nextId.current, text, tone }].slice(-MAX_VISIBLE)
    })
  }, [])

  const dismiss = useCallback((id: number): void => {
    setToasts((current) => current.filter((item) => item.id !== id))
  }, [])

  const api = useMemo<ToastApi>(() => ({ notify }), [notify])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

/**
 * 那个活动区。空着也要挂在 DOM 里：读屏器要先看见这个区域，之后往它里面加的句子才会被念出来。
 *
 * 每条提示各自是一个 `role="status"`——测试与读屏器都按"一条消息"来认它们，
 * 而这一层只是放它们的地方。
 */
function ToastStack({
  toasts,
  onDismiss
}: {
  toasts: readonly Toast[]
  onDismiss: (id: number) => void
}): ReactElement {
  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <ToastRow key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function ToastRow({
  toast,
  onDismiss
}: {
  toast: Toast
  onDismiss: (id: number) => void
}): ReactElement {
  const t = useMessages()

  // 时间到了自己走。用 effect 而不是维护一张 id→定时器 的表：被顶掉、被手动关掉、
  // 组件卸载，这三种情况下的 clearTimeout 都由 React 顺手做掉。
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), toast.tone === 'error' ? ERROR_MS : INFO_MS)
    return () => clearTimeout(timer)
  }, [toast.id, toast.tone, onDismiss])

  return (
    <div className={`toast toast--${toast.tone}`} role="status">
      <span className="toast__text">{toast.text}</span>
      <button
        type="button"
        className="toast__dismiss"
        aria-label={t.toast.dismiss}
        onClick={() => onDismiss(toast.id)}
      >
        ×
      </button>
    </div>
  )
}
