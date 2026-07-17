import { AppError } from '@gosilex/core'
import { Hono } from 'hono'
import { z } from 'zod'
import { assertRateLimit } from '../lib/rate-limit'
import { authSessionAdapter } from '../lib/session-env'
import { requireAuth } from '../middleware/require-auth'
import * as authService from '../services/auth'
import type { AppEnv } from '../types'

/** 30 key mints / subject / hour (demo in-memory). */
const MINT_LIMIT = 30
const MINT_WINDOW_MS = 60 * 60 * 1000

export const meRoutes = new Hono<AppEnv>()

// Path-scoped — do not use('*') when mounted at `/` (would auth every path including unknown).
meRoutes.use('/api/me', requireAuth)
meRoutes.use('/api/keys', requireAuth)
meRoutes.use('/api/keys/*', requireAuth)

meRoutes.get('/api/me', async (c) => {
  const subject = c.get('subject')!
  return c.json({
    subject,
    authMethod: c.get('authMethod'),
    role: authService.roleForSubject(subject),
    requestId: c.get('requestId'),
  })
})

meRoutes.get('/api/keys', async (c) => {
  const db = c.get('db')!
  const subject = c.get('subject')!
  const keys = await authService.listApiKeys(db, subject)
  return c.json({ keys, requestId: c.get('requestId') })
})

meRoutes.post('/api/keys', async (c) => {
  // Mint only with session cookies — not with sk_ (prevents key-chain expansion).
  if (c.get('authMethod') !== 'session') {
    throw AppError.forbidden('API key mint requires a session cookie')
  }
  const subject = c.get('subject')!
  assertRateLimit(`mint:${subject}`, MINT_LIMIT, MINT_WINDOW_MS)

  const body = z
    .object({
      name: z.string().max(80).optional(),
      organizationId: z.string().min(1).optional(),
    })
    .safeParse(await c.req.json().catch(() => ({})))
  if (!body.success) {
    throw AppError.validation('Invalid key mint payload', body.error.flatten().fieldErrors)
  }

  const orgFromHeader = c.req.header('x-org-id')?.trim()
  const organizationId = body.data.organizationId?.trim() || orgFromHeader || null
  const requireOrganization = authSessionAdapter(c.env) === 'better-auth'

  const db = c.get('db')!
  const minted = await authService.mintApiKey(db, subject, {
    name: body.data.name,
    organizationId,
    requireOrganization,
  })
  return c.json({
    id: minted.id,
    key: minted.key,
    keyPrefix: minted.keyPrefix,
    organizationId: minted.organizationId,
    requestId: c.get('requestId'),
  })
})

meRoutes.delete('/api/keys/:id', async (c) => {
  if (c.get('authMethod') !== 'session') {
    throw AppError.forbidden('API key revoke requires a session cookie')
  }
  const db = c.get('db')!
  const subject = c.get('subject')!
  await authService.revokeApiKey(db, c.req.param('id'), subject)
  return c.json({ ok: true, requestId: c.get('requestId') })
})
