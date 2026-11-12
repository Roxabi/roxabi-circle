import { createRoute, z } from '@hono/zod-openapi'
import { FLOWS_MODULE_ID } from '@kit/flows'
import { cancelRunBodySchema } from '../lib/flows-body-schemas'
import {
  authErrorResponses,
  errorResponse,
  notFoundErrorResponse,
  orgIsolationDescription,
  sessionOnlySecurity,
  validationErrorResponse,
} from '../lib/openapi'
import { requireModule } from '../middleware/org-context'
import { coerceJsonOrEmpty, flowRunSchema, runIdParamSchema } from './flows.schemas'

const flowsWrite = requireModule(FLOWS_MODULE_ID, 'write')
const conflictErrorResponse = { 409: errorResponse('Conflict') } as const

export const cancelRun = createRoute({
  method: 'post',
  path: '/api/flows/runs/{runId}/cancel',
  tags: ['flows'],
  summary: 'Cancel a queued or running flow run',
  description: orgIsolationDescription,
  security: sessionOnlySecurity,
  middleware: [flowsWrite, coerceJsonOrEmpty] as const,
  request: {
    params: runIdParamSchema,
    body: { content: { 'application/json': { schema: cancelRunBodySchema } }, required: false },
  },
  responses: {
    200: {
      description:
        'Run cancelled (or already cancelled). Terminate is best-effort and does not undo the row.',
      content: {
        'application/json': {
          schema: z.object({ run: flowRunSchema, requestId: z.string() }),
        },
      },
    },
    ...validationErrorResponse,
    ...authErrorResponses,
    ...notFoundErrorResponse,
    ...conflictErrorResponse,
  },
})
