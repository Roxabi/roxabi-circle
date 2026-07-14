import type { MiddlewareHandler } from 'hono'
import { useSecureCookie } from '../lib/session-env'
import type { AppEnv } from '../types'

/** Apply baseline security headers (also on error paths via try/finally). */
export function applySecurityHeaders(c: {
  header: (name: string, value: string) => void
  env: AppEnv['Bindings']
}): void {
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('Referrer-Policy', 'no-referrer')
  c.header('X-XSS-Protection', '0')
  c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  // Align with Secure cookie policy: HSTS whenever not explicit development|test
  // (including missing ENVIRONMENT — same as useSecureCookie true).
  if (useSecureCookie(c.env)) {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
}

export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  try {
    await next()
  } finally {
    applySecurityHeaders(c)
  }
}
