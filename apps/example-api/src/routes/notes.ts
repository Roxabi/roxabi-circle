import { parseOrThrow } from '@kit/core'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireAuth } from '../middleware/require-auth'
import * as notesService from '../services/notes'
import type { AppEnv } from '../types'

const createNoteSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(10_000).optional(),
  attachmentText: z.string().max(50_000).optional(),
})

export const notesRoutes = new Hono<AppEnv>()

// Path-scoped — avoid use('*') on a router mounted at `/`.
notesRoutes.use('/api/notes', requireAuth)
notesRoutes.use('/api/notes/*', requireAuth)

notesRoutes.get('/api/notes', async (c) => {
  const db = c.get('db')!
  const notes = await notesService.listNotes(db, c.get('subject')!)
  return c.json({ notes, requestId: c.get('requestId') })
})

notesRoutes.post('/api/notes', async (c) => {
  const raw = await c.req.json().catch(() => null)
  const data = parseOrThrow(createNoteSchema, raw, 'Invalid note')
  const db = c.get('db')!
  const note = await notesService.createNote(db, c.env.BUCKET, c.get('subject')!, data)
  return c.json({ note, requestId: c.get('requestId') }, 201)
})

notesRoutes.get('/api/notes/:id', async (c) => {
  const db = c.get('db')!
  const note = await notesService.getNoteWithAttachment(
    db,
    c.env.BUCKET,
    c.req.param('id'),
    c.get('subject')!,
  )
  return c.json({ note, requestId: c.get('requestId') })
})

notesRoutes.delete('/api/notes/:id', async (c) => {
  const db = c.get('db')!
  await notesService.removeNote(db, c.env.BUCKET, c.req.param('id'), c.get('subject')!)
  return c.json({ ok: true, requestId: c.get('requestId') })
})
