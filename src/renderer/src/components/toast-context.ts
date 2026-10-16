import { createContext, useContext } from 'react'

/** 语气。区别只在左边那条色带和停留时长：错误要说得久一点。 */
export type ToastTone = 'info' | 'error'

/**
 * 界面里"把一句话临时说给用户听"的唯一入口。
 *
 * 只有文本，没有级别、没有 id、没有回调：这一层的全部职责就是把一条消息显示几秒然后消失，
 * 一旦允许带按钮或带 JSX，它就会变成第二个对话框系统，而这个项目刚刚才把那种东西请出去。
 */
export interface ToastApi {
  notify(text: string, tone?: ToastTone): void
}

export const ToastContext = createContext<ToastApi | null>(null)

/** 取提示通道。挂在 ToastProvider 之外时用不了——那里连消息都没地方摆。 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (api === null) {
    throw new Error('useToast must be called inside <ToastProvider>')
  }
  return api
}
