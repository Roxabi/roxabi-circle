import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiFetch } from './api'

describe('ApiError', () => {
  it('maps nested envelope', () => {
    const err = new ApiError(401, {
      error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
      requestId: 'req_abc',
    })
    expect(err.code).toBe('UNAUTHORIZED')
    expect(err.requestId).toBe('req_abc')
    expect(err.status).toBe(401)
  })
})

describe('apiFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends credentials include and parses ok JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const data = await apiFetch<{ ok: boolean }>('/health')
    expect(data.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      '/health',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('throws ApiError for nested error envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () =>
          JSON.stringify({
            error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
            requestId: 'req_x',
          }),
      }),
    )
    await expect(apiFetch('/api/me')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'UNAUTHORIZED',
      requestId: 'req_x',
      status: 401,
    })
  })

  it('throws generic Error on non-JSON error body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: async () => '<html>bad gateway</html>',
      }),
    )
    await expect(apiFetch('/api/me')).rejects.toThrow(/HTTP 502/)
  })
})
