import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Fonts stay as files: the backend CSP (font-src 'self') blocks data: URLs.
  // three.js is lazy-loaded for the hero card only, so its large chunk never blocks first paint.
  build: { chunkSizeWarningLimit: 700, assetsInlineLimit: (file: string) => (/\.woff2?$/.test(file) ? false : undefined) },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8017',
        changeOrigin: true,
      },
      '/ws': {
        target: 'http://127.0.0.1:8017',
        ws: true,
      }
    }
  }
})
