import { AppError } from '@kit/core'
import { FLOWS_MODULE_ID } from '@kit/flows'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { requireModule, requireOrgContext } from '../middleware/org-context'
import { requireAuth } from '../middleware/require-auth'
import { requireSession } from '../middleware/require-session'
import * as flowsService from '../services/flows'
import type { AppEnv } from '../types'

/** Blank body → `{}`. Invalid JSON → 400 (not aliased to empty). */
async function readJsonOrEmpty(c: Context<AppEnv>): Promise<unknown> {
  const text = await c.req.text()
  if (!text.trim()) return {}
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw AppError.validation('Invalid JSON')
  }
}

export const flowsRoutes = new Hono<AppEnv>()

const orgMw = requireOrgContext({ allowSuperAdmin: false })
const flowsRead = requireModule(FLOWS_MODULE_ID, 'read')
const flowsWrite = requireModule(FLOWS_MODULE_ID, 'write')

flowsRoutes.use('/api/flows', requireAuth, requireSession, orgMw)
flowsRoutes.use('/api/flows/*', requireAuth, requireSession, orgMw)

flowsRoutes.get('/api/flows/plans', flowsRead, async (c) => {
  const plans = await flowsService.listPlansForOrg(c.get('db')!, c.get('orgId')!)
  return c.json({ plans, requestId: c.get('requestId') })
})

flowsRoutes.post('/api/flows/plans', flowsWrite, async (c) => {
  const plan = await flowsService.createPlan(c.get('db')!, {
    orgId: c.get('orgId')!,
    subject: c.get('subject')!,
    orgRole: c.get('orgRole'),
    platformRole: c.get('platformRole'),
    body: await readJsonOrEmpty(c),
  })
  return c.json({ plan, requestId: c.get('requestId') }, 201)
})

flowsRoutes.get('/api/flows/plans/:planId', flowsRead, async (c) => {
  const plan = await flowsService.getPlanForOrg(
    c.get('db')!,
    c.get('orgId')!,
    c.req.param('planId'),
  )
  return c.json({ plan, requestId: c.get('requestId') })
})

flowsRoutes.patch('/api/flows/plans/:planId', flowsWrite, async (c) => {
  const plan = await flowsService.setEnabled(c.get('db')!, {
    orgId: c.get('orgId')!,
    planId: c.req.param('planId'),
    orgRole: c.get('orgRole'),
    platformRole: c.get('platformRole'),
    body: await readJsonOrEmpty(c),
  })
  return c.json({ plan, requestId: c.get('requestId') })
})

flowsRoutes.post('/api/flows/plans/:planId/runs', flowsWrite, async (c) => {
  const run = await flowsService.createRun(c.get('db')!, c.env, {
    orgId: c.get('orgId')!,
    planId: c.req.param('planId'),
    subject: c.get('subject')!,
    orgRole: c.get('orgRole'),
    platformRole: c.get('platformRole'),
    authMethod: c.get('authMethod'),
    body: await readJsonOrEmpty(c),
  })
  return c.json({ run, requestId: c.get('requestId') }, 202)
})

flowsRoutes.get('/api/flows/runs', flowsRead, async (c) => {
  const runs = await flowsService.listRunsForOrg(c.get('db')!, c.get('orgId')!)
  return c.json({ runs, requestId: c.get('requestId') })
})

flowsRoutes.get('/api/flows/runs/:runId', flowsRead, async (c) => {
  const run = await flowsService.getRunForOrg(c.get('db')!, c.get('orgId')!, c.req.param('runId'))
  return c.json({ run, requestId: c.get('requestId') })
})
