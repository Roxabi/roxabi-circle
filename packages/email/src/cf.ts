/**
 * Cloudflare Email Sending — Workers binding adapter (ADR-0004).
 * Binding shape matches CF Workers Email Service `env.EMAIL.send(...)`.
 */

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
  }) => Promise<{ messageId?: string } | void>
}

export type SendCfInput = {
  to: string
  from: CfEmailAddress
  subject: string
  text: string
  html?: string
}

export async function sendCf(
  binding: SendEmailBinding,
  input: SendCfInput,
): Promise<{ ok: true; transport: 'cf'; messageId?: string }> {
  const from =
    typeof input.from === 'string'
      ? { email: input.from }
      : { email: input.from.email, name: input.from.name }
  const res = await binding.send({
    to: input.to,
    from,
    subject: input.subject,
    text: input.text,
    html: input.html,
  })
  return {
    ok: true,
    transport: 'cf',
    messageId: res && typeof res === 'object' && 'messageId' in res ? res.messageId : undefined,
  }
}
