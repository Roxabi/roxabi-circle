import { AppError } from '@kit/core'
import { Hono } from 'hono'
import { z } from 'zod'
import { requirePlatformRole } from '../middleware/org-context'
import { requireAuth } from '../middleware/require-auth'
import * as modulesService from '../services/modules'
import type { AppEnv } from '../types'

const patchSchema = z.object({
  enabled: z.boolean(),
})

export const modulesRoutes = new Hono<AppEnv>()

modulesRoutes.use('/api/modules', requireAuth)
modulesRoutes.use('/api/modules/*', requireAuth)

/** Legacy read shape for SPA — maps platform.available → enabled. */
modulesRoutes.get('/api/modules', async (c) => {
  const db = c.get('db')!
  await modulesService.ensureKitModules(db)
  const modules = await modulesService.getModulesState(db)
  return c.json({ modules, requestId: c.get('requestId') })
})

/** Platform catalogue write — super_admin only (was kit demo admin role). */
modulesRoutes.patch('/api/modules/:id', requirePlatformRole('super_admin'), async (c) => {
  if (c.get('authMethod') !== 'session') {
    throw AppError.forbidden('Module settings require a session cookie')
  }

  const parsed = patchSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    throw AppError.validation('Invalid module payload', parsed.error.flatten().fieldErrors)
  }

  const db = c.get('db')!
  await modulesService.ensureKitModules(db)
  await modulesService.setModuleEnabled(db, c.req.param('id'), parsed.data.enabled)
  const modules = await modulesService.getModulesState(db)
  return c.json({ modules, requestId: c.get('requestId') })
})
