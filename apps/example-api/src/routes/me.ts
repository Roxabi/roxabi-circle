import { AppError } from '@kit/core'
import { Hono } from 'hono'
import { z } from 'zod'
import { assertRateLimit } from '../lib/rate-limit'
import { requireAuth } from '../middleware/require-auth'
import * as authService from '../services/auth'
import * as meService from '../services/me'
import type { AppEnv } from '../types'

/** 30 key mints / subject / hour (D1 fixed-window). */
const MINT_LIMIT = 30
const MINT_WINDOW_MS = 60 * 60 * 1000

export const meRoutes = new Hono<AppEnv>()

// Path-scoped — do not use('*') when mounted at `/` (would auth every path including unknown).
meRoutes.use('/api/me', requireAuth)
meRoutes.use('/api/keys', requireAuth)
meRoutes.use('/api/keys/*', requireAuth)

meRoutes.get('/api/me', async (c) => {
  const subject = c.get('subject')!
  const db = c.get('db')!
  const profile = await meService.getMeProfile(db, subject, {
    authMethod: c.get('authMethod'),
    keyOrganizationId: c.get('keyOrganizationId'),
  })

  return c.json({
    subject,
    ...(profile.email ? { email: profile.email } : {}),
    ...(profile.name ? { name: profile.name } : {}),
    authMethod: c.get('authMethod'),
    /** @deprecated kit demo KitRole — do not use for BO gates (use platformRole) */
    role: authService.roleForSubject(subject),
    platformRole: profile.platformRole,
    orgs: profile.orgs,
    requestId: c.get('requestId'),
  })
})

meRoutes.get('/api/keys', async (c) => {
  const db = c.get('db')!
  const subject = c.get('subject')!
  // D11: api_key always passes organizationId (empty → repo fail-closed []); session omits opts.
  const keys = await authService.listApiKeys(
    db,
    subject,
    c.get('authMethod') === 'api_key'
      ? { organizationId: c.get('keyOrganizationId') ?? '' }
      : undefined,
  )
  return c.json({ keys, requestId: c.get('requestId') })
})

meRoutes.post('/api/keys', async (c) => {
  // Mint only with session cookies — not with sk_ (prevents key-chain expansion).
  if (c.get('authMethod') !== 'session') {
    throw AppError.forbidden('API key mint requires a session cookie')
  }
  const subject = c.get('subject')!
  const db = c.get('db')!
  await assertRateLimit(db, `mint:${subject}`, MINT_LIMIT, MINT_WINDOW_MS)

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
  // `mintApiKey` refuses a missing organization itself (ADR-0003 D11) — no opt-in flag to pass.
  const minted = await authService.mintApiKey(db, subject, {
    name: body.data.name,
    organizationId,
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
