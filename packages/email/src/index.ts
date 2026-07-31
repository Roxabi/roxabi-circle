import { DemoEmail } from './templates/demo'
import { InviteEmail } from './templates/invite'

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

/** Org invite email (kit copy only). */
export function buildInviteEmailText(params: {
  to: string
  orgName: string
  acceptUrl: string
  expiresAt: Date
  inviterLabel?: string
}): {
  to: string
  subject: string
  text: string
  html: string
} {
  const mail = InviteEmail(params)
  return {
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  }
}

/** Minimal port for transactional mail (edge-safe implementations only on Workers). */
export type EmailPort = {
  send(input: {
    to: string
    subject: string
    text: string
    html?: string
  }): Promise<{ ok: boolean; transport: string }>
}

/** Log transport — edge-safe; always succeeds (Workers, tests, fallback inspection). */
export function sendLog(input: { to: string; subject: string; text: string; html?: string }): {
  ok: true
  transport: 'log'
} {
  console.log(
    JSON.stringify({
      level: 'info',
      transport: 'log',
      to: input.to,
      subject: input.subject,
      // Prefer not dumping full invite tokens in prod logs; S2 dogfood uses log for E2E.
      body: input.text,
    }),
  )
  return { ok: true, transport: 'log' }
}

/** Default EmailPort for Workers / tests (log only). */
export function createLogEmailPort(): EmailPort {
  return {
    async send(input) {
      return sendLog(input)
    },
  }
}

export { DemoEmail } from './templates/demo'
export { InviteEmail } from './templates/invite'

export type EmailTransport = 'smtp' | 'log' | 'resend'
