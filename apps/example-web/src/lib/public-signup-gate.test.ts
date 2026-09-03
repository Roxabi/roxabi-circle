import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from './api'
import { isPublicSignupAllowed, optionalNextSearch } from './public-signup-gate'

vi.mock('./api', () => ({
  apiFetch: vi.fn(),
}))

const fetchMock = vi.mocked(apiFetch)

describe('optionalNextSearch', () => {
  it('keeps a non-empty next string', () => {
    expect(optionalNextSearch({ next: '/invite/accept?invitationId=x' })).toEqual({
      next: '/invite/accept?invitationId=x',
    })
  })

  it('drops empty / missing / non-string next', () => {
    expect(optionalNextSearch({})).toEqual({})
    expect(optionalNextSearch({ next: '' })).toEqual({})
    expect(optionalNextSearch({ next: 1 })).toEqual({})
    expect(optionalNextSearch({ next: ['/invite/accept'] })).toEqual({})
  })
})

describe('isPublicSignupAllowed', () => {
  beforeEach(() => {
    fetchMock.mockReset()
  })

  it('is true only when /health.allowPublicSignup is true', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    fetchMock.mockResolvedValueOnce({ allowPublicSignup: true, ok: true, requestId: 'r' })
    expect(await isPublicSignupAllowed(qc)).toBe(true)
    qc.clear()
    fetchMock.mockResolvedValueOnce({ allowPublicSignup: false, ok: true, requestId: 'r' })
    expect(await isPublicSignupAllowed(qc)).toBe(false)
  })

  it('is false when health fetch throws', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    fetchMock.mockRejectedValueOnce(new Error('down'))
    expect(await isPublicSignupAllowed(qc)).toBe(false)
  })
})
