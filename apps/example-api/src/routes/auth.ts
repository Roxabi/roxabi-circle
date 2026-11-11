import { OpenAPIHono } from '@hono/zod-openapi'
import { isBaOrganizationRoute } from '@kit/auth'
import { throttleBetterAuthRequest } from '@kit/auth/repos/ba-throttle'
import { clientIp } from '@kit/auth/repos/rate-limit'
import { AppError } from '@kit/core'
import { scrubBetterAuthServerError } from '../lib/ba-server-error'
import { normalizePasswordSignInResponse } from '../lib/sign-in-anti-enum'
import { normalizeEmailSignUpResponse } from '../lib/sign-up-anti-enum'
import type { AppEnv } from '../types'

/**
 * ADR-0003 D10: `isBaOrganizationRoute` from `@kit/auth` denies every Better Auth organization
 * route before the throttle. The kit organization APIs replace them.
 */
export const authRoutes = new OpenAPIHono<AppEnv>()

/**
 * Better Auth only (ADR-0002): ALL /api/auth/* via BA handler.
 * HMAC login/logout removed.
 *
 * Catch-all proxy — not an OpenAPI operation. Better Auth owns the
 * /api/auth/* surface; do not schema-ise the passthrough.
 *
 * Order: the org deny answers 404 before any budget is spent; every other request goes
 * through the kit D1 throttle (`@kit/auth/repos/ba-throttle`, deny by default) first.
 */
authRoutes.all('/api/auth/*', async (c) => {
  const auth = c.get('betterAuth')
  if (!auth) {
    throw AppError.internal('Better Auth not initialized')
  }
  if (isBaOrganizationRoute(new URL(c.req.raw.url).pathname)) {
    throw AppError.notFound(
      'Better Auth organization routes are off; use the kit organization APIs',
    )
  }
  const db = c.get('db')
  if (!db) throw AppError.internal('db not bound — withDb middleware required')
  await throttleBetterAuthRequest(db, {
    request: c.req.raw,
    ip: clientIp(c.req),
    sessionId: async () => {
      const session = await auth.api.getSession({
        headers: c.req.raw.headers,
        query: { disableRefresh: true },
      })
      return session?.session.id ?? null
    },
  })
  const raw = await auth.handler(c.req.raw)
  const requestId = c.get('requestId') || 'req_unknown'
  const res = scrubBetterAuthServerError(raw, requestId)
  const signIn = normalizePasswordSignInResponse(c.req.raw, res, requestId)
  return normalizeEmailSignUpResponse(c.req.raw, signIn, requestId)
})
