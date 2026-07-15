import { AppError } from '@gosilex/core'
import { handleFeedbackReport } from '@gosilex/feedback/hono'
import { Hono } from 'hono'
import { assertRateLimit } from '../lib/rate-limit'
import { requireAuth } from '../middleware/require-auth'
import * as modulesService from '../services/modules'
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
  const spark = await modulesService.getFeedbackSparkRuntime(db)
  return handleFeedbackReport(c, {
    getAuthor: () => subject,
    sparkUrl: spark?.sparkUrl,
    apiKey: spark?.sparkApiKey,
    enabled: async () => {
      await modulesService.ensureKitModules(db)
      return modulesService.isModuleEnabled(db, 'feedback')
    },
    disabledMessage: 'Le module feedback est désactivé.',
  })
})
