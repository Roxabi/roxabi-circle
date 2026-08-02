import { createDb } from '@gosilex/db'
import { describe, expect, it } from 'vitest'
import { createApp } from './app'
import { schema } from './db/schema'
import { DEMO_EMAIL, DEMO_PASSWORD } from './seed/demo-data'
import { seedDemoDatabase } from './seed/seed-db'
import { createMemoryEnv } from './test/memory-env'

const ORIGIN = 'http://localhost:5173'

function sessionMutation(cookie: string): Record<string, string> {
  return { cookie, 'content-type': 'application/json', Origin: ORIGIN }
}

async function login(app: ReturnType<typeof createApp>, env: ReturnType<typeof createMemoryEnv>) {
  const db = createDb(env.DB as unknown as D1Database, schema)
  await seedDemoDatabase(db, { notes: false, environment: 'test' })
  const loginRes = await app.request(
    '/api/auth/sign-in/email',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
    },
    env,
  )
  expect(loginRes.status).toBeLessThan(400)
  return loginRes.headers.get('set-cookie')!.split(';')[0]!
}

describe('uploads presign demo', () => {
  it('requires auth on presign', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    const res = await app.request(
      '/api/uploads/presign',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', Origin: ORIGIN },
        body: '{}',
      },
      env,
    )
    expect(res.status).toBe(401)
  })

  it('presign then complete in mock mode without secrets leak', async () => {
    const app = createApp()
    const env = createMemoryEnv()
    ;(env as { PRESIGN_MODE?: string }).PRESIGN_MODE = 'mock'
    const cookie = await login(app, env)

    const badSize = await app.request(
      '/api/uploads/presign',
      {
        method: 'POST',
        headers: sessionMutation(cookie),
        body: JSON.stringify({
          filename: 'big.bin',
          contentType: 'application/octet-stream',
          size: 50_000_001,
        }),
      },
      env,
    )
    expect(badSize.status).toBe(400)

    const presign = await app.request(
      '/api/uploads/presign',
      {
        method: 'POST',
        headers: sessionMutation(cookie),
        body: JSON.stringify({
          filename: 'photo.jpg',
          contentType: 'image/jpeg',
          size: 1024,
        }),
      },
      env,
    )
    expect(presign.status).toBe(201)
    const body = (await presign.json()) as {
      uploadId: string
      url: string
      key: string
      method: string
      requestId: string
    }
    expect(body.method).toBe('PUT')
    expect(body.key.startsWith('demo/')).toBe(true)
    expect(body.url).toBeTruthy()
    const dumped = JSON.stringify(body)
    expect(dumped.toLowerCase()).not.toContain('secret')
    expect(dumped).not.toMatch(/R2_SECRET|ACCESS_KEY/)

    const complete = await app.request(
      `/api/uploads/${body.uploadId}/complete`,
      {
        method: 'POST',
        headers: sessionMutation(cookie),
        body: JSON.stringify({ key: body.key }),
      },
      env,
    )
    expect(complete.status).toBe(200)
    const done = (await complete.json()) as { ok: boolean; key: string }
    expect(done.ok).toBe(true)
    expect(done.key).toBe(body.key)
  })
})
