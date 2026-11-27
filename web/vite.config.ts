import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:6370', changeOrigin: true },
    },
  },
  build: {
    target: 'es2022',
    outDir: '../dist/web',
    emptyOutDir: true,
  },
})
