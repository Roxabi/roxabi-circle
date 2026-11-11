/** @vitest-environment node */

import { AppError } from '@kit/core'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { BetterAuthEnvSlice } from './better-auth-env'
import { originGuard } from './origin-guard'

const env: BetterAuthEnvSlice = {
  ENVIRONMENT: 'test',
  CORS_ORIGINS: 'http://localhost:5173',
}

function app() {
  const h = new Hono<{ Bindings: BetterAuthEnvSlice }>()
  h.use('*', originGuard)
  h.get('/x', (c) => c.json({ ok: true }))
  h.post('/x', (c) => c.json({ ok: true }))
  h.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ message: err.message }, err.status as 403)
    }
    return c.json({ message: err instanceof Error ? err.message : 'error' }, 500)
  })
  return h
}

describe('originGuard', () => {
  it('allows safe methods without Origin', async () => {
    const res = await app().request(
      '/x',
      { method: 'GET', headers: { cookie: 'kit_session=tok' } },
      env,
    )
    expect(res.status).toBe(200)
  })

  it('allows mutation with allowlisted Origin', async () => {
    const res = await app().request(
      '/x',
      { method: 'POST', headers: { Origin: 'http://localhost:5173' } },
      env,
    )
    expect(res.status).toBe(200)
  })

  it('rejects mutation with foreign Origin', async () => {
    const res = await app().request(
      '/x',
      { method: 'POST', headers: { Origin: 'https://evil.example' } },
      env,
    )
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ message: 'Origin not allowed' })
  })

  it('rejects cookie mutation without Origin', async () => {
    const res = await app().request(
      '/x',
      { method: 'POST', headers: { cookie: 'kit_session=tok' } },
      env,
    )
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({
      message: 'Origin required for cookie-authenticated mutations',
    })
  })

  it('allows cookie-less mutation without Origin (CLI / Bearer)', async () => {
    const res = await app().request(
      '/x',
      { method: 'POST', headers: { Authorization: 'Bearer sk_test' } },
      env,
    )
    expect(res.status).toBe(200)
  })
})
