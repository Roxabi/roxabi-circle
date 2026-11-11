import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  authErrorResponses,
  invalidRequest,
  notFoundErrorResponse,
  sessionOrKeySecurity,
  validationErrorResponse,
} from '../lib/openapi'
import { requireAuth } from '../middleware/require-auth'
import * as notesService from '../services/notes'
import type { AppEnv } from '../types'

const createNoteSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(10_000).optional(),
  attachmentText: z.string().max(50_000).optional(),
})

const noteSchema = z
  .object({
    id: z.string(),
    subject: z.string(),
    title: z.string(),
    body: z.string(),
    createdAt: z.number(),
  })
  .openapi('Note')

const noteWithAttachmentSchema = z
  .object({
    id: z.string(),
    subject: z.string(),
    title: z.string(),
    body: z.string(),
    createdAt: z.number(),
    attachment: z.string().nullable(),
  })
  .openapi('NoteWithAttachment')

const idParamSchema = z.object({ id: z.string().min(1) })

export const notesRoutes = new OpenAPIHono<AppEnv>()

// Path-scoped — avoid use('*') on a router mounted at `/`.
notesRoutes.use('/api/notes', requireAuth)
notesRoutes.use('/api/notes/*', requireAuth)

const listNotes = createRoute({
  method: 'get',
  path: '/api/notes',
  tags: ['notes'],
  summary: 'List personal notes owned by the caller',
  description: 'Personal kennel (subject-owned). Not org-scoped.',
  security: sessionOrKeySecurity,
  responses: {
    200: {
      description: 'Notes owned by the caller',
      content: {
        'application/json': {
          schema: z.object({ notes: z.array(noteSchema), requestId: z.string() }),
        },
      },
    },
    ...authErrorResponses,
  },
})

notesRoutes.openapi(listNotes, async (c) => {
  const db = c.get('db')!
  const notes = await notesService.listNotes(db, c.get('subject')!)
  return c.json({ notes, requestId: c.get('requestId') })
})

const createNote = createRoute({
  method: 'post',
  path: '/api/notes',
  tags: ['notes'],
  summary: 'Create a note',
  security: sessionOrKeySecurity,
  request: {
    body: { content: { 'application/json': { schema: createNoteSchema } }, required: true },
  },
  responses: {
    201: {
      description: 'Created note',
      content: {
        'application/json': { schema: z.object({ note: noteSchema, requestId: z.string() }) },
      },
    },
    ...validationErrorResponse,
    ...authErrorResponses,
  },
})

notesRoutes.openapi(
  createNote,
  async (c) => {
    const data = c.req.valid('json')
    const db = c.get('db')!
    const note = await notesService.createNote(db, c.env.BUCKET, c.get('subject')!, data)
    return c.json({ note, requestId: c.get('requestId') }, 201)
  },
  invalidRequest('Invalid note'),
)

const getNote = createRoute({
  method: 'get',
  path: '/api/notes/{id}',
  tags: ['notes'],
  summary: 'Read one note, including R2 attachment text when present',
  security: sessionOrKeySecurity,
  request: { params: idParamSchema },
  responses: {
    200: {
      description: 'The note',
      content: {
        'application/json': {
          schema: z.object({ note: noteWithAttachmentSchema, requestId: z.string() }),
        },
      },
    },
    ...validationErrorResponse,
    ...authErrorResponses,
    ...notFoundErrorResponse,
  },
})

notesRoutes.openapi(getNote, async (c) => {
  const db = c.get('db')!
  const note = await notesService.getNoteWithAttachment(
    db,
    c.env.BUCKET,
    c.req.valid('param').id,
    c.get('subject')!,
  )
  return c.json({ note, requestId: c.get('requestId') })
})

const removeNote = createRoute({
  method: 'delete',
  path: '/api/notes/{id}',
  tags: ['notes'],
  summary: 'Delete a note',
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

notesRoutes.openapi(removeNote, async (c) => {
  const db = c.get('db')!
  await notesService.removeNote(db, c.env.BUCKET, c.req.valid('param').id, c.get('subject')!)
  return c.json({ ok: true, requestId: c.get('requestId') })
})
