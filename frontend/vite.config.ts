import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Fonts stay as files: the backend CSP (font-src 'self') blocks data: URLs.
  build: { assetsInlineLimit: (file: string) => (/\.woff2?$/.test(file) ? false : undefined) },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: process.env.KOSH_API ?? 'http://127.0.0.1:8017',
        changeOrigin: true,
      },
      '/ws': {
        target: process.env.KOSH_API ?? 'http://127.0.0.1:8017',
        ws: true,
      }
    }
  }
})
