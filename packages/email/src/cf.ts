/**
 * Cloudflare Email Sending — Workers binding adapter (ADR-0004).
 * Binding shape matches CF Workers Email Service `env.EMAIL.send(...)`.
 *
 * Transport leaf: scrub headers + fail-closed single mailbox (parity SMTP envelope).
 * Prefer {@link createEmailPort} / EmailPort for product code — not a raw leave export.
 */

import { isValidMailboxAddress } from './domain'
import { scrubHeaderLine } from './scrub'

export type CfEmailAddress = string | { email: string; name?: string }

/** Minimal binding surface used by the kit (mockable in tests). */
export type SendEmailBinding = {
  send: (msg: {
    to: string | string[]
    from: CfEmailAddress
    subject: string
    text?: string
    html?: string
    replyTo?: CfEmailAddress
  }) => Promise<{ messageId?: string } | undefined>
}

export type SendCfInput = {
  to: string
  from: CfEmailAddress
  subject: string
  text: string
  html?: string
}

function scrubCfAddress(from: CfEmailAddress): CfEmailAddress {
  if (typeof from === 'string') return scrubHeaderLine(from).trim()
  return {
    email: scrubHeaderLine(from.email).trim(),
    ...(from.name != null ? { name: scrubHeaderLine(from.name).trim() } : {}),
  }
}

/**
 * CF transport leaf — scrubs headers and validates to/from mailbox before binding.send.
 * Package-internal; product path = EmailPort via createEmailPort / createCfEmailPort.
 */
export async function sendCf(
  binding: SendEmailBinding,
  input: SendCfInput,
): Promise<{ ok: true; transport: 'cf'; messageId?: string }> {
  const to = scrubHeaderLine(input.to).trim()
  const subject = scrubHeaderLine(input.subject).trimEnd()
  const safeFrom = scrubCfAddress(input.from)
  const fromEmail = typeof safeFrom === 'string' ? safeFrom : safeFrom.email
  if (!isValidMailboxAddress(to) || !isValidMailboxAddress(fromEmail)) {
    throw new Error(
      'EMAIL_ADDRESS_INVALID: to/from must be a single printable-ASCII mailbox (exactly one @)',
    )
  }
  const from =
    typeof safeFrom === 'string'
      ? { email: safeFrom }
      : { email: safeFrom.email, name: safeFrom.name }
  const res = await binding.send({
    to,
    from,
    subject,
    text: input.text,
    html: input.html,
  })
  return {
    ok: true,
    transport: 'cf',
    messageId: res && typeof res === 'object' && 'messageId' in res ? res.messageId : undefined,
  }
}
