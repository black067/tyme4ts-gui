import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { startBackend } from '@backend/index'
import { App } from './App'
import './styles/global.css'

const container = document.getElementById('root')
if (!container) throw new Error('renderer root element #root is missing')

// 后端没装好之前不挂载：`window.tyme` 是 App 第一次渲染就要读的东西。
// 等待的这段时间骨架屏已经在屏幕上，所以这一层 await 不会让用户多等一帧白屏。
void startBackend().then(() => {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
})
