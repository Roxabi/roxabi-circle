import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  authErrorResponses,
  errorResponse,
  invalidRequest,
  notFoundErrorResponse,
  sessionOrKeySecurity,
  validationErrorResponse,
} from '../lib/openapi'
import { requireAuth } from '../middleware/require-auth'
import * as itemsService from '../services/items'
import type { AppEnv } from '../types'

const createItemSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9_-]*$/i, 'code must be alphanumeric with _-'),
  label: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  active: z.boolean().optional(),
})

const updateItemSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  active: z.boolean().optional(),
})
const itemSchema = z
  .object({
    id: z.string(),
    subject: z.string(),
    code: z.string(),
    label: z.string(),
    description: z.string(),
    active: z.boolean(),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .openapi('Item')

const idParamSchema = z.object({ id: z.string().min(1) })

export const itemsRoutes = new OpenAPIHono<AppEnv>()

/** Subject-owned kennel — exempt from ADR-0003 D8 org WHERE (M-10). */
const personalKennelDescription =
  'Personal kennel (subject-owned). Auth is the only gate; org headers are ignored. Rows are not stored or listed by organization (ADR-0003 D8 kennel exemption).'

itemsRoutes.use('/api/items', requireAuth)
itemsRoutes.use('/api/items/*', requireAuth)

const listItems = createRoute({
  method: 'get',
  path: '/api/items',
  tags: ['items'],
  summary: 'List personal items owned by the caller',
  description: personalKennelDescription,
  security: sessionOrKeySecurity,
  request: { query: z.object({ q: z.string().optional() }) },
  responses: {
    200: {
      description: 'Items owned by the caller, optionally filtered by `q`',
      content: {
        'application/json': {
          schema: z.object({ items: z.array(itemSchema), requestId: z.string() }),
        },
      },
    },
    ...validationErrorResponse,
    ...authErrorResponses,
  },
})

itemsRoutes.openapi(listItems, async (c) => {
  const db = c.get('db')!
  const { q } = c.req.valid('query')
  const items = await itemsService.listItems(db, c.get('subject')!, q)
  return c.json({ items, requestId: c.get('requestId')! })
})

const createItem = createRoute({
  method: 'post',
  path: '/api/items',
  tags: ['items'],
  summary: 'Create an item',
  description: personalKennelDescription,
  security: sessionOrKeySecurity,
  request: {
    body: { content: { 'application/json': { schema: createItemSchema } }, required: true },
  },
  responses: {
    201: {
      description: 'Created item',
      content: {
        'application/json': { schema: z.object({ item: itemSchema, requestId: z.string() }) },
      },
    },
    ...validationErrorResponse,
    ...authErrorResponses,
    ...notFoundErrorResponse,
    409: errorResponse('Item code already exists'),
  },
})

itemsRoutes.openapi(
  createItem,
  async (c) => {
    const data = c.req.valid('json')
    const db = c.get('db')!
    const item = await itemsService.createItem(db, c.get('subject')!, data)
    return c.json({ item, requestId: c.get('requestId')! }, 201)
  },
  invalidRequest('Invalid item'),
)

const getItem = createRoute({
  method: 'get',
  path: '/api/items/{id}',
  tags: ['items'],
  summary: 'Read one item',
  security: sessionOrKeySecurity,
  request: { params: idParamSchema },
  responses: {
    200: {
      description: 'The item',
      content: {
        'application/json': { schema: z.object({ item: itemSchema, requestId: z.string() }) },
      },
    },
    ...validationErrorResponse,
    ...authErrorResponses,
    ...notFoundErrorResponse,
  },
})

itemsRoutes.openapi(getItem, async (c) => {
  const db = c.get('db')!
  const item = await itemsService.getItem(db, c.req.valid('param').id, c.get('subject')!)
  return c.json({ item, requestId: c.get('requestId')! })
})

const updateItem = createRoute({
  method: 'patch',
  path: '/api/items/{id}',
  tags: ['items'],
  summary: 'Update an item',
  description: personalKennelDescription,
  security: sessionOrKeySecurity,
  request: {
    params: idParamSchema,
    body: { content: { 'application/json': { schema: updateItemSchema } }, required: true },
  },
  responses: {
    200: {
      description: 'Updated item',
      content: {
        'application/json': { schema: z.object({ item: itemSchema, requestId: z.string() }) },
      },
    },
    ...validationErrorResponse,
    ...authErrorResponses,
    ...notFoundErrorResponse,
  },
})

itemsRoutes.openapi(
  updateItem,
  async (c) => {
    const data = c.req.valid('json')
    const db = c.get('db')!
    const item = await itemsService.updateItem(db, c.req.valid('param').id, c.get('subject')!, data)
    return c.json({ item, requestId: c.get('requestId')! })
  },
  invalidRequest('Invalid item patch'),
)

const removeItem = createRoute({
  method: 'delete',
  path: '/api/items/{id}',
  tags: ['items'],
  summary: 'Delete an item',
  description: personalKennelDescription,
  security: sessionOrKeySecurity,
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

itemsRoutes.openapi(removeItem, async (c) => {
  const db = c.get('db')!
  await itemsService.removeItem(db, c.req.valid('param').id, c.get('subject')!)
  return c.json({ ok: true, requestId: c.get('requestId')! })
})
