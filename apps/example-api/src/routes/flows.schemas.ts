import { createRoute, z } from '@hono/zod-openapi'
import { AppError } from '@kit/core'
import { FLOWS_MODULE_ID, TASK_RECEIPT_OUTCOMES } from '@kit/flows'
import type { Context, Next } from 'hono'
import {
  createPlanBodySchema,
  createRunBodySchema,
  setEnabledBodySchema,
} from '../lib/flows-body-schemas'
import {
  authErrorResponses,
  errorResponse,
  notFoundErrorResponse,
  orgIsolationDescription,
  sessionOnlySecurity,
  validationErrorResponse,
} from '../lib/openapi'
import { requireModule } from '../middleware/org-context'
import type { AppEnv } from '../types'

/** Blank body → `{}`. Invalid JSON stays 400, not an empty alias. */
export async function coerceJsonOrEmpty(c: Context<AppEnv>, next: Next) {
  const text = await c.req.text()
  if (!text.trim()) {
    // Hono's BodyCache is typed as Partial<Body> but stores parsed-text Promises.
    const bodyCache = c.req.bodyCache as { text?: Promise<string> }
    bodyCache.text = Promise.resolve('{}')
    await next()
    return
  }
  try {
    JSON.parse(text)
  } catch {
    throw AppError.validation('Invalid JSON')
  }
  await next()
}

const flowPlanSchema = z
  .object({
    id: z.string(),
    orgId: z.string(),
    planKey: z.string(),
    version: z.number(),
    enabled: z.boolean(),
    digest: z.string().openapi({ description: 'FNV-1a index, not SHA-256 identity.' }),
  })
  .openapi('FlowPlan')

const flowTaskReceiptSchema = z.object({
  taskId: z.string(),
  outcome: z.enum(TASK_RECEIPT_OUTCOMES),
  errorCode: z.string().optional(),
  output: z.string().optional(),
  approval: z.object({ by: z.string(), at: z.string() }).optional(),
})

const receiptBundleSchema = z.object({
  receiptVersion: z.literal(1),
  tokensUsed: z.number(),
  tasks: z.record(z.string(), flowTaskReceiptSchema),
})

export const flowRunSchema = z
  .object({
    id: z.string(),
    orgId: z.string(),
    planId: z.string(),
    status: z.string(),
    receipts: receiptBundleSchema.nullable(),
    errorCode: z.string().nullable(),
  })
  .openapi('FlowRun')

const acceptedRunSchema = z
  .object({
    id: z.string(),
    status: z.literal('queued'),
  })
  .openapi('FlowRunAccepted')

const planIdParamSchema = z.object({ planId: z.string().min(1) })
export const runIdParamSchema = z.object({ runId: z.string().min(1) })

const conflictErrorResponse = { 409: errorResponse('Conflict') } as const
const planBodySchema = z.object({ plan: flowPlanSchema, requestId: z.string() })
function planResponse(description: string) {
  return { description, content: { 'application/json': { schema: planBodySchema } } }
}

const flowsRead = requireModule(FLOWS_MODULE_ID, 'read')
const flowsWrite = requireModule(FLOWS_MODULE_ID, 'write')

export const listPlans = createRoute({
  method: 'get',
  path: '/api/flows/plans',
  tags: ['flows'],
  summary: 'List flow plans for the current org',
  description: orgIsolationDescription,
  security: sessionOnlySecurity,
  middleware: [flowsRead] as const,
  responses: {
    200: {
      description: 'Plans visible to this org',
      content: {
        'application/json': {
          schema: z.object({
            plans: z.array(flowPlanSchema),
            allowedOperations: z
              .object({
                setPlanEnabled: z.boolean(),
                createPlan: z.boolean(),
                createRun: z.boolean(),
              })
              .openapi('FlowAllowedOperations', {
                description: 'Advisory, per principal and X-Org-Id org; PATCH/POST re-check',
              }),
            requestId: z.string(),
          }),
        },
      },
    },
    ...validationErrorResponse,
    ...authErrorResponses,
    ...notFoundErrorResponse,
  },
})

