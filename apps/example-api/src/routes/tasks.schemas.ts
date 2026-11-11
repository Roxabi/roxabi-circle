import { createRoute, z } from '@hono/zod-openapi'
import { TASKS_MODULE_ID } from '@kit/tasks'
import {
  authErrorResponses,
  notFoundErrorResponse,
  orgIsolationDescription,
  sessionOrKeySecurity,
  validationErrorResponse,
} from '../lib/openapi'
import { requireModule } from '../middleware/org-context'

const createTaskBodySchema = z
  .object({
    title: z.string().min(1).max(500),
    description: z.string().max(20_000).optional(),
    boardKey: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z][a-z0-9_-]*$/, 'board_key must be lowercase slug'),
    stageId: z.string().min(1).max(256).optional(),
    visibility: z.enum(['internal', 'shared']).optional(),
    scopeKind: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z][a-z0-9_]*$/, 'scope_kind must be lowercase snake/slug')
      .nullable()
      .optional(),
    scopeId: z.string().min(1).max(256).nullable().optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).nullable().optional(),
    dueAt: z.number().int().nonnegative().nullable().optional(),
    done: z.boolean().optional(),
    order: z.number().int().min(0).max(1_000_000).optional(),
    externalUrl: z.union([z.string().url(), z.literal('')]).optional(),
    assigneeIds: z.array(z.string().min(1).max(256)).max(50).optional(),
  })
  .strict()

const updateTaskBodySchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(20_000).nullable().optional(),
    boardKey: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z][a-z0-9_-]*$/, 'board_key must be lowercase slug')
      .optional(),
    stageId: z.string().min(1).max(256).optional(),
    visibility: z.enum(['internal', 'shared']).optional(),
    scopeKind: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z][a-z0-9_]*$/, 'scope_kind must be lowercase snake/slug')
      .nullable()
      .optional(),
    scopeId: z.string().min(1).max(256).nullable().optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).nullable().optional(),
    dueAt: z.number().int().nonnegative().nullable().optional(),
    done: z.boolean().optional(),
    order: z.number().int().min(0).max(1_000_000).optional(),
    externalUrl: z
      .union([z.string().url(), z.literal('')])
      .nullable()
      .optional(),
    assigneeIds: z.array(z.string().min(1).max(256)).max(50).optional(),
  })
  .strict()

const taskSchema = z
  .object({
    id: z.string(),
    orgId: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    boardKey: z.string(),
    stageId: z.string(),
    visibility: z.string(),
    scopeKind: z.string().nullable(),
    scopeId: z.string().nullable(),
    priority: z.string().nullable(),
    dueAt: z.number().nullable(),
    done: z.boolean(),
    order: z.number(),
    externalUrl: z.string().nullable(),
    createdBy: z.string(),
    assigneeIds: z.array(z.string()),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .openapi('Task')

const taskStageSchema = z
  .object({
    id: z.string(),
    orgId: z.string(),
    boardKey: z.string(),
    label: z.string(),
    position: z.number(),
    isDefault: z.boolean(),
    isTerminal: z.boolean(),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .openapi('TaskStage')

export const idParamSchema = z.object({ id: z.string().min(1) })
const stagesQuerySchema = z.object({ boardKey: z.string().optional() })

const tasksRead = requireModule(TASKS_MODULE_ID, 'read')
const tasksWrite = requireModule(TASKS_MODULE_ID, 'write')

export const listTasks = createRoute({
  method: 'get',
  path: '/api/tasks',
  tags: ['tasks'],
  summary: 'List tasks visible to the caller',
  description: orgIsolationDescription,
  security: sessionOrKeySecurity,
  middleware: [tasksRead] as const,
  responses: {
    200: {
      description: 'Tasks the caller may see',
      content: {
        'application/json': {
          schema: z.object({ tasks: z.array(taskSchema), requestId: z.string() }),
        },
      },
    },
    ...validationErrorResponse,
    ...authErrorResponses,
    ...notFoundErrorResponse,
  },
})

export const listStages = createRoute({
  method: 'get',
  path: '/api/tasks/stages',
  tags: ['tasks'],
  summary: 'List board stages',
  description: orgIsolationDescription,
  security: sessionOrKeySecurity,
  middleware: [tasksRead] as const,
  request: { query: stagesQuerySchema },
  responses: {
    200: {
      description: 'Stages for the org, optionally filtered by boardKey',
      content: {
        'application/json': {
          schema: z.object({ stages: z.array(taskStageSchema), requestId: z.string() }),
        },
      },
    },
    ...validationErrorResponse,
    ...authErrorResponses,
    ...notFoundErrorResponse,
  },
})

export const createTask = createRoute({
  method: 'post',
  path: '/api/tasks',
  tags: ['tasks'],
  summary: 'Create a task',
  description: orgIsolationDescription,
  security: sessionOrKeySecurity,
  middleware: [tasksWrite] as const,
  request: {
    body: { content: { 'application/json': { schema: createTaskBodySchema } }, required: true },
  },
  responses: {
    201: {
      description: 'Created task',
      content: {
        'application/json': { schema: z.object({ task: taskSchema, requestId: z.string() }) },
      },
    },
    ...validationErrorResponse,
    ...authErrorResponses,
    ...notFoundErrorResponse,
  },
})

export const getTask = createRoute({
  method: 'get',
  path: '/api/tasks/{id}',
  tags: ['tasks'],
  summary: 'Read one task',
  description: orgIsolationDescription,
  security: sessionOrKeySecurity,
  middleware: [tasksRead] as const,
  request: { params: idParamSchema },
  responses: {
    200: {
      description: 'The task',
      content: {
        'application/json': { schema: z.object({ task: taskSchema, requestId: z.string() }) },
      },
    },
    ...validationErrorResponse,
    ...authErrorResponses,
    ...notFoundErrorResponse,
  },
})

export const updateTask = createRoute({
  method: 'patch',
  path: '/api/tasks/{id}',
  tags: ['tasks'],
  summary: 'Update a task',
  description: orgIsolationDescription,
  security: sessionOrKeySecurity,
  middleware: [tasksWrite] as const,
  request: {
    params: idParamSchema,
    body: { content: { 'application/json': { schema: updateTaskBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'Updated task',
      content: {
        'application/json': { schema: z.object({ task: taskSchema, requestId: z.string() }) },
      },
    },
    ...validationErrorResponse,
    ...authErrorResponses,
    ...notFoundErrorResponse,
  },
})

export const deleteTask = createRoute({
  method: 'delete',
  path: '/api/tasks/{id}',
  tags: ['tasks'],
  summary: 'Delete a task and its comments',
  description: orgIsolationDescription,
  security: sessionOrKeySecurity,
  middleware: [tasksWrite] as const,
  request: { params: idParamSchema },
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
