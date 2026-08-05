import { createDb } from '@kit/db'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from './app'
import { schema } from './db/schema'
import { DEMO_EMAIL, DEMO_PASSWORD } from './seed/demo-data'
import { seedDemoDatabase } from './seed/seed-db'
import { createMemoryEnv } from './test/memory-env'

const ORIGIN = 'http://localhost:5173'

async function login(app: ReturnType<typeof createApp>, env: ReturnType<typeof createMemoryEnv>) {
  const db = createDb(env.DB as unknown as D1Database, schema)
  await seedDemoDatabase(db, { notes: false, environment: 'test' })
  const res = await app.request(
    '/api/auth/sign-in/email',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
    },
    env,
  )
  expect(res.status).toBeLessThan(400)
  return res.headers.get('set-cookie')!.split(';')[0]!
}

describe('jobs ping route', () => {
  it('requires auth', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    const res = await app.request(
      '/api/jobs/ping',
      { method: 'POST', headers: { Origin: ORIGIN } },
      env,
    )
    expect(res.status).toBe(401)
  })

  it('enqueues when DEMO_QUEUE present', async () => {
    const app = createApp()
    const env = createMemoryEnv() as ReturnType<typeof createMemoryEnv> & {
      DEMO_QUEUE: { send: ReturnType<typeof vi.fn> }
    }
    const send = vi.fn().mockResolvedValue(undefined)
    env.DEMO_QUEUE = { send }
    const cookie = await login(app, env)
    const res = await app.request(
      '/api/jobs/ping',
      {
        method: 'POST',
        headers: { cookie, Origin: ORIGIN, 'content-type': 'application/json' },
      },
      env,
    )
    expect(res.status).toBe(202)
    const body = (await res.json()) as { enqueued: boolean }
    expect(body.enqueued).toBe(true)
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'demo.ping' }))
  })
})
