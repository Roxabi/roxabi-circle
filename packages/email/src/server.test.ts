import { describe, expect, it, vi } from 'vitest'
import { sendLog, sendSmtp } from './server'

describe('email server transport', () => {
  it('sendLog returns ok log transport', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const r = sendLog({ to: 'a@b.c', subject: 'hi', text: 'body' })
    expect(r).toEqual({ ok: true, transport: 'log' })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('sendSmtp fails closed when connect unavailable', async () => {
    const r = await sendSmtp({
      host: '127.0.0.1',
      port: 1025,
      from: 'kit@gosilex.local',
      to: 'a@b.c',
      subject: 't',
      text: 'x',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/connect/i)
  })
})
