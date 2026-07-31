import { type CfEmailAddress, type SendEmailBinding, sendCf } from './cf'
import { redactEmailBody } from './redact'
import { DemoEmail } from './templates/demo'
import { InviteEmail } from './templates/invite'
import { ResetPasswordEmail } from './templates/reset-password'

export type EmailTransport = 'log' | 'smtp' | 'cf' | 'resend'

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

/** Password reset email (kit copy only). */
export function buildResetPasswordEmailText(params: {
  to: string
  resetUrl: string
  expiresHint?: string
}): {
  to: string
  subject: string
  text: string
  html: string
} {
  const mail = ResetPasswordEmail(params)
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

export type CreateEmailPortOpts = {
  transport: EmailTransport
  /** development | test | staging | production */
  environment?: string
  /** CF send_email binding (required when transport=cf). */
  email?: SendEmailBinding | null
  /** From address for cf/resend. */
  from?: CfEmailAddress
  /** Resend API key when transport=resend (Worker secret). */
  resendApiKey?: string
}

function envNorm(environment?: string): string {
  return (environment || 'development').trim().toLowerCase()
}

function isDevLike(environment?: string): boolean {
  const e = envNorm(environment)
  return e === 'development' || e === 'test' || e === ''
}

/**
 * Fail closed: `log` is not allowed on staging/production.
 * `smtp` is never a Worker transport (Node `/server` only).
 */
export function assertEmailTransportAllowed(transport: EmailTransport, environment?: string): void {
  if (transport === 'smtp') {
    throw new Error(
      'EMAIL_TRANSPORT=smtp is Node-only (@gosilex/email/server) — not available on Workers',
    )
  }
  if (transport === 'log' && !isDevLike(environment)) {
    throw new Error(
      'EMAIL_TRANSPORT=log is forbidden when ENVIRONMENT is staging|production (ADR-0004)',
    )
  }
}

/** Log transport — edge-safe; body is redacted (tokens stripped). */
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
      body: redactEmailBody(input.text),
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

function createCfEmailPort(binding: SendEmailBinding, from: CfEmailAddress): EmailPort {
  return {
    async send(input) {
      return sendCf(binding, {
        to: input.to,
        from,
        subject: input.subject,
        text: input.text,
        html: input.html,
      })
    },
  }
}

/**
 * Resend escape hatch (HTTP). Requires RESEND_API_KEY.
 * Not the kit default — use CF Email Sending on Workers.
 */
function createResendEmailPort(apiKey: string, from: CfEmailAddress): EmailPort {
  const fromEmail = typeof from === 'string' ? from : from.email
  const fromName = typeof from === 'string' ? undefined : from.name
  return {
    async send(input) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
          to: [input.to],
          subject: input.subject,
          text: input.text,
          html: input.html,
        }),
      })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(`Resend send failed: ${res.status} ${detail.slice(0, 200)}`)
      }
      return { ok: true, transport: 'resend' }
    },
  }
}

/**
 * Worker-safe email port factory (ADR-0004).
 * - development|test: default callers usually pass transport=log
 * - staging|production: log rejected; cf requires binding; resend requires key
 */
export function createEmailPort(opts: CreateEmailPortOpts): EmailPort {
  assertEmailTransportAllowed(opts.transport, opts.environment)

  if (opts.transport === 'log') {
    return createLogEmailPort()
  }

  if (opts.transport === 'cf') {
    if (!opts.email) {
      throw new Error('EMAIL_TRANSPORT=cf requires EMAIL send_email binding')
    }
    if (!opts.from) {
      throw new Error('EMAIL_TRANSPORT=cf requires EMAIL_FROM')
    }
    return createCfEmailPort(opts.email, opts.from)
  }

  if (opts.transport === 'resend') {
    if (!opts.resendApiKey?.trim()) {
      throw new Error('EMAIL_TRANSPORT=resend requires RESEND_API_KEY')
    }
    if (!opts.from) {
      throw new Error('EMAIL_TRANSPORT=resend requires EMAIL_FROM')
    }
    return createResendEmailPort(opts.resendApiKey.trim(), opts.from)
  }

  throw new Error(`Unsupported EMAIL_TRANSPORT: ${opts.transport}`)
}

/**
 * Resolve transport string for an app environment.
 * development|test → default log; staging|production → require explicit cf|resend.
 */
export function resolveEmailTransport(
  raw: string | undefined,
  environment?: string,
): EmailTransport {
  const t = raw?.trim().toLowerCase()
  if (!t) {
    if (isDevLike(environment)) return 'log'
    throw new Error(
      'EMAIL_TRANSPORT is required when ENVIRONMENT is staging|production (use cf or resend)',
    )
  }
  if (t === 'log' || t === 'cf' || t === 'resend' || t === 'smtp') return t
  throw new Error(`Invalid EMAIL_TRANSPORT: ${raw}`)
}

export { type CfEmailAddress, type SendEmailBinding, sendCf } from './cf'
export { redactEmailBody } from './redact'
export { DemoEmail } from './templates/demo'
export { InviteEmail } from './templates/invite'
export { ResetPasswordEmail } from './templates/reset-password'
