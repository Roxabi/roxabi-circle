import { AppError } from '@gosilex/core'
import { createDb } from '@gosilex/db'
import { Hono } from 'hono'
import { schema } from '../db/schema'
import { assertRateLimit } from '../lib/rate-limit'
import { requireAuth } from '../middleware/require-auth'
import * as authService from '../services/auth'
import type { AppEnv } from '../types'

/** 30 key mints / subject / hour (demo in-memory). */
const MINT_LIMIT = 30
const MINT_WINDOW_MS = 60 * 60 * 1000

export const meRoutes = new Hono<AppEnv>()

meRoutes.use('*', requireAuth)

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
  const db = createDb(c.env.DB, schema)
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

  const db = createDb(c.env.DB, schema)
  const minted = await authService.mintApiKey(db, subject)
  return c.json({
    id: minted.id,
    key: minted.key,
    requestId: c.get('requestId'),
  })
})

meRoutes.delete('/api/keys/:id', async (c) => {
  if (c.get('authMethod') !== 'session') {
    throw AppError.forbidden('API key revoke requires a session cookie')
  }
  const db = createDb(c.env.DB, schema)
  const subject = c.get('subject')!
  await authService.revokeApiKey(db, c.req.param('id'), subject)
  return c.json({ ok: true, requestId: c.get('requestId') })
})
