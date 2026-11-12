import { createRoute, z } from '@hono/zod-openapi'
import { COMMENTS_MODULE_ID } from '@kit/comments'
import { TASKS_MODULE_ID } from '@kit/tasks'
import {
  authErrorResponses,
  notFoundErrorResponse,
  orgIsolationDescription,
  sessionOrKeySecurity,
  validationErrorResponse,
} from '../lib/openapi'
import { requireModule } from '../middleware/org-context'
import { idParamSchema } from './tasks.schemas'

const createLinkBodySchema = z
  .object({
    fromTaskId: z.string().min(1).max(256),
    toTaskId: z.string().min(1).max(256),
    kind: z.enum(['parent', 'blocks', 'duplicates']),
  })
  .strict()

const createCommentBodySchema = z
  .object({
    body: z.string().min(1).max(20_000),
    visibility: z.enum(['internal', 'shared']).optional(),
  })
  .strict()

const taskLinkSchema = z
  .object({
    id: z.string(),
    orgId: z.string(),
    fromTaskId: z.string(),
    toTaskId: z.string(),
    kind: z.string(),
    createdAt: z.number().optional(),
  })
  .openapi('TaskLink')

const commentSchema = z
  .object({
    id: z.string(),
    orgId: z.string(),
    targetType: z.string(),
    targetId: z.string(),
    authorId: z.string(),
    body: z.string(),
    visibility: z.string(),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .openapi('Comment')

const commentIdParamSchema = z.object({ commentId: z.string().min(1) })

const tasksRead = requireModule(TASKS_MODULE_ID, 'read')
const tasksWrite = requireModule(TASKS_MODULE_ID, 'write')
const commentsRead = requireModule(COMMENTS_MODULE_ID, 'read')
const commentsWrite = requireModule(COMMENTS_MODULE_ID, 'write')

export const listLinks = createRoute({
  method: 'get',
  path: '/api/tasks/links',
  tags: ['tasks'],
  summary: 'List task links',
  description: orgIsolationDescription,
  security: sessionOrKeySecurity,
  middleware: [tasksRead] as const,
  responses: {
    200: {
      description: 'Links in the org',
      content: {
        'application/json': {
          schema: z.object({ links: z.array(taskLinkSchema), requestId: z.string() }),
        },
      },
    },
    ...validationErrorResponse,
    ...authErrorResponses,
    ...notFoundErrorResponse,
  },
})

export const createLink = createRoute({
  method: 'post',
  path: '/api/tasks/links',
  tags: ['tasks'],
  summary: 'Create a task link',
  description: orgIsolationDescription,
  security: sessionOrKeySecurity,
  middleware: [tasksWrite] as const,
  request: {
    body: { content: { 'application/json': { schema: createLinkBodySchema } }, required: true },
  },
  responses: {
    201: {
      description: 'Created link',
      content: {
        'application/json': { schema: z.object({ link: taskLinkSchema, requestId: z.string() }) },
      },
    },
    ...validationErrorResponse,
    ...authErrorResponses,
    ...notFoundErrorResponse,
  },
})

export const deleteComment = createRoute({
  method: 'delete',
  path: '/api/tasks/comments/{commentId}',
  tags: ['tasks'],
  summary: 'Delete a comment',
  description: orgIsolationDescription,
  security: sessionOrKeySecurity,
  middleware: [tasksRead, commentsWrite] as const,
  request: { params: commentIdParamSchema },
  responses: {
    200: {
      description: 'Deleted',
      content: {
        'application/json': { schema: z.object({ ok: z.literal(true), requestId: z.string() }) },
      },
    },
    ...validationErrorResponse,
    ...authErrorResponses,
    ...notFoundErrorResponse,
  },
})

export const listComments = createRoute({
  method: 'get',
  path: '/api/tasks/{id}/comments',
  tags: ['tasks'],
  summary: 'List comments on a task',
  description: orgIsolationDescription,
  security: sessionOrKeySecurity,
  middleware: [tasksRead, commentsRead] as const,
  request: { params: idParamSchema },
  responses: {
    200: {
      description: 'Comments the caller may see',
      content: {
        'application/json': {
          schema: z.object({ comments: z.array(commentSchema), requestId: z.string() }),
        },
      },
    },
    ...validationErrorResponse,
    ...authErrorResponses,
    ...notFoundErrorResponse,
  },
})

export const createComment = createRoute({
  method: 'post',
  path: '/api/tasks/{id}/comments',
  tags: ['tasks'],
  summary: 'Comment on a task',
  description: orgIsolationDescription,
  security: sessionOrKeySecurity,
  middleware: [tasksRead, commentsWrite] as const,
  request: {
    params: idParamSchema,
    body: { content: { 'application/json': { schema: createCommentBodySchema } }, required: true },
  },
  responses: {
    201: {
      description: 'Created comment',
      content: {
        'application/json': {
          schema: z.object({ comment: commentSchema, requestId: z.string() }),
        },
      },
    },
    ...validationErrorResponse,
    ...authErrorResponses,
    ...notFoundErrorResponse,
  },
})
