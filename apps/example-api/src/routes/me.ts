import { createDb } from '@gosilex/db'
import { Hono } from 'hono'
import { schema } from '../db/schema'
import { requireAuth } from '../middleware/require-auth'
import * as authService from '../services/auth'
import type { AppEnv } from '../types'

export const meRoutes = new Hono<AppEnv>()

meRoutes.get('/api/me', async (c) => {
  await requireAuth(c)
  return c.json({
    subject: c.get('subject'),
    authMethod: c.get('authMethod'),
    requestId: c.get('requestId'),
  })
})

meRoutes.post('/api/keys', async (c) => {
  await requireAuth(c)
  const db = createDb(c.env.DB, schema)
  const subject = c.get('subject')!
  const minted = await authService.mintApiKey(db, subject)
  return c.json({
    id: minted.id,
    key: minted.key,
    requestId: c.get('requestId'),
  })
})
