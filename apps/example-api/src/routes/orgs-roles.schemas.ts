import { createRoute, z } from '@hono/zod-openapi'
import {
  authErrorResponses,
  notFoundErrorResponse,
  orgIsolationDescription,
  sessionOnlySecurity,
  sessionOrKeySecurity,
  validationErrorResponse,
} from '../lib/openapi'
import { requireOrgCapability, requireOrgContext } from '../middleware/org-context'
import { requireSession } from '../middleware/require-session'
import { conflictResponse, orgIdParam, requestIdField } from './orgs.schemas'

const orgCtx = requireOrgContext()
const orgCtxSuper = requireOrgContext({ allowSuperAdmin: true })
const manageMembers = requireOrgCapability('manage_members')

const createRoleSchema = z
  .object({
    key: z.string().min(1).max(48),
    name: z.string().min(1).max(80),
    grants: z
      .array(
        z.object({
          moduleId: z.string().min(1),
          access: z.enum(['write', 'read', 'disabled']),
        }),
      )
      .optional(),
  })
  .strict()

const patchGrantSchema = z
  .object({
    access: z.enum(['write', 'read', 'disabled']),
  })
  .strict()

const orgRoleSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    key: z.string(),
    name: z.string(),
    isSystem: z.boolean(),
    grants: z.array(
      z.object({
        moduleId: z.string(),
        access: z.enum(['write', 'read', 'disabled']),
      }),
    ),
  })
  .openapi('OrgRole')

const orgRoleParams = z.object({
  orgId: z.string().min(1),
  roleId: z.string().min(1),
})
const orgRoleGrantParams = z.object({
  orgId: z.string().min(1),
  roleId: z.string().min(1),
  moduleId: z.string().min(1),
})

/** Phase B — list system + custom roles with module grants. */
export const listRoles = createRoute({
  method: 'get',
  path: '/api/orgs/{orgId}/roles',
  tags: ['orgs'],
  summary: 'List system and custom roles with module grants',
  description: orgIsolationDescription,
  security: sessionOrKeySecurity,
  middleware: [orgCtxSuper, manageMembers] as const,
  request: { params: orgIdParam },
  responses: {
    200: {
      description: 'Roles including grants (or super_admin bypass)',
      content: {
        'application/json': {
          schema: z.object({ roles: z.array(orgRoleSchema), requestId: requestIdField }),
        },
      },
    },
    ...validationErrorResponse,
    ...authErrorResponses,
    ...notFoundErrorResponse,
  },
})

export const createRole = createRoute({
  method: 'post',
  path: '/api/orgs/{orgId}/roles',
  tags: ['orgs'],
  summary: 'Create a custom org role (session only)',
  description: orgIsolationDescription,
  security: sessionOnlySecurity,
  middleware: [orgCtx, manageMembers, requireSession] as const,
  request: {
    params: orgIdParam,
    body: { content: { 'application/json': { schema: createRoleSchema } }, required: true },
  },
  responses: {
    201: {
      description: 'Created role with grants',
      content: {
        'application/json': {
          schema: z.object({ role: orgRoleSchema, requestId: requestIdField }),
        },
      },
    },
    ...validationErrorResponse,
    ...authErrorResponses,
    ...notFoundErrorResponse,
    ...conflictResponse,
  },
})

export const patchRoleGrant = createRoute({
  method: 'patch',
  path: '/api/orgs/{orgId}/roles/{roleId}/grants/{moduleId}',
  tags: ['orgs'],
  summary: 'Set a custom role module grant (session only)',
  description: orgIsolationDescription,
  security: sessionOnlySecurity,
  middleware: [orgCtx, manageMembers, requireSession] as const,
  request: {
    params: orgRoleGrantParams,
    body: { content: { 'application/json': { schema: patchGrantSchema } }, required: true },
  },
  responses: {
    200: {
      description: 'Updated role with grants',
      content: {
        'application/json': {
          schema: z.object({ role: orgRoleSchema, requestId: requestIdField }),
        },
      },
    },
    ...validationErrorResponse,
    ...authErrorResponses,
    ...notFoundErrorResponse,
  },
})

export const deleteRole = createRoute({
  method: 'delete',
  path: '/api/orgs/{orgId}/roles/{roleId}',
  tags: ['orgs'],
  summary: 'Delete a custom org role (session only)',
  description: orgIsolationDescription,
  security: sessionOnlySecurity,
  middleware: [orgCtx, manageMembers, requireSession] as const,
  request: { params: orgRoleParams },
  responses: {
    200: {
      description: 'Deleted',
      content: {
        'application/json': {
          schema: z.object({ ok: z.literal(true), requestId: requestIdField }),
        },
      },
    },
    ...validationErrorResponse,
    ...authErrorResponses,
    ...notFoundErrorResponse,
    ...conflictResponse,
  },
})
