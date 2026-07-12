import { describe, expect, it, vi } from 'vitest'
import { parseSmtpReply, type SmtpConnect, sendLog, sendSmtp } from './server'

function mockConnect(script: string[]): SmtpConnect {
  return async () => {
    let scriptIdx = 0
    let writeBuf = ''
    const decoder = new TextDecoder()
    const encoder = new TextEncoder()

    const readable = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (scriptIdx < script.length) {
          controller.enqueue(encoder.encode(script[scriptIdx]!))
          scriptIdx++
        }
      },
    })

    const writable = new WritableStream<Uint8Array>({
      write(chunk) {
        writeBuf += decoder.decode(chunk)
      },
    })

    return {
      readable,
      writable,
      async close() {},
      // expose for assertions in tests via closure
      get _written() {
        return writeBuf
      },
    } as unknown as {
      writable: WritableStream
      readable: ReadableStream
      close: () => Promise<void>
    }
  }
}

describe('parseSmtpReply', () => {
  it('parses single-line success', () => {
    const r = parseSmtpReply('220 mailpit ready\r\n')
    expect(r).toMatchObject({ code: 220, complete: true })
  })

  it('waits for end of multi-line', () => {
    expect(parseSmtpReply('250-PIPELINING\r\n')).toBeNull()
    const r = parseSmtpReply('250-PIPELINING\r\n250 OK\r\n')
    expect(r?.code).toBe(250)
    expect(r?.complete).toBe(true)
  })
})

describe('email server transport', () => {
  it('sendLog returns ok log transport', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const r = sendLog({ to: 'a@b.c', subject: 'hi', text: 'body' })
    expect(r).toEqual({ ok: true, transport: 'log' })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('sendSmtp fails closed when connect unavailable', async () => {
    const r = await sendSmtp(
      {
        host: '127.0.0.1',
        port: 1025,
        from: 'kit@gosilex.local',
        to: 'a@b.c',
        subject: 't',
        text: 'x',
      },
      { connect: null },
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/connect/i)
  })

  it('sendSmtp succeeds only after SMTP success codes', async () => {
    const connect = mockConnect([
      '220 mailpit\r\n',
      '250-hello\r\n250 OK\r\n',
      '250 OK\r\n',
      '250 OK\r\n',
      '354 go ahead\r\n',
      '250 queued\r\n',
      '221 bye\r\n',
    ])
    const r = await sendSmtp(
      {
        host: '127.0.0.1',
        port: 1025,
        from: 'kit@gosilex.local',
        to: 'demo@gosilex.local',
        subject: 'hi',
        text: 'body',
      },
      { connect },
    )
    expect(r).toEqual({ ok: true, transport: 'smtp' })
  })

  it('sendSmtp fails closed on SMTP error reply (no false success)', async () => {
    const connect = mockConnect(['220 mailpit\r\n', '250 OK\r\n', '550 relay denied\r\n'])
    const r = await sendSmtp(
      {
        host: '127.0.0.1',
        port: 1025,
        from: 'kit@gosilex.local',
        to: 'bad@evil',
        subject: 'hi',
        text: 'body',
      },
      { connect },
    )
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toMatch(/550|MAIL FROM|relay/i)
    }
  })
})
