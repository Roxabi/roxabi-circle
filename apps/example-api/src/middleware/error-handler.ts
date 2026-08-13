import { AppError, createLogger, toApiErrorBody } from '@kit/core'
import { StorageError } from '@kit/storage'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { Env } from '../env'
import type { AppVariables } from './request-id'
import { applySecurityHeaders } from './security-headers'

const rootLog = createLogger({ service: 'example-api' })

/**
 * Map `@kit/storage` StorageError → AppError before generic toApiErrorBody.
 * Client path bugs → 400 with a safe message; IO → scrubbed 500.
 */
export function mapStorageError(err: unknown): AppError | null {
  if (!(err instanceof StorageError)) return null
  if (err.code === 'PATH_TRAVERSAL' || err.code === 'OUTSIDE_PREFIX') {
    return AppError.validation('Invalid storage path')
  }
  // IO and any future codes — never leak provider messages
  return AppError.internal()
}

export function onError(err: Error, c: Context<{ Bindings: Env; Variables: AppVariables }>) {
  const requestId = c.get('requestId') || 'req_unknown'
  const mapped = mapStorageError(err) ?? err
  const { body, status } = toApiErrorBody(mapped, requestId)
  const code = mapped instanceof AppError ? mapped.code : 'INTERNAL_ERROR'
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
      mapped instanceof AppError && mapped.details && typeof mapped.details === 'object'
        ? (mapped.details as { retryAfterSeconds?: number })
        : undefined
    const sec =
      typeof details?.retryAfterSeconds === 'number' && details.retryAfterSeconds > 0
        ? Math.floor(details.retryAfterSeconds)
        : 60
    c.header('Retry-After', String(sec))
  }
  return c.json(body, status as ContentfulStatusCode)
}
