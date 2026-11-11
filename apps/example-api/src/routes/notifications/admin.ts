import { OpenAPIHono } from '@hono/zod-openapi'
import { AppError } from '@kit/core'
import type { AuditRow, RuleScope } from '@kit/notifications/repos'
import {
  deleteRule,
  listDeliveryMetadata,
  listDeploymentFailures,
  listRules,
  putRule,
} from '@kit/notifications/repos'
import type { Context } from 'hono'
import { invalidRequest } from '../../lib/openapi'
import { validateRuleInput } from '../../services/notifications/rule-input'
import type { AppEnv } from '../../types'
import {
  orgDeliveriesList,
  orgRulesDelete,
  orgRulesList,
  orgRulesPut,
  platformDeliveriesList,
  platformRulesDelete,
  platformRulesList,
  platformRulesPut,
} from './admin.schemas'
import { validateAdminCursor } from './admin-validation'

export const notificationsAdminRoutes = new OpenAPIHono<AppEnv>()
function dbOf(c: Context<AppEnv>) {
  const db = c.get('db')
  if (!db) throw AppError.internal('db not bound')
  return db
}
function orgScope(c: Context<AppEnv>): RuleScope {
  const orgId = c.get('orgId')
  if (!orgId) throw AppError.internal('organization context missing')
  return { level: 'organization', orgId }
}
function audit(
  c: Context<AppEnv>,
  scope: RuleScope,
  targetId: string,
  action: string,
  now: number,
): AuditRow {
  const actorUserId = c.get('subject')
  if (!actorUserId) throw AppError.unauthorized()
  return {
    id: `aud_${crypto.randomUUID()}`,
    actorUserId,
    orgId: scope.level === 'organization' ? scope.orgId : null,
    targetId,
    action,
    meta: {},
    createdAt: now,
  }
}
const deployment: RuleScope = { level: 'deployment' }
const invalid = invalidRequest('Invalid request')

notificationsAdminRoutes.openapi(
  platformRulesList,
  async (c) => {
    validateAdminCursor(c.req.valid('query').cursor)
    const result = await listRules(dbOf(c), deployment, c.req.valid('query'))
    return c.json({ ...result, requestId: c.get('requestId') }, 200)
  },
  invalid,
)
notificationsAdminRoutes.openapi(
  platformRulesPut,
  async (c) => {
    const rule = validateRuleInput('deployment', c.req.valid('json'))
    const now = Date.now()
    const id = `nr_${crypto.randomUUID()}`
    const stored = await putRule(
      dbOf(c),
      deployment,
      { ...rule, id },
      now,
      audit(c, deployment, id, 'notification.rule.set', now),
    )
    return c.json({ rule: stored, requestId: c.get('requestId') }, 200)
  },
  invalid,
)
notificationsAdminRoutes.openapi(
  platformRulesDelete,
  async (c) => {
    const { ruleId } = c.req.valid('param')
    const now = Date.now()
    await deleteRule(
      dbOf(c),
      deployment,
      ruleId,
      audit(c, deployment, ruleId, 'notification.rule.delete', now),
    )
    return c.json({ ok: true as const, requestId: c.get('requestId') }, 200)
  },
  invalid,
)
notificationsAdminRoutes.openapi(
  platformDeliveriesList,
  async (c) => {
    validateAdminCursor(c.req.valid('query').cursor)
    const result = await listDeploymentFailures(dbOf(c), c.req.valid('query'))
    return c.json({ ...result, requestId: c.get('requestId') }, 200)
  },
  invalid,
)
notificationsAdminRoutes.openapi(
  orgRulesList,
  async (c) => {
    validateAdminCursor(c.req.valid('query').cursor)
    const result = await listRules(dbOf(c), orgScope(c), c.req.valid('query'))
    return c.json({ ...result, requestId: c.get('requestId') }, 200)
  },
  invalid,
)
notificationsAdminRoutes.openapi(
  orgRulesPut,
  async (c) => {
    const scope = orgScope(c)
    const rule = validateRuleInput('organization', c.req.valid('json'))
    const now = Date.now()
    const id = `nr_${crypto.randomUUID()}`
    const stored = await putRule(
      dbOf(c),
      scope,
      { ...rule, id },
      now,
      audit(c, scope, id, 'notification.rule.set', now),
    )
    return c.json({ rule: stored, requestId: c.get('requestId') }, 200)
  },
  invalid,
)
notificationsAdminRoutes.openapi(
  orgRulesDelete,
  async (c) => {
    const scope = orgScope(c)
    const { ruleId } = c.req.valid('param')
    const now = Date.now()
    await deleteRule(
      dbOf(c),
      scope,
      ruleId,
      audit(c, scope, ruleId, 'notification.rule.delete', now),
    )
    return c.json({ ok: true as const, requestId: c.get('requestId') }, 200)
  },
  invalid,
)
notificationsAdminRoutes.openapi(
  orgDeliveriesList,
  async (c) => {
    validateAdminCursor(c.req.valid('query').cursor)
    const scope = orgScope(c)
    if (scope.level !== 'organization') throw AppError.internal('organization context missing')
    const result = await listDeliveryMetadata(dbOf(c), { orgId: scope.orgId }, c.req.valid('query'))
    return c.json({ ...result, requestId: c.get('requestId') }, 200)
  },
  invalid,
)
