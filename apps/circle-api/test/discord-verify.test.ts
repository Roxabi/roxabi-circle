import { describe, expect, it } from 'vitest'
import { verifyDiscordRequest } from '../src/discord/verify'

describe('verifyDiscordRequest', () => {
  it('rejects missing signature headers', async () => {
    const req = new Request('https://example.com/interactions', {
      method: 'POST',
      body: '{}',
    })
    const res = await verifyDiscordRequest(req, 'ab'.repeat(32))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.status).toBe(401)
  })

  it('rejects empty public key', async () => {
    const req = new Request('https://example.com/interactions', {
      method: 'POST',
      headers: {
        'X-Signature-Ed25519': 'ab'.repeat(64),
        'X-Signature-Timestamp': '123',
      },
      body: '{}',
    })
    const res = await verifyDiscordRequest(req, '')
    expect(res.ok).toBe(false)
  })
})
