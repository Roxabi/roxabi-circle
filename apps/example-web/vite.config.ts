import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { buildSpaCsp } from './src/lib/csp.ts'

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, import.meta.dirname, 'VITE_')
  const spaApiUrl = process.env.VITE_API_URL || fileEnv.VITE_API_URL
  const SPA_CSP = buildSpaCsp(spaApiUrl)

  /** API origin for Vite proxy (e2e-ci may set E2E_API_URL when using non-default ports). */
  const apiProxyTarget =
    process.env.E2E_API_URL ?? process.env.VITE_API_PROXY ?? 'http://127.0.0.1:8787'

  const frameHeaders = {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  }

  const securityHeaders = {
    'Content-Security-Policy': SPA_CSP,
    ...frameHeaders,
  }

  function spaCspPlugin(): Plugin {
    return {
      name: 'kit-spa-csp',
      apply: 'build',
      transformIndexHtml(html) {
        return html.replace(
          '<!-- CSP_INJECT -->',
          `<meta http-equiv="Content-Security-Policy" content="${SPA_CSP}" />`,
        )
      },
      writeBundle(output) {
        if (!output.dir) return
        writeFileSync(
          join(output.dir, '_headers'),
          [
            '/*',
            `  Content-Security-Policy: ${SPA_CSP}`,
            '  X-Frame-Options: DENY',
            '  X-Content-Type-Options: nosniff',
            '  Referrer-Policy: strict-origin-when-cross-origin',
            '',
          ].join('\n'),
        )
      },
    }
  }

  return {
    plugins: [react(), tailwindcss(), spaCspPlugin()],
    server: {
      // Bind IPv4+IPv6 so both localhost and 127.0.0.1 work (default can be [::1] only).
      host: true,
      port: 5173,
      // No CSP here: @vitejs/plugin-react injects an inline Refresh preamble.
      headers: frameHeaders,
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
    preview: {
      headers: securityHeaders,
    },
  }
})
