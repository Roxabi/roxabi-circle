import { describe, expect, it, vi } from 'vitest'
import { type AuthEmailPort, sendMagicLinkMail, sendResetPasswordMail } from './auth-email'

function recordingPort(): { port: AuthEmailPort; sent: unknown[] } {
  const sent: unknown[] = []
  return {
    sent,
    port: {
      async send(input) {
        sent.push(input)
        return { ok: true, transport: 'log' }
      },
    },
  }
}

describe('auth email wiring', () => {
  it('sends magic-link template through EmailPort', async () => {
    const { port, sent } = recordingPort()
    await sendMagicLinkMail(port, {
      email: 'a@b.c',
      url: 'http://localhost:8787/api/auth/magic-link/verify?token=abc',
    })
    expect(sent).toHaveLength(1)
    const msg = sent[0] as { to: string; subject: string; text: string; html?: string }
    expect(msg.to).toBe('a@b.c')
    expect(msg.subject).toMatch(/sign in/i)
    expect(msg.text).toContain('magic-link/verify')
    expect(msg.html).toContain('href=')
  })

  it('sends reset-password template through EmailPort', async () => {
    const { port, sent } = recordingPort()
    await sendResetPasswordMail(port, {
      email: 'a@b.c',
      url: 'http://localhost:8787/api/auth/reset-password/token',
    })
    const msg = sent[0] as { subject: string; text: string }
    expect(msg.subject.toLowerCase()).toMatch(/reset|password/)
    expect(msg.text).toContain('reset-password')
  })

  it('propagates port.send failure on magic-link and reset', async () => {
    const port: AuthEmailPort = {
      send: vi.fn(async () => {
        throw new Error('transport down')
      }),
    }
    await expect(sendMagicLinkMail(port, { email: 'a@b.c', url: 'http://x' })).rejects.toThrow(
      'transport down',
    )
    await expect(sendResetPasswordMail(port, { email: 'a@b.c', url: 'http://x' })).rejects.toThrow(
      'transport down',
    )
  })
})
