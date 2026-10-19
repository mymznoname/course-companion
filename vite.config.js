import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Vite 配置：React + PWA（离线可用、可安装到手机桌面）
// SKIP_PWA=1 时跳过 Service Worker 生成：
//   浏览器正开着软件时，运行中的 SW 会锁住 dist/sw.js，导致构建 EPERM 失败。
//   这时用 SKIP_PWA=1 先出包测试，等浏览器关掉后再跑一次完整构建。
const withPWA = !process.env.SKIP_PWA

// Service Worker 文件名。浏览器里运行中的旧 SW 会独占锁住旧文件,导致构建 EPERM 失败;
// 这时用 SW_FILE=sw-v2.js 换个新文件名即可绕过(用户硬刷新一次让新 SW 接管)。
const SW_FILE = process.env.SW_FILE || 'sw.js'

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    ...(withPWA ? [VitePWA({
      filename: SW_FILE,
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '网课伴学',
        short_name: '网课伴学',
        description: '导入一门网课，按天拆任务，强制每节写总结，导出学习笔记',
        theme_color: '#1D9E75',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}']
      }
    })] : [])
  ],
  server: { host: true, port: 5174 },
  preview: { host: true, port: 4174 },
  build: { emptyOutDir: false } // 环境钩子对中文路径 rmSync 有兼容问题,改为手动清理 dist
})
