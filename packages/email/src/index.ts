import { DemoEmail } from './templates/demo'

/** Build a plain-text demo email body (React Email-style template). */
export function buildDemoEmailText(params: { to: string; subjectId: string }): {
  to: string
  subject: string
  text: string
  html: string
} {
  const mail = DemoEmail(params)
  return {
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  }
}

/** Log transport — edge-safe; always succeeds (Workers, tests, fallback inspection). */
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

export { DemoEmail } from './templates/demo'

export type EmailTransport = 'smtp' | 'log' | 'resend'
