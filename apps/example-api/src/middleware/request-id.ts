import { newRequestId } from '@gosilex/core'
import type { MiddlewareHandler } from 'hono'

export type AppVariables = {
  requestId: string
  subject?: string
  authMethod?: 'session' | 'api_key'
}

export const requestIdMiddleware: MiddlewareHandler<{ Variables: AppVariables }> = async (
  c,
  next,
) => {
  const incoming = c.req.header('x-request-id')
  const requestId = incoming?.trim() || newRequestId()
  c.set('requestId', requestId)
  c.header('x-request-id', requestId)
  await next()
}
