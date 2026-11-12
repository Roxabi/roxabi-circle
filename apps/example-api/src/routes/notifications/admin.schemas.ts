import { createRoute, z } from '@hono/zod-openapi'
import {
  authErrorResponses,
  notFoundErrorResponse,
  sessionOnlySecurity,
  validationErrorResponse,
} from '../../lib/openapi'
import {
  requireOrgCapability,
  requireOrgContext,
  requirePlatformRole,
} from '../../middleware/org-context'
import { requireAuth } from '../../middleware/require-auth'
import { requireSession } from '../../middleware/require-session'
import { strictAdminBody, strictAdminQuery } from './admin-validation'
import {
  deliveryMetadataSchema,
  deliveryQuerySchema,
  emptyQuerySchema,
  identitySchema,
  notificationPageQuerySchema,
  okResponseSchema,
  orgParamsSchema,
  pageResponseSchema,
  rowIdSchema,
  ruleDtoSchema,
  ruleInputSchema,
  ruleResponseSchema,
} from './shared.schemas'

const errors = { ...validationErrorResponse, ...authErrorResponses, ...notFoundErrorResponse }
const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
})
const common = { tags: ['notifications-admin'], security: sessionOnlySecurity }
const page = ['limit', 'cursor']
const filters = [...page, 'channel', 'type', 'targetKind']
const deploymentRead = [requireAuth, requireSession, requirePlatformRole('staff', 'super_admin')]
const deploymentWrite = [requireAuth, requireSession, requirePlatformRole('super_admin')]
const orgRead = [
  requireAuth,
  requireSession,
  requireOrgContext({ allowSuperAdmin: true }),
  requireOrgCapability('manage_notifications'),
]
const orgWrite = [
  requireAuth,
  requireSession,
  requireOrgContext(),
  requireOrgCapability('manage_notifications'),
]
const ruleParams = z.strictObject({ ruleId: rowIdSchema })
const orgRuleParams = orgParamsSchema.extend({ ruleId: rowIdSchema })
const body = { required: true, content: { 'application/json': { schema: ruleInputSchema } } }

export const platformRulesList = createRoute({
  ...common,
  method: 'get',
  path: '/api/platform/notification-rules',
  summary: 'List deployment notification rules',
  middleware: [...deploymentRead, strictAdminQuery(page)] as const,
  request: { query: notificationPageQuerySchema },
  responses: { 200: json(pageResponseSchema(ruleDtoSchema), 'Rules'), ...errors },
})
export const platformRulesPut = createRoute({
  ...common,
  method: 'put',
  path: '/api/platform/notification-rules',
  summary: 'Set deployment notification rule',
  middleware: [...deploymentWrite, strictAdminQuery([]), strictAdminBody] as const,
  request: { query: emptyQuerySchema, body },
  responses: { 200: json(ruleResponseSchema, 'Rule'), ...errors },
})
export const platformRulesDelete = createRoute({
  ...common,
  method: 'delete',
  path: '/api/platform/notification-rules/{ruleId}',
  summary: 'Delete deployment notification rule',
  middleware: [...deploymentWrite, strictAdminQuery([])] as const,
  request: { params: ruleParams, query: emptyQuerySchema },
  responses: { 200: json(okResponseSchema, 'Deleted'), ...errors },
})
export const platformDeliveriesList = createRoute({
  ...common,
  method: 'get',
  path: '/api/platform/notification-deliveries',
  summary: 'List failed deployment notification deliveries',
  middleware: [...deploymentWrite, strictAdminQuery(filters)] as const,
  request: { query: deliveryQuerySchema.omit({ status: true }) },
  responses: {
    200: json(
      pageResponseSchema(
        z.strictObject({ ...deliveryMetadataSchema.shape, orgId: identitySchema }),
      ),
      'Failed deliveries',
    ),
    ...errors,
  },
})
export const orgRulesList = createRoute({
  ...common,
  method: 'get',
  path: '/api/orgs/{orgId}/notification-rules',
  summary: 'List organization notification rules',
  middleware: [...orgRead, strictAdminQuery(page)] as const,
  request: { params: orgParamsSchema, query: notificationPageQuerySchema },
  responses: { 200: json(pageResponseSchema(ruleDtoSchema), 'Rules'), ...errors },
})
export const orgRulesPut = createRoute({
  ...common,
  method: 'put',
  path: '/api/orgs/{orgId}/notification-rules',
  summary: 'Set organization notification rule',
  middleware: [...orgWrite, strictAdminQuery([]), strictAdminBody] as const,
  request: { params: orgParamsSchema, query: emptyQuerySchema, body },
  responses: { 200: json(ruleResponseSchema, 'Rule'), ...errors },
})
export const orgRulesDelete = createRoute({
  ...common,
  method: 'delete',
  path: '/api/orgs/{orgId}/notification-rules/{ruleId}',
  summary: 'Delete organization notification rule',
  middleware: [...orgWrite, strictAdminQuery([])] as const,
  request: { params: orgRuleParams, query: emptyQuerySchema },
  responses: { 200: json(okResponseSchema, 'Deleted'), ...errors },
})
export const orgDeliveriesList = createRoute({
  ...common,
  method: 'get',
  path: '/api/orgs/{orgId}/notification-deliveries',
  summary: 'List organization notification deliveries',
  middleware: [...orgRead, strictAdminQuery([...filters, 'status'])] as const,
  request: { params: orgParamsSchema, query: deliveryQuerySchema },
  responses: { 200: json(pageResponseSchema(deliveryMetadataSchema), 'Deliveries'), ...errors },
})
