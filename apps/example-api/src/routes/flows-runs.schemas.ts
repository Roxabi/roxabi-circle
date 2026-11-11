import { createRoute, z } from '@hono/zod-openapi'
import { FLOWS_MODULE_ID } from '@kit/flows'
import {
  authErrorResponses,
  notFoundErrorResponse,
  orgIsolationDescription,
  sessionOnlySecurity,
  validationErrorResponse,
} from '../lib/openapi'
import { requireModule } from '../middleware/org-context'
import { flowRunSchema, runIdParamSchema } from './flows.schemas'

const flowsRead = requireModule(FLOWS_MODULE_ID, 'read')

export const listRuns = createRoute({
  method: 'get',
  path: '/api/flows/runs',
  tags: ['flows'],
  summary: 'List flow runs for the current org',
  description: orgIsolationDescription,
  security: sessionOnlySecurity,
  middleware: [flowsRead] as const,
  responses: {
    200: {
      description: 'Runs visible to this org',
      content: {
        'application/json': {
          schema: z.object({ runs: z.array(flowRunSchema), requestId: z.string() }),
        },
      },
    },
    ...validationErrorResponse,
    ...authErrorResponses,
    ...notFoundErrorResponse,
  },
})

export const getRun = createRoute({
  method: 'get',
  path: '/api/flows/runs/{runId}',
  tags: ['flows'],
  summary: 'Read one flow run',
  description: orgIsolationDescription,
  security: sessionOnlySecurity,
  middleware: [flowsRead] as const,
  request: { params: runIdParamSchema },
  responses: {
    200: {
      description: 'The run',
      content: {
        'application/json': {
          schema: z.object({
            run: flowRunSchema,
            allowedOperations: z
              .object({ decideApproval: z.boolean() })
              .openapi('FlowRunAllowedOperations', {
                description: 'Advisory, per principal and X-Org-Id org; POST approval re-checks',
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
