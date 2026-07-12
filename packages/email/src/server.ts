/**
 * Node-only email transport helpers (SMTP → Mailpit local).
 * Do **not** import this module from Cloudflare Workers bundles.
 *
 * Usage: scripts / Node CLIs with SMTP_HOST/SMTP_PORT (Mailpit 1025).
 */

export type SmtpSendInput = {
  host: string
  port: number
  from: string
  to: string
  subject: string
  text: string
}

export type SmtpSendResult =
  | { ok: true; transport: 'smtp' }
  | { ok: false; transport: 'smtp'; error: string }

/**
 * Best-effort SMTP DATA dialogue for local Mailpit.
 * Requires Node/Bun `connect` (not available on Workers).
 */
export async function sendSmtp(input: SmtpSendInput): Promise<SmtpSendResult> {
  const connect = (
    globalThis as {
      connect?: (opts: { hostname: string; port: number }) => Promise<{
        writable: WritableStream
        readable: ReadableStream
        close: () => Promise<void>
      }>
    }
  ).connect

  if (typeof connect !== 'function') {
    return {
      ok: false,
      transport: 'smtp',
      error: 'TCP connect() unavailable (use Node/Bun CLI, not Workers)',
    }
  }

  const body = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${input.subject.replace(/[\r\n]/g, ' ')}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@gosilex.local>`,
    ``,
    input.text,
    ``,
  ].join('\r\n')

  let socket: Awaited<ReturnType<NonNullable<typeof connect>>> | undefined
  let writer: WritableStreamDefaultWriter<Uint8Array> | undefined
  try {
    socket = await connect({ hostname: input.host, port: input.port })
    writer = socket.writable.getWriter()
    const encoder = new TextEncoder()
    const write = async (line: string) => {
      await writer!.write(encoder.encode(`${line}\r\n`))
    }
    await write('EHLO localhost')
    await write(`MAIL FROM:<${input.from}>`)
    await write(`RCPT TO:<${input.to}>`)
    await write('DATA')
    await writer.write(encoder.encode(`${body}\r\n.\r\n`))
    await write('QUIT')
    return { ok: true, transport: 'smtp' }
  } catch (e) {
    return {
      ok: false,
      transport: 'smtp',
      error: e instanceof Error ? e.message : String(e),
    }
  } finally {
    try {
      await writer?.close()
    } catch {
      /* ignore */
    }
    try {
      await socket?.close()
    } catch {
      /* ignore */
    }
  }
}

/** Log transport — always succeeds; for tests / fallback inspection. */
export function sendLog(input: { to: string; subject: string; text: string }): {
  ok: true
  transport: 'log'
} {
  console.log(
    JSON.stringify({
      level: 'info',
      transport: 'log',
      to: input.to,
      subject: input.subject,
      body: input.text,
    }),
  )
  return { ok: true, transport: 'log' }
}
