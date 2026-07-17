import { AppError } from '@gosilex/core'
import { Hono } from 'hono'
import { isKitModuleId } from '../lib/kit-modules'
import { requirePlatformRole } from '../middleware/org-context'
import { requireAuth } from '../middleware/require-auth'
import * as modulesService from '../services/modules'
import type { AppEnv } from '../types'

export const integrationsRoutes = new Hono<AppEnv>()

integrationsRoutes.use('/api/integrations', requireAuth)
integrationsRoutes.use('/api/integrations/*', requireAuth)

integrationsRoutes.get('/api/integrations/:id', requirePlatformRole('super_admin'), async (c) => {
  if (c.get('authMethod') !== 'session') {
    throw AppError.forbidden('Integration settings require a session cookie')
  }
  const id = c.req.param('id')
  if (!isKitModuleId(id)) throw AppError.notFound('Unknown integration')

  const db = c.get('db')!
  await modulesService.ensureKitModules(db)

  if (id === 'feedback') {
    const integration = await modulesService.getFeedbackIntegrationPublic(db)
    return c.json({ integration, requestId: c.get('requestId') })
  }

  throw AppError.notFound('Unknown integration')
})

integrationsRoutes.put('/api/integrations/:id', requirePlatformRole('super_admin'), async (c) => {
  if (c.get('authMethod') !== 'session') {
    throw AppError.forbidden('Integration settings require a session cookie')
  }
  const id = c.req.param('id')
  if (!isKitModuleId(id)) throw AppError.notFound('Unknown integration')

  const db = c.get('db')!
  const body = await c.req.json().catch(() => null)

  if (id === 'feedback') {
    const integration = await modulesService.saveFeedbackIntegration(db, body ?? {})
    return c.json({ integration, requestId: c.get('requestId') })
  }

  throw AppError.notFound('Unknown integration')
})
