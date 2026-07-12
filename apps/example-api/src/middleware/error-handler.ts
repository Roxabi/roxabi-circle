import { toApiErrorBody } from '@gosilex/core'
import type { Context } from 'hono'
import type { Env } from '../env'
import type { AppVariables } from './request-id'

export function onError(err: Error, c: Context<{ Bindings: Env; Variables: AppVariables }>) {
  const requestId = c.get('requestId') || 'req_unknown'
  const { body, status } = toApiErrorBody(err, requestId)
  // Structured log (no stack to client)
  console.error(JSON.stringify({ level: 'error', requestId, message: err.message }))
  return c.json(body, status as 400)
}
