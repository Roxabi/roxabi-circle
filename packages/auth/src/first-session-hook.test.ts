import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFirstSessionAfterHook } from './first-session-hook'

describe('first session hook', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('no-ops when handler is omitted or userId missing', async () => {
    await expect(createFirstSessionAfterHook()({ userId: 'u1' })).resolves.toBeUndefined()
    const handler = vi.fn(async () => {})
    await createFirstSessionAfterHook(handler)({})
    await createFirstSessionAfterHook(handler)({ userId: null })
    expect(handler).not.toHaveBeenCalled()
  })

  it('forwards userId to the product handler', async () => {
    const handler = vi.fn(async () => {})
    await createFirstSessionAfterHook(handler)({ userId: 'usr_1' })
    expect(handler).toHaveBeenCalledWith({ userId: 'usr_1' })
  })

  it('swallows handler errors and logs first_login audit_append_failed', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const handler = vi.fn(async () => {
      throw new Error('d1 down')
    })
    await expect(createFirstSessionAfterHook(handler)({ userId: 'usr_1' })).resolves.toBeUndefined()
    expect(err).toHaveBeenCalled()
    const payload = JSON.parse(String(err.mock.calls[0]?.[0])) as {
      msg: string
      action: string
      requestId: string
      error: string
    }
    expect(payload.msg).toBe('audit_append_failed')
    expect(payload.action).toBe('first_login')
    expect(payload.requestId).toBe('session_hook')
    expect(payload.error).toBe('d1 down')
  })
})
