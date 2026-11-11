import { describe, expect, it } from 'vitest'
import { createApp } from './app'
import { DEMO_EMAIL, DEMO_PASSWORD } from './seed/demo-data'
import { loginCookie, seedDemoEnv, sessionHeaders } from './test/api-fixture'
import { createMemoryEnv } from './test/memory-env'

const ORIGIN = 'http://localhost:5173'

async function login(app: ReturnType<typeof createApp>, env: ReturnType<typeof createMemoryEnv>) {
  await seedDemoEnv(env, { notes: false, environment: 'test' })
  return loginCookie(app, env, DEMO_EMAIL, DEMO_PASSWORD, ORIGIN)
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
        headers: sessionHeaders(cookie, undefined, ORIGIN),
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
        headers: sessionHeaders(cookie, undefined, ORIGIN),
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
        headers: sessionHeaders(cookie, undefined, ORIGIN),
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

import { createAppPresignSigner } from './lib/presign'

describe('createAppPresignSigner fail-closed', () => {
  it('throws when PRESIGN_MODE=s3 without credentials', () => {
    expect(() => createAppPresignSigner({ PRESIGN_MODE: 's3' })).toThrow(/requires R2_/)
  })

  it('throws when PRESIGN_MODE=s3 even with creds until aws4fetch wired', () => {
    expect(() =>
      createAppPresignSigner({
        PRESIGN_MODE: 's3',
        R2_ACCOUNT_ID: 'acc',
        R2_ACCESS_KEY_ID: 'key',
        R2_SECRET_ACCESS_KEY: 'secret',
        R2_BUCKET_NAME: 'bucket',
      }),
    ).toThrow(/not implemented/)
  })
})
