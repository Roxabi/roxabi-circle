import { AppError } from '@gosilex/core'
import { handleFeedbackReport } from '@gosilex/feedback/hono'
import { Hono } from 'hono'
import { assertRateLimit } from '../lib/rate-limit'
import { requireAuth } from '../middleware/require-auth'
import * as modulesService from '../services/modules'
import * as platformModulesService from '../services/platform-modules'
import type { AppEnv } from '../types'

/** 20 signalements / subject / hour (demo in-memory). */
const FEEDBACK_LIMIT = 20
const FEEDBACK_WINDOW_MS = 60 * 60 * 1000

export const feedbackRoutes = new Hono<AppEnv>()

feedbackRoutes.use('/api/report', requireAuth)

feedbackRoutes.post('/api/report', async (c) => {
  if (c.get('authMethod') !== 'session') {
    throw AppError.forbidden('Feedback report requires a session cookie')
  }
  const subject = c.get('subject')!
  assertRateLimit(`feedback:${subject}`, FEEDBACK_LIMIT, FEEDBACK_WINDOW_MS)
  const db = c.get('db')!
  await modulesService.ensureKitModules(db)
  const spark = await modulesService.getFeedbackSparkRuntime(db)

  // Dual-level when X-Org-Id present (ADR D7); else platform catalogue only (SPA HMAC demos)
  const orgId = c.req.header('x-org-id')?.trim()
  let moduleOn: boolean
  if (orgId) {
    moduleOn = await platformModulesService.isModuleEffective(db, orgId, 'feedback')
  } else {
    moduleOn = await modulesService.isModuleEnabled(db, 'feedback')
  }

  return handleFeedbackReport(c, {
    getAuthor: () => subject,
    enabled: () => moduleOn && spark !== null,
    sparkUrl: spark?.sparkUrl,
    apiKey: spark?.sparkApiKey,
    disabledMessage: 'Le module feedback est désactivé.',
  })
})
