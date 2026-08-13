/**
 * EmailPort factory implementations + send-boundary header scrub.
 *
 * Product path: create*EmailPort / createEmailPort only.
 * Transport leaves (sendLog / sendCf) scrub headers themselves; wrappers
 * scrub *before* policy (allowlist) so dirty `to` cannot bypass domain checks.
 */
import { type CfEmailAddress, type SendEmailBinding, sendCf } from './cf'
import { emailDomain, isRecipientDomainAllowed, isValidMailboxAddress } from './domain'
import { redactEmailBody } from './redact'
import { scrubEmailAddress, scrubHeaderLine } from './scrub'
import type { EmailPort } from './types'

export type { EmailPort }

/** Scrub to/subject at send boundary (idempotent with leaf scrubs). */
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

/**
 * Log transport leaf — edge-safe; scrubs headers; body tokens redacted.
 * Not a product public surface from `@kit/email` root (see `@kit/email/server` re-export).
 */
export function sendLog(input: { to: string; subject: string; text: string; html?: string }): {
  ok: true
  transport: 'log'
} {
  const scrubbed = scrubPortInput(input)
  console.log(
    JSON.stringify({
      level: 'info',
      transport: 'log',
      to: scrubbed.to,
      subject: scrubbed.subject,
      body: redactEmailBody(scrubbed.text),
    }),
  )
  return { ok: true, transport: 'log' }
}

/** Default EmailPort for Workers / tests (log only). */
export function createLogEmailPort(): EmailPort {
  return {
    async send(input) {
      // Leaf sendLog scrubs again (idempotent).
      return sendLog(input)
    },
  }
}

export function createCfEmailPort(binding: SendEmailBinding, from: CfEmailAddress): EmailPort {
  // From scrubbed once at port construction; sendCf also scrubs per-send fields.
  const safeFrom = scrubEmailAddress(from) as CfEmailAddress
  return {
    async send(input) {
      return sendCf(binding, {
        to: input.to,
        from: safeFrom,
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
 * Scrubs headers before provider call (same choke as CF/log).
 */
export function createResendEmailPort(apiKey: string, from: CfEmailAddress): EmailPort {
  const safeFrom = scrubEmailAddress(from) as CfEmailAddress
  const fromEmail = typeof safeFrom === 'string' ? safeFrom : safeFrom.email
  const fromName = typeof safeFrom === 'string' ? undefined : safeFrom.name
  return {
    async send(input) {
      const scrubbed = scrubPortInput(input)
      if (!isValidMailboxAddress(scrubbed.to) || !isValidMailboxAddress(fromEmail)) {
        throw new Error(
          'EMAIL_ADDRESS_INVALID: to/from must be a single printable-ASCII mailbox (exactly one @)',
        )
      }
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

/**
 * Recipient domain allowlist — scrub → single-mailbox gate → domain match.
 * Order matters: dirty CR/LF/LS must not change domain outcome; multi-@ /
 * spaced tails must not pass via last-@ domain token.
 */
export function withRecipientAllowlist(port: EmailPort, allowDomains: string[]): EmailPort {
  if (allowDomains.length === 0) return port
  return {
    async send(input) {
      const scrubbed = scrubPortInput(input)
      if (!isValidMailboxAddress(scrubbed.to)) {
        throw new Error(
          'EMAIL_RECIPIENT_ADDRESS_INVALID: need single printable-ASCII mailbox (exactly one @)',
        )
      }
      if (!isRecipientDomainAllowed(scrubbed.to, allowDomains)) {
        const d = emailDomain(scrubbed.to) ?? '(invalid)'
        throw new Error(`EMAIL_RECIPIENT_DOMAIN_NOT_ALLOWED: ${d} not in EMAIL_ALLOW_DOMAINS`)
      }
      return port.send(scrubbed)
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
