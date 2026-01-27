import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    // Vite 开发服务器代理配置：将 /api 前缀的请求转发到后端
    // 支持本地开发和 Codespace 环境
    proxy: {
      '/api': {
        target: 'http://localhost:8888',
        changeOrigin: true,
        // 不重写路径，直接转发（Vite 会自动移除 /api 前缀并转发到 target）
      },
      '/api/bigdata-ide/ws': {
        target: 'ws://localhost:8888',
        changeOrigin: true,
        ws: true,
      },
    }
  },
  // 生产构建配置
  build: {
    outDir: 'dist',
    sourcemap: false,
  }
})
