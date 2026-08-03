import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** API origin for Vite proxy (e2e-ci may set E2E_API_URL when using non-default ports). */
const apiProxyTarget =
  process.env.E2E_API_URL ?? process.env.VITE_API_PROXY ?? 'http://127.0.0.1:8787'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Bind IPv4+IPv6 so both localhost and 127.0.0.1 work (default can be [::1] only).
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/health': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
})
