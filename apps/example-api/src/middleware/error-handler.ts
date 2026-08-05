import { AppError, createLogger, toApiErrorBody } from '@kit/core'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { Env } from '../env'
import type { AppVariables } from './request-id'
import { applySecurityHeaders } from './security-headers'

const rootLog = createLogger({ service: 'example-api' })

export function onError(err: Error, c: Context<{ Bindings: Env; Variables: AppVariables }>) {
  const requestId = c.get('requestId') || 'req_unknown'
  const { body, status } = toApiErrorBody(err, requestId)
  const code = err instanceof AppError ? err.code : 'INTERNAL_ERROR'
  const log = rootLog.child({ requestId })
  if (status >= 500) {
    log.error(err.message, { code, stack: err.stack })
  } else {
    log.warn(err.message, { code, status })
  }
  // Ensure security headers on thrown-error responses (middleware finally may not bind).
  applySecurityHeaders(c)
  if (status === 429) {
    const details =
      err instanceof AppError && err.details && typeof err.details === 'object'
        ? (err.details as { retryAfterSeconds?: number })
        : undefined
    const sec =
      typeof details?.retryAfterSeconds === 'number' && details.retryAfterSeconds > 0
        ? Math.floor(details.retryAfterSeconds)
        : 60
    c.header('Retry-After', String(sec))
  }
  return c.json(body, status as ContentfulStatusCode)
}
