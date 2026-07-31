import { AppError } from '@gosilex/core'
import { Hono } from 'hono'
import { clientIp } from '../lib/rate-limit'
import { requireBaAdapter } from '../lib/require-ba-adapter'
import { requireAuth } from '../middleware/require-auth'
import * as invitationsService from '../services/invitations'
import type { AppEnv } from '../types'

export const invitationsRoutes = new Hono<AppEnv>()

invitationsRoutes.use('/api/invitations/*', requireBaAdapter, requireAuth)

invitationsRoutes.post('/api/invitations/:invitationId/accept', async (c) => {
  if (c.get('authMethod') !== 'session') {
    throw AppError.forbidden('Accepting invitations requires a session cookie')
  }
  const result = await invitationsService.acceptInvitation(c.get('db')!, {
    invitationId: c.req.param('invitationId'),
    subjectUserId: c.get('subject')!,
    rateKey: clientIp(c.req) || c.get('subject')!,
  })
  return c.json({ ...result, requestId: c.get('requestId') })
})
