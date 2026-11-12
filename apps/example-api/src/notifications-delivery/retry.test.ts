import { describe, expect, it } from 'vitest'
import { createDeliveryRetryableError, notificationDeliveryRetryDelay } from './retry'

function delay(attempt: number, error: Error) {
  const ctx = { attempt } as Parameters<typeof notificationDeliveryRetryDelay>[0]['ctx']
  return notificationDeliveryRetryDelay({ ctx, error })
}

describe('notification delivery native retry protocol', () => {
  it('honors a fractional hint through both supported native encodings', () => {
    const privateError = createDeliveryRetryableError({
      code: 'rate_limited',
      retryAfterSeconds: 75.25,
    })
    const rpcError = new Error(`${privateError.name}: ${privateError.message}`)
    expect(delay(1, privateError)).toBe(76_000)
    expect(delay(1, rpcError)).toBe(76_000)
    expect(delay(2, rpcError)).toBe(120_000)
  })

  it('backs off hintless native interruptions and caps the delay', () => {
    expect(delay(1, new Error('timeout'))).toBe(60_000)
    expect(delay(2, new Error('timeout'))).toBe(120_000)
    expect(delay(20, new Error('timeout'))).toBe(86_400_000)
  })

  it('rejects malformed private payloads and unrecognized envelopes instead of dropping hints', () => {
    for (const message of [
      'NotificationDeliveryRetryable: {"code":"rate_limited","retryAfterSeconds":86401}',
      'NotificationDeliveryRetryable: {"code":"rate_limited","retryAfterSeconds":30,"extra":true}',
      'NotificationDeliveryRetryable: NotificationDeliveryRetryable: {}',
      'NotificationDeliveryRetryable:{"code":"rate_limited"}',
    ]) {
      expect(() => delay(1, new Error(message))).toThrow()
    }
    const malformed = new Error('not JSON')
    malformed.name = 'NotificationDeliveryRetryable'
    expect(() => delay(1, malformed)).toThrow()
  })

  it('refuses to construct private errors with invalid codes or hints', () => {
    expect(() => createDeliveryRetryableError({ code: 'Not safe' })).toThrow()
    expect(() =>
      createDeliveryRetryableError({ code: 'rate_limited', retryAfterSeconds: Infinity }),
    ).toThrow()
    expect(() =>
      createDeliveryRetryableError({ code: 'rate_limited', retryAfterSeconds: 86_401 }),
    ).toThrow()
  })
})
