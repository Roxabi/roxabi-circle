import { AppError } from '@kit/core'
import { handleFeedbackReport } from '@kit/feedback/hono'
import { Hono } from 'hono'
import { assertRateLimit } from '../lib/rate-limit'
import { requireAuth } from '../middleware/require-auth'
import * as orgsRepo from '../repos/orgs'
import * as modulesService from '../services/modules'
import * as orgRolesService from '../services/org-roles'
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
  const db = c.get('db')!
  await assertRateLimit(db, `feedback:${subject}`, FEEDBACK_LIMIT, FEEDBACK_WINDOW_MS)
  await modulesService.ensureKitModules(db)
  const pilotage = await modulesService.getFeedbackPilotageRuntime(db)

  // Org path: single resolver (platform ∧ org.enabled ∧ grant write).
  // No X-Org-Id: platform catalogue only (legacy SPA demo without tenancy).
  const orgId = c.req.header('x-org-id')?.trim()
  let moduleOn: boolean
  if (orgId) {
    const org = await orgsRepo.findOrgById(db, orgId)
    if (org?.status !== 'active') {
      throw AppError.notFound('Organization not found')
    }
    const membership = await orgsRepo.findMembership(db, orgId, subject)
    if (!membership) {
      throw AppError.notFound('Organization not found')
    }
    const allowed = await orgRolesService.resolveModuleAccess(db, {
      organizationId: orgId,
      roleKey: membership.role,
      moduleId: 'feedback',
      op: 'write',
    })
    if (!allowed) {
      const platformOk = await platformModulesService.isModuleEffective(db, orgId, 'feedback')
      if (!platformOk) throw AppError.notFound('Module not available')
      throw AppError.forbidden('Insufficient module grant')
    }
    moduleOn = true
  } else {
    moduleOn = await modulesService.isModuleEnabled(db, 'feedback')
  }

  return handleFeedbackReport(c, {
    getAuthor: () => subject,
    enabled: () => moduleOn && pilotage !== null,
    pilotageUrl: pilotage?.pilotageUrl,
    apiKey: pilotage?.pilotageApiKey,
    disabledMessage: 'Le module feedback est désactivé.',
  })
})
