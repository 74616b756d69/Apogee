import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: parseInt(process.env.PORT, 10) || 3000,
    // /api/* へのリクエストを Spring Boot (8080) にプロキシ
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/space-images': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
