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
