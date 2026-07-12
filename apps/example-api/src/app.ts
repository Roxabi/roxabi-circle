import { AppError } from '@gosilex/core'
import { createDb } from '@gosilex/db'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { z } from 'zod'
import { schema } from './db/schema'
import type { Env } from './env'
import { onError } from './middleware/error-handler'
import { type AppVariables, requestIdMiddleware } from './middleware/request-id'
import { securityHeaders } from './middleware/security-headers'
import * as authService from './services/auth'
import { sendDemoEmail } from './services/email'
import * as notesService from './services/notes'

export type AppEnv = { Bindings: Env; Variables: AppVariables }

const createNoteSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(10_000).optional(),
  attachmentText: z.string().max(50_000).optional(),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const DEFAULT_CORS = 'http://localhost:5173,http://127.0.0.1:5173'
const DEV_SESSION_FALLBACK = 'dev-session-secret-change-me-32chars!!'

function environmentName(env: Env): string {
  return (env.ENVIRONMENT || 'development').toLowerCase()
}

/** Fail-closed outside development/test: SESSION_SECRET required (min 32). */
export function getSecret(env: Env): string {
  const secret = env.SESSION_SECRET?.trim()
  if (secret && secret.length >= 32) return secret
  const name = environmentName(env)
  if (name === 'development' || name === 'test') {
    return DEV_SESSION_FALLBACK
  }
  throw AppError.internal('SESSION_SECRET is required (min 32 chars) outside development')
}

function corsAllowlist(env: Env): string[] {
  return (env.CORS_ORIGINS || DEFAULT_CORS)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function useSecureCookie(env: Env): boolean {
  return environmentName(env) === 'production'
}

/** Factory used by Worker entry and unit tests (same shipped app). */
export function createApp() {
  const app = new Hono<AppEnv>()

  app.use('*', requestIdMiddleware)
  app.use('*', securityHeaders)
  app.use(
    '*',
    cors({
      origin: (origin, c) => {
        const list = corsAllowlist(c.env)
        if (!origin) return list[0] ?? 'http://localhost:5173'
        return list.includes(origin) ? origin : null
      },
      credentials: true,
      allowHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
      exposeHeaders: ['x-request-id'],
    }),
  )
  app.onError((err, c) => onError(err, c))

  app.get('/health', (c) => {
    return c.json({
      ok: true,
      service: 'example-api',
      requestId: c.get('requestId'),
    })
  })

  app.post('/api/auth/login', async (c) => {
    const raw = await c.req.json().catch(() => null)
    const parsed = loginSchema.safeParse(raw)
    if (!parsed.success) {
      throw AppError.validation('Invalid login body', {
        fieldErrors: parsed.error.flatten().fieldErrors,
      })
    }
    const db = createDb(c.env.DB, schema)
    const { cookie, subject } = await authService.loginWithPassword(
      db,
      getSecret(c.env),
      parsed.data.email,
      parsed.data.password,
      { secureCookie: useSecureCookie(c.env) },
    )
    c.header('Set-Cookie', cookie)
    return c.json({ subject, email: parsed.data.email, requestId: c.get('requestId') })
  })

  app.post('/api/keys', async (c) => {
    await requireAuth(c)
    const db = createDb(c.env.DB, schema)
    const subject = c.get('subject')!
    const minted = await authService.mintApiKey(db, subject)
    return c.json({
      id: minted.id,
      key: minted.key,
      requestId: c.get('requestId'),
    })
  })

  app.get('/api/me', async (c) => {
    await requireAuth(c)
    return c.json({
      subject: c.get('subject'),
      authMethod: c.get('authMethod'),
      requestId: c.get('requestId'),
    })
  })

  app.get('/api/notes', async (c) => {
    await requireAuth(c)
    const db = createDb(c.env.DB, schema)
    const notes = await notesService.listNotes(db, c.get('subject')!)
    return c.json({ notes, requestId: c.get('requestId') })
  })

  app.post('/api/notes', async (c) => {
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

  app.get('/api/notes/:id', async (c) => {
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

  app.delete('/api/notes/:id', async (c) => {
    await requireAuth(c)
    const db = createDb(c.env.DB, schema)
    await notesService.removeNote(db, c.env.BUCKET, c.req.param('id'), c.get('subject')!)
    return c.json({ ok: true, requestId: c.get('requestId') })
  })

  app.post('/api/demo/email', async (c) => {
    await requireAuth(c)
    const result = await sendDemoEmail(c.env, c.get('subject') || 'unknown')
    return c.json({ ...result, requestId: c.get('requestId') })
  })

  return app
}

async function requireAuth(c: {
  env: Env
  req: { header: (n: string) => string | undefined }
  set: (k: keyof AppVariables, v: string) => void
  get: (k: keyof AppVariables) => string | undefined
}) {
  const db = createDb(c.env.DB, schema)
  const auth = await authService.resolveAuth(
    db,
    getSecret(c.env),
    c.req.header('authorization') ?? null,
    c.req.header('cookie') ?? null,
  )
  if (!auth) throw AppError.unauthorized()
  c.set('subject', auth.subject)
  c.set('authMethod', auth.method)
}
