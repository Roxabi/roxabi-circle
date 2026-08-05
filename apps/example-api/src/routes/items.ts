import { parseOrThrow } from '@kit/core'
import { Hono } from 'hono'
import { z } from 'zod'
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

export const itemsRoutes = new Hono<AppEnv>()

itemsRoutes.use('/api/items', requireAuth)
itemsRoutes.use('/api/items/*', requireAuth)

itemsRoutes.get('/api/items', async (c) => {
  const db = c.get('db')!
  const q = c.req.query('q') ?? undefined
  const items = await itemsService.listItems(db, c.get('subject')!, q)
  return c.json({ items, requestId: c.get('requestId') })
})

itemsRoutes.post('/api/items', async (c) => {
  const raw = await c.req.json().catch(() => null)
  const data = parseOrThrow(createItemSchema, raw, 'Invalid item')
  const db = c.get('db')!
  const item = await itemsService.createItem(db, c.get('subject')!, data)
  return c.json({ item, requestId: c.get('requestId') }, 201)
})

itemsRoutes.get('/api/items/:id', async (c) => {
  const db = c.get('db')!
  const item = await itemsService.getItem(db, c.req.param('id'), c.get('subject')!)
  return c.json({ item, requestId: c.get('requestId') })
})

itemsRoutes.patch('/api/items/:id', async (c) => {
  const raw = await c.req.json().catch(() => null)
  const data = parseOrThrow(updateItemSchema, raw, 'Invalid item patch')
  const db = c.get('db')!
  const item = await itemsService.updateItem(db, c.req.param('id'), c.get('subject')!, data)
  return c.json({ item, requestId: c.get('requestId') })
})

itemsRoutes.delete('/api/items/:id', async (c) => {
  const db = c.get('db')!
  await itemsService.removeItem(db, c.req.param('id'), c.get('subject')!)
  return c.json({ ok: true, requestId: c.get('requestId') })
})
