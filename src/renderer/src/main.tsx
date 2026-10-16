import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { startBackend, startSetupBackend } from '@backend/index'
import { App } from './App'
import { SetupApp } from './features/setup/SetupApp'
import './styles/global.css'

const container = document.getElementById('root')
if (!container) throw new Error('renderer root element #root is missing')

/**
 * 这一轮启动到底有没有一个既有的用户目录，只有宿主知道，而它在页面任何脚本之前就把答案
 * 注入了（`src/shared/splash.ts` 的 `setup`）。
 *
 * 两条路各自装一套：选目录那一屏不读设置、不排定时器、也不碰节假日缓存——那些动作每一件
 * 都会往盘上写东西，而"写到哪儿"正是这一屏还没定的事。装配与骨架屏读的是同一个注入，
 * 所以不会出现"骨架屏藏了、界面却还是日历"那种半截状态。
 */
const choosing = window.__TAYME_SPLASH__?.setup === true

// 后端没装好之前不挂载：`window.tyme` 是界面第一次渲染就要读的东西。
// 日历那一屏等待时还有骨架屏垫着；选目录那一屏把骨架屏藏了（`index.html` 的
// `html[data-setup]`），因为它要的是用户读字、做决定，而不是"等着，马上就完"。
void (choosing ? startSetupBackend() : startBackend()).then(() => {
  createRoot(container).render(<StrictMode>{choosing ? <SetupApp /> : <App />}</StrictMode>)
})
