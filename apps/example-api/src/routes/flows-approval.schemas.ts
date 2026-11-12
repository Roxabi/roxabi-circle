import { createRoute, z } from '@hono/zod-openapi'
import { FLOWS_MODULE_ID } from '@kit/flows'
import { approvalDecisionBodySchema } from '../lib/flows-body-schemas'
import {
  authErrorResponses,
  errorResponse,
  notFoundErrorResponse,
  orgIsolationDescription,
  sessionOnlySecurity,
  validationErrorResponse,
} from '../lib/openapi'
import { requireModule } from '../middleware/org-context'

const flowsWrite = requireModule(FLOWS_MODULE_ID, 'write')
const conflictErrorResponse = {
  409: errorResponse(
    'Approval already decided with a different decision (including expiry), or the run is not running or task is not waiting for approval',
  ),
} as const

export const decideApproval = createRoute({
  method: 'post',
  path: '/api/flows/runs/{runId}/tasks/{taskId}/approval',
  tags: ['flows'],
  summary: 'Record a principal-bound approve or reject decision',
  description: orgIsolationDescription,
  security: sessionOnlySecurity,
  middleware: [flowsWrite] as const,
  request: {
    params: z.object({
      runId: z.string().min(1),
      taskId: z.string().min(1),
    }),
    body: {
      content: { 'application/json': { schema: approvalDecisionBodySchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description:
        'Decision already stored. A same-decision repeat for a running run with a waiting task re-sent the Workflow wake; woken is false when that wake failed.',
      content: {
        'application/json': {
          schema: z.object({
            runId: z.string(),
            taskId: z.string(),
            decision: z.enum(['approved', 'rejected']),
            woken: z.boolean(),
            requestId: z.string(),
          }),
        },
      },
    },
    202: {
      description:
        'Decision stored. woken is false when the Workflow wake failed; the row still stands.',
      content: {
        'application/json': {
          schema: z.object({
            runId: z.string(),
            taskId: z.string(),
            decision: z.enum(['approved', 'rejected']),
            woken: z.boolean(),
            requestId: z.string(),
          }),
        },
      },
    },
    ...validationErrorResponse,
    ...authErrorResponses,
    ...notFoundErrorResponse,
    ...conflictErrorResponse,
  },
})
