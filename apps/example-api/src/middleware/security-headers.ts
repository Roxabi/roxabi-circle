import type { MiddlewareHandler } from 'hono'
import { environmentName } from '../lib/session-env'
import type { AppEnv } from '../types'

export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('Referrer-Policy', 'no-referrer')
  c.header('X-XSS-Protection', '0')
  const envName = environmentName(c.env)
  if (envName && envName !== 'development' && envName !== 'test') {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
}
