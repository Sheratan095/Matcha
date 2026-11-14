/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // The gateway's CORS allow-list, the GitHub OAuth redirect and the links in
    // emails are all hardcoded to http://localhost:4000 (see docs/API_CONTRACT.md).
    port: 4000,
    strictPort: true,
    proxy: {
      // Browser calls /api/... on :4000, Vite forwards to the gateway on :8000.
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        cookiePathRewrite: { '*': '/' },
      },
    },
  },
  preview: { port: 4000, strictPort: true },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})