import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  apiErrorFieldErrors,
  apiErrorToMessage,
  apiFetch,
  createApiClient,
  fieldErrorsFirstMessages,
  isValidationDetails,
} from './index'

describe('ApiError', () => {
  it('maps nested envelope', () => {
    const err = new ApiError(401, {
      error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
      requestId: 'req_abc',
    })
    expect(err.code).toBe('UNAUTHORIZED')
    expect(err.requestId).toBe('req_abc')
    expect(err.status).toBe(401)
    expect(err.name).toBe('ApiError')
  })
})

describe('apiErrorFieldErrors', () => {
  it('reads details.fieldErrors from kit envelope', () => {
    const err = new ApiError(400, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid note',
        details: { fieldErrors: { title: ['Required'], body: ['Too long'] } },
      },
      requestId: 'req_fe',
    })
    expect(isValidationDetails(err.details)).toBe(true)
    expect(apiErrorFieldErrors(err)).toEqual({ title: ['Required'], body: ['Too long'] })
    expect(fieldErrorsFirstMessages(apiErrorFieldErrors(err)!)).toEqual({
      title: 'Required',
      body: 'Too long',
    })
  })

  it('returns null for non-ApiError, free-form details, or missing fieldErrors', () => {
    expect(apiErrorFieldErrors(new Error('x'))).toBeNull()
    expect(
      apiErrorFieldErrors(
        new ApiError(400, {
          error: { code: 'VALIDATION_ERROR', message: 'bad', details: { max: 5 } },
          requestId: 'req_x',
        }),
      ),
    ).toBeNull()
    expect(
      apiErrorFieldErrors(
        new ApiError(400, {
          error: { code: 'VALIDATION_ERROR', message: 'bad' },
          requestId: 'req_x',
        }),
      ),
    ).toBeNull()
  })

  it('rejects fieldErrors null and array (guards are polar)', () => {
    const nullFe = new ApiError(400, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'bad',
        details: { fieldErrors: null as unknown as Record<string, string[]> },
      },
      requestId: 'req_null_fe',
    })
    expect(isValidationDetails(nullFe.details)).toBe(false)
    expect(apiErrorFieldErrors(nullFe)).toBeNull()

    const arrFe = new ApiError(400, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'bad',
        details: { fieldErrors: [] as unknown as Record<string, string[]> },
      },
      requestId: 'req_arr_fe',
    })
    expect(isValidationDetails(arrFe.details)).toBe(false)
    expect(apiErrorFieldErrors(arrFe)).toBeNull()
  })
})

describe('apiErrorToMessage', () => {
  it('prefers wire message without catalog', () => {
    const err = new ApiError(400, {
      error: { code: 'VALIDATION_ERROR', message: 'Invalid note' },
      requestId: 'req_x',
    })
    expect(apiErrorToMessage(err)).toBe('Invalid note')
    expect(apiErrorToMessage(new Error('boom'))).toBe('boom')
    expect(apiErrorToMessage(null, 'fallback')).toBe('fallback')
  })

  it('maps ErrorCode via messages catalog', () => {
    const err = new ApiError(401, {
      error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
      requestId: 'req_x',
    })
    expect(
      apiErrorToMessage(err, {
        fallback: 'Error',
        messages: { UNAUTHORIZED: 'Session expired' },
      }),
    ).toBe('Session expired')
  })
})

describe('apiFetch / createApiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults credentials include and parses ok JSON', async () => {
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

  it('prefixes baseUrl', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{}',
    })
    const { apiFetch: clientFetch } = createApiClient({
      baseUrl: 'https://api.example',
      fetch: fetchMock as unknown as typeof fetch,
    })
    await clientFetch('/v1/me')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example/v1/me',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('throws ApiError for kit envelope', async () => {
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

  it('calls onUnauthorized on 401 before throw', async () => {
    const onUnauthorized = vi.fn()
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
    await expect(apiFetch('/api/me', undefined, { onUnauthorized })).rejects.toBeInstanceOf(
      ApiError,
    )
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
    expect(onUnauthorized.mock.calls[0]?.[0]).toMatchObject({ code: 'UNAUTHORIZED' })
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
