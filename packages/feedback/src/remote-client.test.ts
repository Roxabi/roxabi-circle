import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolvePilotageRemoteConfig, submitRemoteFeedback } from './remote-client'
import type { FeedbackFormFields } from './types'

const fields: FeedbackFormFields = {
  type: 'bug',
  priority: 'p2',
  title: 'Test',
  body: 'Body',
  page: '/x',
  agent: 'ua',
  files: [],
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('resolvePilotageRemoteConfig', () => {
  it('errors without api key', () => {
    vi.stubEnv('PILOTAGE_API_KEY', '')
    vi.stubEnv('PILOTAGE_FEEDBACK_API_KEY', '')
    const r = resolvePilotageRemoteConfig({ baseUrl: 'https://pilotage.example' })
    expect(r).toMatchObject({ error: expect.stringContaining('PILOTAGE_API_KEY') })
  })

  it('reads env', () => {
    vi.stubEnv('PILOTAGE_URL', 'http://localhost:3939/')
    vi.stubEnv('PILOTAGE_API_KEY', 'fbk_test')
    const r = resolvePilotageRemoteConfig()
    expect(r).toEqual({
      baseUrl: 'http://localhost:3939',
      apiKey: 'fbk_test',
      fetch: undefined,
    })
  })

  it('reads Worker-style env record', () => {
    const r = resolvePilotageRemoteConfig({
      env: {
        PILOTAGE_URL: 'http://localhost:3939',
        PILOTAGE_API_KEY: 'fbk_kit',
      },
    })
    expect(r).toEqual({
      baseUrl: 'http://localhost:3939',
      apiKey: 'fbk_kit',
      fetch: undefined,
    })
  })
})

describe('submitRemoteFeedback', () => {
  it('POSTs JSON to /api/v1/feedback', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true, ref: 42, clientSlug: 'kit', type: 'bug' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    )

    const r = await submitRemoteFeedback(
      {
        baseUrl: 'https://pilotage.example',
        apiKey: 'fbk_x',
        fetch: fetchMock as unknown as typeof fetch,
      },
      fields,
      { author: 'Alice' },
    )

    expect(r).toEqual({
      ok: true,
      ref: 42,
      clientSlug: 'kit',
      type: 'bug',
      images: 0,
    })
    expect(fetchMock).toHaveBeenCalledOnce()
    const call = fetchMock.mock.calls[0]!
    const url = String(call[0])
    const init = (call[1] ?? {}) as RequestInit
    expect(url).toBe('https://pilotage.example/api/v1/feedback')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer fbk_x')
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({
      title: 'Test',
      body: 'Body',
      type: 'bug',
      author: 'Alice',
      page: '/x',
    })
  })

  it('uploads images before POST when files present', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/upload')) {
        return new Response(JSON.stringify({ url: '/uploads/cap.png' }), { status: 200 })
      }
      return new Response(JSON.stringify({ ref: 1, clientSlug: 'kit', type: 'bug' }), {
        status: 200,
      })
    })

    const blob = new Blob(['x'], { type: 'image/png' })
    const file = new File([blob], 'cap.png', { type: 'image/png' })

    const r = await submitRemoteFeedback(
      {
        baseUrl: 'https://pilotage.example',
        apiKey: 'fbk_x',
        fetch: fetchMock as unknown as typeof fetch,
      },
      { ...fields, files: [file] },
      { author: 'Bob' },
    )

    expect(r.ok).toBe(true)
    if (r.ok) expect(r.images).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('maps Pilotage errors to 502', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 500 }))
    const r = await submitRemoteFeedback(
      {
        baseUrl: 'https://pilotage.example',
        apiKey: 'fbk_x',
        fetch: fetchMock as unknown as typeof fetch,
      },
      fields,
      { author: 'Alice' },
    )
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(502)
      expect(r.error).toContain('Pilotage 500')
    }
  })
})
