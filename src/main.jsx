import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.jsx'
import './styles/global.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>
)

// ===== Service Worker 更新保障 =====
// 问题:浏览器对 SW 脚本的更新检查有 24 小时节流,导致发了新版本
//       用户打开的还是旧缓存(表现为"功能没更新")。
// 解决:每次打开都主动检查一次(registration.update() 不受节流限制),
//       配合 registerType:'autoUpdate',有新版本就自动激活并刷新页面。
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistration().then(reg => {
      if (!reg) return
      reg.update().catch(() => {})
      // 兜底:每分钟再检查一次(应对一直开着窗口的情况)
      setInterval(() => reg.update().catch(() => {}), 60 * 1000)
    }).catch(() => {})
  })
}
