import { AppError } from '@gosilex/core'
import {
  type FeedbackEnvSlice,
  handleFeedbackReport,
  isFeedbackEnabled,
} from '@gosilex/feedback/hono'
import { Hono } from 'hono'
import { assertRateLimit } from '../lib/rate-limit'
import { requireAuth } from '../middleware/require-auth'
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
  return handleFeedbackReport(c, {
    getAuthor: () => subject,
    enabled: () => isFeedbackEnabled(c.env as FeedbackEnvSlice),
  })
})
