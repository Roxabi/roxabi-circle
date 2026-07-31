import { describe, expect, it, vi } from 'vitest'
import {
  assertEmailTransportAllowed,
  buildDemoEmailText,
  createEmailPort,
  redactEmailBody,
  resolveEmailTransport,
  type SendEmailBinding,
  sendCf,
  sendLog,
} from './index'

describe('buildDemoEmailText', () => {
  it('builds subject and text', () => {
    const m = buildDemoEmailText({ to: 'a@b.c', subjectId: 'u1' })
    expect(m.to).toBe('a@b.c')
    expect(m.subject).toContain('u1')
    expect(m.text.length).toBeGreaterThan(0)
  })
})

describe('redactEmailBody', () => {
  it('redacts token query and reset path', () => {
    const raw = [
      'Reset link: http://localhost:8787/api/auth/reset-password/UA3JP8XeqcwaIYm2RoiUZZLH?callbackURL=x',
      'Accept: http://localhost:5173/invite/accept?invitationId=inv_abc123def456ghi789jkl',
      'token=supersecrettokenvalue12345',
    ].join('\n')
    const red = redactEmailBody(raw)
    expect(red).not.toContain('UA3JP8XeqcwaIYm2RoiUZZLH')
    expect(red).not.toContain('inv_abc123def456ghi789jkl')
    expect(red).not.toContain('supersecrettokenvalue12345')
    expect(red).toContain('[REDACTED]')
  })
})

describe('sendLog (edge-safe)', () => {
  it('returns ok log transport and redacts body in console', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const r = sendLog({
      to: 'a@b.c',
      subject: 'hi',
      text: 'token=supersecrettokenvalue12345',
    })
    expect(r).toEqual({ ok: true, transport: 'log' })
    const logged = String(spy.mock.calls[0]?.[0] ?? '')
    expect(logged).toContain('[REDACTED]')
    expect(logged).not.toContain('supersecrettokenvalue12345')
    spy.mockRestore()
  })
})

describe('assertEmailTransportAllowed / resolveEmailTransport', () => {
  it('rejects log on production', () => {
    expect(() => assertEmailTransportAllowed('log', 'production')).toThrow(/forbidden/i)
    expect(() => assertEmailTransportAllowed('log', 'staging')).toThrow(/forbidden/i)
  })

  it('allows log on development|test', () => {
    expect(() => assertEmailTransportAllowed('log', 'development')).not.toThrow()
    expect(() => assertEmailTransportAllowed('log', 'test')).not.toThrow()
  })

  it('rejects smtp on Workers factory path', () => {
    expect(() => assertEmailTransportAllowed('smtp', 'development')).toThrow(/Node-only/i)
  })

  it('defaults transport by environment', () => {
    expect(resolveEmailTransport(undefined, 'test')).toBe('log')
    expect(resolveEmailTransport(undefined, 'development')).toBe('log')
    expect(() => resolveEmailTransport(undefined, 'production')).toThrow(/required/i)
    expect(resolveEmailTransport('cf', 'production')).toBe('cf')
  })
})

describe('createEmailPort / sendCf', () => {
  it('cf port calls binding with from.email shape', async () => {
    const send = vi.fn(async () => ({ messageId: 'mid_1' }))
    const binding: SendEmailBinding = { send }
    const port = createEmailPort({
      transport: 'cf',
      environment: 'production',
      email: binding,
      from: { email: 'noreply@example.com', name: 'Kit' },
    })
    const r = await port.send({
      to: 'user@example.com',
      subject: 'Hi',
      text: 'hello',
      html: '<p>hello</p>',
    })
    expect(r.ok).toBe(true)
    expect(r.transport).toBe('cf')
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        from: { email: 'noreply@example.com', name: 'Kit' },
        subject: 'Hi',
      }),
    )
  })

  it('cf without binding fails closed', () => {
    expect(() =>
      createEmailPort({
        transport: 'cf',
        environment: 'production',
        from: 'noreply@example.com',
      }),
    ).toThrow(/binding/i)
  })

  it('sendCf returns transport cf', async () => {
    const binding: SendEmailBinding = {
      send: async () => ({ messageId: 'x' }),
    }
    const r = await sendCf(binding, {
      to: 'a@b.c',
      from: 'from@b.c',
      subject: 's',
      text: 't',
    })
    expect(r).toMatchObject({ ok: true, transport: 'cf', messageId: 'x' })
  })
})
