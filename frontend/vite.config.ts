/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // .env, .env.local, .env.[mode], .env.[mode].local; every variable, not only the VITE_ ones.
  const env = loadEnv(mode, process.cwd(), '')
  // Same default as server.mjs (the production server) and .env.example: the gateway's GATEWAY_PORT.
  const backend = env.BACKEND_URL || 'http://localhost:3000'
  // Same default as server.mjs: Garage's web endpoint for the pictures bucket (backend S3_PUBLIC_URL is /pictures).
  // Garage picks the bucket from the Host header, so the host name is sent as it is, but a *.localhost
  // name is connected to on 127.0.0.1, like browsers do (Node's resolver does not always know them).
  const pictures = new URL(env.PICTURES_URL || 'http://profile-pictures.web.garage.localhost:3902')
  const picturesTarget = new URL(pictures.href)
  if (pictures.hostname === 'localhost' || pictures.hostname.endsWith('.localhost')) picturesTarget.hostname = '127.0.0.1'

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      // The gateway's CORS allow-list, the GitHub OAuth redirect and the links in emails all
      // point to port 4000 (FRONTEND_URL + FRONTEND_PORT in backend/.env, see docs/API_CONTRACT.md).
      port: 4000,
      strictPort: true,
      proxy: {
        // The browser calls /api/... on :4000, Vite forwards it to the gateway (BACKEND_URL).
        // server.mjs does the same in production: keep the two in step.
        '/api': {
          target: backend,
          changeOrigin: true,
          ws: true,
          // appends the client to X-Forwarded-For, like server.mjs: the gateway trusts that header from
          // loopback (per-device rate limits), so a client-sent value must never be the last entry
          xfwd: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
          cookiePathRewrite: { '*': '/' },
        },
        // <img src="/pictures/..."> -> Garage. server.mjs does the same in production: keep the two in step.
        '/pictures': {
          target: picturesTarget.href.replace(/\/+$/, ''),
          headers: { host: pictures.host },
          rewrite: (path) => path.replace(/^\/pictures/, ''),
          configure: (proxy) => {
            // the session cookies have no business reaching the bucket
            proxy.on('proxyReq', (request) => request.removeHeader('cookie'))
          },
        },
      },
    },
    // `vite preview` reuses server.proxy. `npm start` (server.mjs) is the production server.
    preview: { port: 4000, strictPort: true },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
    },
  }
})