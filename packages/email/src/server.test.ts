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
  it('sendLog returns ok log transport and scrubs subject at leaf', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const r = sendLog({ to: 'a@b.c', subject: 'hi\r\nX-Injected: yes', text: 'body' })
    expect(r).toEqual({ ok: true, transport: 'log' })
    const logged = JSON.parse(String(spy.mock.calls[0]?.[0] ?? '{}')) as {
      subject: string
      to: string
    }
    expect(logged.subject).toBe('hi X-Injected: yes')
    expect(logged.subject).not.toMatch(/[\r\n]/)
    expect(logged.to).toBe('*@b.c')
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

  it('sendSmtp fails closed on CR/LF injection that leaves garbage in envelope addr', async () => {
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
    // Fail-closed: scrub leaves whitespace / `<>` in addr-spec → never connect.
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/invalid from\/to address/i)
    expect(connect.getWritten()).toBe('')
  })

  it('sendSmtp scrubs subject CR/LF and Unicode line breaks when envelope is clean', async () => {
    const connect = mockConnect(okSmtpScript)
    const r = await sendSmtp(
      {
        host: '127.0.0.1',
        port: 1025,
        from: 'kit@kit.local',
        to: 'demo@kit.local',
        subject: 'hi\r\nX-Injected: yes',
        text: 'body',
      },
      { connect },
    )
    expect(r).toEqual({ ok: true, transport: 'smtp' })
    const written = connect.getWritten()
    expect(written).not.toContain('\r\nX-Injected:')
    const subjectLine = written.split('\r\n').find((l) => l.startsWith('Subject:'))
    expect(subjectLine).toBe('Subject: hi X-Injected: yes')

    const connect2 = mockConnect(okSmtpScript)
    const r2 = await sendSmtp(
      {
        host: '127.0.0.1',
        port: 1025,
        from: 'kit@kit.local',
        to: 'demo@kit.local',
        subject: 'Acme\u2028Bcc: evil@x',
        text: 'body',
      },
      { connect: connect2 },
    )
    expect(r2).toEqual({ ok: true, transport: 'smtp' })
    const w2 = connect2.getWritten()
    expect(w2).not.toMatch(/\u2028/)
    const sub2 = w2.split('\r\n').find((l) => l.startsWith('Subject:'))
    expect(sub2).toBe('Subject: Acme Bcc: evil@x')
    // Single Subject line only (no header split from LS)
    expect(w2.split('\r\n').filter((l) => l.startsWith('Subject:'))).toHaveLength(1)
  })

  it('sendSmtp fails closed when from/to empty, whitespace, or control after CR/LF scrub', async () => {
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
    if (!rFrom.ok) expect(rFrom.error).toMatch(/invalid from\/to address/i)
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
    if (!rTo.ok) expect(rTo.error).toMatch(/invalid from\/to address/i)
    expect(connect2.getWritten()).toBe('')

    const connect3 = mockConnect(okSmtpScript)
    const rAngle = await sendSmtp(
      {
        host: '127.0.0.1',
        port: 1025,
        from: 'kit@kit.local',
        to: 'user@x.local>',
        subject: 'hi',
        text: 'body',
      },
      { connect: connect3 },
    )
    expect(rAngle.ok).toBe(false)
    if (!rAngle.ok) expect(rAngle.error).toMatch(/invalid from\/to address/i)
    expect(connect3.getWritten()).toBe('')
  })

  it('sendSmtp fails closed on NEL/ZWSP/comma and non-mailbox shapes', async () => {
    const cases = [
      'kit@kit.local\u0085BCC:evil@x',
      'kit@kit.local\u200bbad',
      'a@b.com,c@evil.com',
      'not-an-email',
      '@nodomain',
      'a@@b.com',
      'a@b@c.com',
    ]
    for (const from of cases) {
      const connect = mockConnect(okSmtpScript)
      const r = await sendSmtp(
        {
          host: '127.0.0.1',
          port: 1025,
          from,
          to: 'demo@kit.local',
          subject: 'hi',
          text: 'body',
        },
        { connect },
      )
      expect(r.ok, from).toBe(false)
      expect(connect.getWritten()).toBe('')
    }
  })

  it('sendSmtp dot-stuffs DATA body lines starting with .', async () => {
    const connect = mockConnect(okSmtpScript)
    const r = await sendSmtp(
      {
        host: '127.0.0.1',
        port: 1025,
        from: 'kit@kit.local',
        to: 'demo@kit.local',
        subject: 'hi',
        text: 'hello\n.\nQUIT\nmore',
      },
      { connect },
    )
    expect(r).toEqual({ ok: true, transport: 'smtp' })
    const written = connect.getWritten()
    // Dot-stuffed line must appear as `..` so DATA does not end early on lone `.`
    expect(written).toContain('\r\n..\r\n')
    // Message terminator is still the final lone `.\r\n` after body
    expect(written).toMatch(/\r\n\.\r\nQUIT\r\n/)
  })
})
