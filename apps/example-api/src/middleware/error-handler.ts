import { AppError, toApiErrorBody } from '@gosilex/core'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { Env } from '../env'
import type { AppVariables } from './request-id'

export function onError(err: Error, c: Context<{ Bindings: Env; Variables: AppVariables }>) {
  const requestId = c.get('requestId') || 'req_unknown'
  const { body, status } = toApiErrorBody(err, requestId)
  const code = err instanceof AppError ? err.code : 'INTERNAL_ERROR'
  // Structured log with stack for operators — never leak stack to client body
  console.error(
    JSON.stringify({
      level: 'error',
      requestId,
      code,
      message: err.message,
      stack: err.stack,
    }),
  )
  return c.json(body, status as ContentfulStatusCode)
}