export const createPlan = createRoute({
  method: 'post',
  path: '/api/flows/plans',
  tags: ['flows'],
  summary: 'Publish a flow plan from YAML',
  description: orgIsolationDescription,
  security: sessionOnlySecurity,
  middleware: [flowsWrite, coerceJsonOrEmpty] as const,
  request: {
    body: { content: { 'application/json': { schema: createPlanBodySchema } }, required: true },
  },
  responses: {
    200: planResponse(
      'Identical YAML bytes — existing plan. digest is the FNV index, not identity.',
    ),
    201: planResponse('Created plan version'),
    ...validationErrorResponse,
    ...authErrorResponses,
    ...notFoundErrorResponse,
    ...conflictErrorResponse,
    409: errorResponse(
      'Retryable `details.reason: PLAN_VERSION_RACE` on the version unique. Same-bytes unique failure re-reads and is 200.',
    ),
  },
})

export const checkPlan = createRoute({
  method: 'post',
  path: '/api/flows/plans/check',
  tags: ['flows'],
  summary: 'Check a flow plan YAML without publishing',
  description: orgIsolationDescription,
  security: sessionOnlySecurity,
  middleware: [flowsWrite, coerceJsonOrEmpty] as const,
  request: {
    body: { content: { 'application/json': { schema: createPlanBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'Plan is valid against the org grant',
      content: {
        'application/json': {
          schema: z.object({ ok: z.literal(true), requestId: z.string() }),
        },
      },
    },
    ...validationErrorResponse,
    ...authErrorResponses,
    ...notFoundErrorResponse,
  },
})

export const getPlan = createRoute({
  method: 'get',
  path: '/api/flows/plans/{planId}',
  tags: ['flows'],
  summary: 'Read one flow plan',
  description: orgIsolationDescription,
  security: sessionOnlySecurity,
  middleware: [flowsRead] as const,
  request: { params: planIdParamSchema },
  responses: {
    200: {
      description: 'The plan',
      content: {
        'application/json': {
          schema: z.object({ plan: flowPlanSchema, requestId: z.string() }),
        },
      },
    },
    ...validationErrorResponse,
    ...authErrorResponses,
    ...notFoundErrorResponse,
  },
})

export const setPlanEnabled = createRoute({
  method: 'patch',
  path: '/api/flows/plans/{planId}',
  tags: ['flows'],
  summary: 'Enable or disable a flow plan',
  description: orgIsolationDescription,
  security: sessionOnlySecurity,
  middleware: [flowsWrite, coerceJsonOrEmpty] as const,
  request: {
    params: planIdParamSchema,
    body: { content: { 'application/json': { schema: setEnabledBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'Updated plan',
      content: {
        'application/json': {
          schema: z.object({ plan: flowPlanSchema, requestId: z.string() }),
        },
      },
    },
    ...validationErrorResponse,
    ...authErrorResponses,
    ...notFoundErrorResponse,
  },
})

export const createRun = createRoute({
  method: 'post',
  path: '/api/flows/plans/{planId}/runs',
  tags: ['flows'],
  summary: 'Queue a run of a published plan',
  description: orgIsolationDescription,
  security: sessionOnlySecurity,
  middleware: [flowsWrite, coerceJsonOrEmpty] as const,
  request: {
    params: planIdParamSchema,
    body: { content: { 'application/json': { schema: createRunBodySchema } }, required: false },
  },
  responses: {
    202: {
      description: 'Run queued',
      content: {
        'application/json': {
          schema: z.object({ run: acceptedRunSchema, requestId: z.string() }),
        },
      },
    },
    ...validationErrorResponse,
    ...authErrorResponses,
    ...notFoundErrorResponse,
    ...conflictErrorResponse,
    502: errorResponse('Workflow create failed — the run is marked failed'),
  },
})
