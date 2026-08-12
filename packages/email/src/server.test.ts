import { describe, expect, it, vi } from 'vitest'
import { parseSmtpReply, type SmtpConnect, sendLog, sendSmtp } from './server'

function mockConnect(script: string[]): SmtpConnect & { getWritten: () => string } {
  let writeBuf = ''
  const connect = (async () => {
    let scriptIdx = 0
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
    }
  }) as SmtpConnect & { getWritten: () => string }
  connect.getWritten = () => writeBuf
  return connect
}

const okSmtpScript = [
  '220 mailpit\r\n',
  '250-hello\r\n250 OK\r\n',
  '250 OK\r\n',
  '250 OK\r\n',
  '354 go ahead\r\n',
  '250 queued\r\n',
  '221 bye\r\n',
]

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
        from: 'kit@kit.local',
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
    const connect = mockConnect(okSmtpScript)
    const r = await sendSmtp(
      {
        host: '127.0.0.1',
        port: 1025,
        from: 'kit@kit.local',
        to: 'demo@kit.local',
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
        from: 'kit@kit.local',
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

  it('sendSmtp scrubs CR/LF from envelope MAIL FROM / RCPT TO (no command injection)', async () => {
    const connect = mockConnect(okSmtpScript)
    const r = await sendSmtp(
      {
        host: '127.0.0.1',
        port: 1025,
        from: 'kit@kit.local\r\nBCC: evil@evil.com',
        to: 'demo@kit.local\r\nRCPT TO:<other@evil.com>',
        subject: 'hi\r\nX-Injected: yes',
        text: 'body',
      },
      { connect },
    )
    expect(r).toEqual({ ok: true, transport: 'smtp' })
    const written = connect.getWritten()
    // Envelope commands must be single-line; CR/LF only as SMTP line terminators we append.
    const mailFrom = written.split('\r\n').find((l) => l.startsWith('MAIL FROM:'))
    const rcptTo = written.split('\r\n').find((l) => l.startsWith('RCPT TO:'))
    expect(mailFrom).toBeDefined()
    expect(rcptTo).toBeDefined()
    expect(mailFrom).not.toMatch(/[\r\n]/)
    expect(rcptTo).not.toMatch(/[\r\n]/)
    expect(mailFrom).toBe('MAIL FROM:<kit@kit.local BCC: evil@evil.com>')
    expect(rcptTo).toBe('RCPT TO:<demo@kit.local RCPT TO:<other@evil.com>>')
    // Must not write a second RCPT from injected payload as its own command line.
    const rcptLines = written.split('\r\n').filter((l) => l.startsWith('RCPT TO:'))
    expect(rcptLines).toHaveLength(1)
    expect(written).not.toContain('\r\nBCC:')
  })

  it('sendSmtp fails closed when from/to empty after CR/LF scrub', async () => {
    const connect = mockConnect(okSmtpScript)
    const rFrom = await sendSmtp(
      {
        host: '127.0.0.1',
        port: 1025,
        from: '\r\n\t  ',
        to: 'demo@kit.local',
        subject: 'hi',
        text: 'body',
      },
      { connect },
    )
    expect(rFrom.ok).toBe(false)
    if (!rFrom.ok) expect(rFrom.error).toMatch(/empty after CR\/LF scrub/i)
    expect(connect.getWritten()).toBe('')

    const connect2 = mockConnect(okSmtpScript)
    const rTo = await sendSmtp(
      {
        host: '127.0.0.1',
        port: 1025,
        from: 'kit@kit.local',
        to: '\r\n',
        subject: 'hi',
        text: 'body',
      },
      { connect: connect2 },
    )
    expect(rTo.ok).toBe(false)
    if (!rTo.ok) expect(rTo.error).toMatch(/empty after CR\/LF scrub/i)
    expect(connect2.getWritten()).toBe('')
  })
})
