import { buildDemoEmailText } from '@gosilex/email'
import type { Env } from '../env'

/**
 * Demo email send. Local: SMTP to Mailpit (default localhost:1025).
 * When SMTP is unavailable, falls back to structured log (still tests the path).
 */
export async function sendDemoEmail(
  env: Env,
  subjectId: string,
): Promise<{ ok: boolean; transport: string; to: string }> {
  const to = env.DEMO_USER_EMAIL || 'demo@gosilex.local'
  const host = env.SMTP_HOST || '127.0.0.1'
  const port = Number(env.SMTP_PORT || '1025')
  const tmpl = buildDemoEmailText({ to, subjectId })
  const body = [
    `From: kit@gosilex.local`,
    `To: ${tmpl.to}`,
    `Subject: ${tmpl.subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@gosilex.local>`,
    ``,
    tmpl.text,
    ``,
  ].join('\r\n')

  try {
    // Minimal SMTP: open TCP via fetch is not available; use undici-less approach.
    // In Workers, raw TCP needs connect() — use log transport when connect unavailable.
    const connect = (
      globalThis as {
        connect?: (opts: { hostname: string; port: number }) => Promise<{
          writable: WritableStream
          readable: ReadableStream
          close: () => Promise<void>
        }>
      }
    ).connect

    if (typeof connect === 'function') {
      const socket = await connect({ hostname: host, port })
      const writer = socket.writable.getWriter()
      const encoder = new TextEncoder()
      const write = async (line: string) => {
        await writer.write(encoder.encode(`${line}\r\n`))
      }
      // Best-effort SMTP dialogue (Mailpit is lenient enough for demo)
      await write(`EHLO localhost`)
      await write(`MAIL FROM:<kit@gosilex.local>`)
      await write(`RCPT TO:<${to}>`)
      await write(`DATA`)
      await writer.write(encoder.encode(`${body}\r\n.\r\n`))
      await write(`QUIT`)
      await writer.close()
      await socket.close()
      return { ok: true, transport: 'smtp', to }
    }
  } catch (e) {
    console.error(
      JSON.stringify({
        level: 'warn',
        msg: 'smtp_failed_fallback_log',
        error: e instanceof Error ? e.message : String(e),
      }),
    )
  }

  console.log(
    JSON.stringify({
      level: 'info',
      transport: 'log',
      to: tmpl.to,
      subject: tmpl.subject,
      body: tmpl.text,
    }),
  )
  return { ok: true, transport: 'log', to: tmpl.to }
}
