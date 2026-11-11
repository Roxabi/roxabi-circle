import { OpenAPIHono } from '@hono/zod-openapi'
import { requireOrgContext } from '../middleware/org-context'
import { requireAuth } from '../middleware/require-auth'
import { requireSession } from '../middleware/require-session'
import * as flowsService from '../services/flows'
import { decideRunApproval } from '../services/flows-approval'
import { cancelFlowRun } from '../services/flows-cancel'
import { flowConsoleCapabilities, flowRunCapabilities } from '../services/flows-capabilities'
import type { AppEnv } from '../types'
import {
  checkPlan,
  createPlan,
  createRun,
  getPlan,
  listPlans,
  setPlanEnabled,
} from './flows.schemas'
import { decideApproval } from './flows-approval.schemas'
import { cancelRun } from './flows-cancel.schemas'
import { getRun, listRuns } from './flows-runs.schemas'

export const flowsRoutes = new OpenAPIHono<AppEnv>()

const orgMw = requireOrgContext({ allowSuperAdmin: false })

flowsRoutes.use('/api/flows', requireAuth, requireSession, orgMw)
flowsRoutes.use('/api/flows/*', requireAuth, requireSession, orgMw)

flowsRoutes.openapi(listPlans, async (c) => {
  const db = c.get('db')!
  const orgId = c.get('orgId')!
  const plans = await flowsService.listPlansForOrg(db, orgId)
  const allowedOperations = await flowConsoleCapabilities(db, {
    orgId,
    orgRole: c.get('orgRole'),
    authMethod: c.get('authMethod'),
  })
  return c.json({ plans, allowedOperations, requestId: c.get('requestId') })
})

flowsRoutes.openapi(createPlan, async (c) => {
  const published = await flowsService.createPlan(c.get('db')!, c.env, {
    orgId: c.get('orgId')!,
    subject: c.get('subject')!,
    orgRole: c.get('orgRole'),
    body: c.req.valid('json'),
  })
  const body = { plan: published.plan, requestId: c.get('requestId') }
  if (published.status === 200) return c.json(body, 200)
  return c.json(body, 201)
})

flowsRoutes.openapi(checkPlan, async (c) => {
  await flowsService.checkPlanYaml(c.get('db')!, c.env, {
    orgId: c.get('orgId')!,
    orgRole: c.get('orgRole'),
    body: c.req.valid('json'),
  })
  return c.json({ ok: true, requestId: c.get('requestId') })
})

flowsRoutes.openapi(getPlan, async (c) => {
  const plan = await flowsService.getPlanForOrg(
    c.get('db')!,
    c.get('orgId')!,
    c.req.valid('param').planId,
  )
  return c.json({ plan, requestId: c.get('requestId') })
})

flowsRoutes.openapi(setPlanEnabled, async (c) => {
  const plan = await flowsService.setEnabled(c.get('db')!, {
    orgId: c.get('orgId')!,
    planId: c.req.valid('param').planId,
    orgRole: c.get('orgRole'),
    body: c.req.valid('json'),
  })
  return c.json({ plan, requestId: c.get('requestId') })
})

flowsRoutes.openapi(createRun, async (c) => {
  const run = await flowsService.createRun(c.get('db')!, c.env, {
    orgId: c.get('orgId')!,
    planId: c.req.valid('param').planId,
    subject: c.get('subject')!,
    orgRole: c.get('orgRole'),
    authMethod: c.get('authMethod'),
    body: c.req.valid('json'),
  })
  return c.json({ run, requestId: c.get('requestId') }, 202)
})

flowsRoutes.openapi(listRuns, async (c) => {
  const runs = await flowsService.listRunsForOrg(c.get('db')!, c.get('orgId')!)
  return c.json({ runs, requestId: c.get('requestId') })
})

flowsRoutes.openapi(getRun, async (c) => {
  const db = c.get('db')!
  const orgId = c.get('orgId')!
  const run = await flowsService.getRunForOrg(db, orgId, c.req.valid('param').runId)
  const allowedOperations = await flowRunCapabilities(db, {
    orgId,
    orgRole: c.get('orgRole'),
    authMethod: c.get('authMethod'),
  })
  return c.json({ run, allowedOperations, requestId: c.get('requestId') })
})

flowsRoutes.openapi(cancelRun, async (c) => {
  const run = await cancelFlowRun(c.get('db')!, c.env, {
    orgId: c.get('orgId')!,
    runId: c.req.valid('param').runId,
    orgRole: c.get('orgRole'),
    authMethod: c.get('authMethod'),
    body: c.req.valid('json'),
  })
  return c.json({ run, requestId: c.get('requestId') })
})

flowsRoutes.openapi(decideApproval, async (c) => {
  const { runId, taskId } = c.req.valid('param')
  const { status, ...decision } = await decideRunApproval(c.get('db')!, c.env, {
    orgId: c.get('orgId')!,
    runId,
    taskId,
    subject: c.get('subject')!,
    orgRole: c.get('orgRole'),
    authMethod: c.get('authMethod'),
    body: c.req.valid('json'),
  })
  return c.json({ ...decision, requestId: c.get('requestId') }, status)
})
