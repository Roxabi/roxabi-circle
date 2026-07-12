import { AppError, createLogger, toApiErrorBody } from '@gosilex/core'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { Env } from '../env'
import type { AppVariables } from './request-id'

const rootLog = createLogger({ service: 'example-api' })

export function onError(err: Error, c: Context<{ Bindings: Env; Variables: AppVariables }>) {
  const requestId = c.get('requestId') || 'req_unknown'
  const { body, status } = toApiErrorBody(err, requestId)
  const code = err instanceof AppError ? err.code : 'INTERNAL_ERROR'
  rootLog.child({ requestId }).error(err.message, {
    code,
    stack: err.stack,
  })
  return c.json(body, status as ContentfulStatusCode)
}
