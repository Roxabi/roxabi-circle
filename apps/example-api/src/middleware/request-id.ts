import { newRequestId } from '@gosilex/core'
import type { MiddlewareHandler } from 'hono'
import type { KitBetterAuth } from '../lib/better-auth'
import type { KitDb } from '../lib/db-type'

export type AppVariables = {
  requestId: string
  subject?: string
  authMethod?: 'session' | 'api_key'
  /** Set by withDb middleware (Drizzle D1). */
  db?: KitDb
  /** Per-request Better Auth instance (AUTH_SESSION_ADAPTER=better-auth). */
  betterAuth?: KitBetterAuth
}

/** Client ids: req_ + 8–64 url-safe chars. Anything else is ignored (server mints). */
const CLIENT_REQUEST_ID = /^req_[A-Za-z0-9_-]{8,64}$/

export const requestIdMiddleware: MiddlewareHandler<{ Variables: AppVariables }> = async (
  c,
  next,
) => {
  const incoming = c.req.header('x-request-id')?.trim()
  const requestId = incoming && CLIENT_REQUEST_ID.test(incoming) ? incoming : newRequestId()
  c.set('requestId', requestId)
  c.header('x-request-id', requestId)
  await next()
}
