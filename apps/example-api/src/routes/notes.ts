import { AppError } from '@gosilex/core'
import { createDb } from '@gosilex/db'
import { Hono } from 'hono'
import { z } from 'zod'
import { schema } from '../db/schema'
import { requireAuth } from '../middleware/require-auth'
import * as notesService from '../services/notes'
import type { AppEnv } from '../types'

const createNoteSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(10_000).optional(),
  attachmentText: z.string().max(50_000).optional(),
})

export const notesRoutes = new Hono<AppEnv>()

notesRoutes.get('/api/notes', async (c) => {
  await requireAuth(c)
  const db = createDb(c.env.DB, schema)
  const notes = await notesService.listNotes(db, c.get('subject')!)
  return c.json({ notes, requestId: c.get('requestId') })
})

notesRoutes.post('/api/notes', async (c) => {
  await requireAuth(c)
  const raw = await c.req.json().catch(() => null)
  const parsed = createNoteSchema.safeParse(raw)
  if (!parsed.success) {
    throw AppError.validation('Invalid note', {
      fieldErrors: parsed.error.flatten().fieldErrors,
    })
  }
  const db = createDb(c.env.DB, schema)
  const note = await notesService.createNote(db, c.env.BUCKET, c.get('subject')!, parsed.data)
  return c.json({ note, requestId: c.get('requestId') }, 201)
})

notesRoutes.get('/api/notes/:id', async (c) => {
  await requireAuth(c)
  const db = createDb(c.env.DB, schema)
  const note = await notesService.getNoteWithAttachment(
    db,
    c.env.BUCKET,
    c.req.param('id'),
    c.get('subject')!,
  )
  return c.json({ note, requestId: c.get('requestId') })
})

notesRoutes.delete('/api/notes/:id', async (c) => {
  await requireAuth(c)
  const db = createDb(c.env.DB, schema)
  await notesService.removeNote(db, c.env.BUCKET, c.req.param('id'), c.get('subject')!)
  return c.json({ ok: true, requestId: c.get('requestId') })
})
