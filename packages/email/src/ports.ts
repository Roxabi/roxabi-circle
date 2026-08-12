/**
 * EmailPort factory implementations + send-boundary header scrub.
 * Choke point: every transport scrubs to/subject (and From where applicable).
 */
import { type CfEmailAddress, type SendEmailBinding, sendCf } from './cf'
import { redactEmailBody } from './redact'
import { scrubHeaderLine } from './scrub'
import type { EmailPort } from './types'

export type { EmailPort }

/** Scrub to/subject at EmailPort send boundary (all transports). */
export function scrubPortInput(input: {
  to: string
  subject: string
  text: string
  html?: string
}): {
  to: string
  subject: string
  text: string
  html?: string
} {
  return {
    ...input,
    to: scrubHeaderLine(input.to).trim(),
    subject: scrubHeaderLine(input.subject).trimEnd(),
  }
}

export function scrubCfFrom(from: CfEmailAddress): CfEmailAddress {
  if (typeof from === 'string') return scrubHeaderLine(from).trim()
  return {
    email: scrubHeaderLine(from.email).trim(),
    ...(from.name != null ? { name: scrubHeaderLine(from.name).trim() } : {}),
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
      return sendLog(scrubPortInput(input))
    },
  }
}

export function createCfEmailPort(binding: SendEmailBinding, from: CfEmailAddress): EmailPort {
  const safeFrom = scrubCfFrom(from)
  return {
    async send(input) {
      const scrubbed = scrubPortInput(input)
      return sendCf(binding, {
        to: scrubbed.to,
        from: safeFrom,
        subject: scrubbed.subject,
        text: scrubbed.text,
        html: scrubbed.html,
      })
    },
  }
}

/**
 * Resend escape hatch (HTTP). Requires RESEND_API_KEY.
 * Not the kit default — use CF Email Sending on Workers.
 */
export function createResendEmailPort(apiKey: string, from: CfEmailAddress): EmailPort {
  const safeFrom = scrubCfFrom(from)
  const fromEmail = typeof safeFrom === 'string' ? safeFrom : safeFrom.email
  const fromName = typeof safeFrom === 'string' ? undefined : safeFrom.name
  return {
    async send(input) {
      const scrubbed = scrubPortInput(input)
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
          to: [scrubbed.to],
          subject: scrubbed.subject,
          text: scrubbed.text,
          html: scrubbed.html,
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

export function withRecipientAllowlist(
  port: EmailPort,
  allowDomains: string[],
  isAllowed: (to: string, domains: string[]) => boolean,
  domainOf: (to: string) => string | null,
): EmailPort {
  if (allowDomains.length === 0) return port
  return {
    async send(input) {
      if (!isAllowed(input.to, allowDomains)) {
        const d = domainOf(input.to) ?? '(invalid)'
        throw new Error(`EMAIL_RECIPIENT_DOMAIN_NOT_ALLOWED: ${d} not in EMAIL_ALLOW_DOMAINS`)
      }
      return port.send(input)
    },
  }
}

export function withStagingSubjectPrefix(
  port: EmailPort,
  prefixSubject: (subject: string) => string,
): EmailPort {
  return {
    async send(input) {
      return port.send({
        ...input,
        subject: prefixSubject(input.subject),
      })
    },
  }
}
