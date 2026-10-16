import type { ReactElement } from 'react'
import { StaticLocaleProvider } from '@renderer/i18n'
import { SetupView } from './SetupView'

/**
 * 选用户目录那一屏的应用树。
 *
 * 它与 `App` 的差别只有一处，但那处很重要：这里**没有** `SettingsProvider`。设置存在用户
 * 目录里，而这一屏存在的理由正是"还没有一个用户目录"——挂上它等于在用户挑好位置之前先去
 * 读一个不存在（甚至还没被建出来）的文件。语言因此取默认值（`StaticLocaleProvider`），
 * 更新与节假日那两个 Provider 干脆不出现：它们每一个都会往盘上写东西。
 *
 * 提示通道也不挂：这一屏的验证话语钉在表单旁边才有意义（用户接下来要在同一个地方改输入），
 * 而右下角那条会自己消失的消息正好相反。
 */
export function SetupApp(): ReactElement {
  return (
    <StaticLocaleProvider>
      <SetupView />
    </StaticLocaleProvider>
  )
}
