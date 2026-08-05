import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { handleFeedbackReport } from './hono'

describe('handleFeedbackReport', () => {
  it('returns 400 when title missing', async () => {
    const app = new Hono<{ Bindings: { FEEDBACK_ENABLED: string } }>()
    app.post('/api/report', (c) =>
      handleFeedbackReport(c, {
        getAuthor: () => 'demo',
        enabled: () => true,
      }),
    )

    const fd = new FormData()
    fd.append('title', ' ')
    const res = await app.request('http://localhost/api/report', { method: 'POST', body: fd })
    expect(res.status).toBe(400)
  })

  it('returns 503 when Pilotage key missing', async () => {
    const app = new Hono<{ Bindings: { FEEDBACK_ENABLED: string; PILOTAGE_URL: string } }>()
    app.post('/api/report', (c) =>
      handleFeedbackReport(c, {
        getAuthor: () => 'demo',
        enabled: () => true,
      }),
    )

    const fd = new FormData()
    fd.append('title', 'Test')
    const res = await app.request(
      'http://localhost/api/report',
      { method: 'POST', body: fd },
      { FEEDBACK_ENABLED: 'true', PILOTAGE_URL: 'http://localhost:3939' },
    )
    expect(res.status).toBe(503)
  })

  it('returns 503 when disabled', async () => {
    const app = new Hono<{ Bindings: { FEEDBACK_ENABLED?: string } }>()
    app.post('/api/report', (c) =>
      handleFeedbackReport(c, {
        getAuthor: () => 'demo',
        enabled: () => false,
      }),
    )

    const fd = new FormData()
    fd.append('title', 'Test')
    const res = await app.request('http://localhost/api/report', { method: 'POST', body: fd })
    expect(res.status).toBe(503)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('désactivés')
  })

  it('proxies to Pilotage when enabled', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ref: 7, clientSlug: 'kit', type: 'bug' }), { status: 200 }),
    )

    const app = new Hono<{
      Bindings: {
        FEEDBACK_ENABLED: string
        PILOTAGE_URL: string
        PILOTAGE_API_KEY: string
      }
    }>()
    app.post('/api/report', (c) =>
      handleFeedbackReport(c, {
        getAuthor: () => 'user_demo',
        enabled: () => true,
        fetch: fetchMock as unknown as typeof fetch,
      }),
    )

    const fd = new FormData()
    fd.append('title', 'Kit feedback')
    fd.append('body', 'Details')
    const res = await app.request(
      'http://localhost/api/report',
      { method: 'POST', body: fd },
      {
        FEEDBACK_ENABLED: 'true',
        PILOTAGE_URL: 'http://localhost:3939',
        PILOTAGE_API_KEY: 'fbk_test',
      },
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; ref: number }
    expect(body).toMatchObject({ ok: true, ref: 7 })
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
