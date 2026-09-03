/**
 * BA plugin email wiring — templates from `@kit/email`, send via EmailPort.
 * Products inject the port; they do not copy sendMagicLink / sendResetPassword.
 */
import { buildMagicLinkEmailText, buildResetPasswordEmailText } from '@kit/email'

/** Structural EmailPort — same shape as `@kit/email` EmailPort. */
export type AuthEmailPort = {
  send(input: {
    to: string
    subject: string
    text: string
    html?: string
  }): Promise<{ ok: boolean; transport: string }>
}

export const MAGIC_LINK_EXPIRES_IN_SEC = 300
export const RESET_PASSWORD_TOKEN_EXPIRES_IN_SEC = 3600
export const MAGIC_LINK_EXPIRES_HINT = 'about 5 minutes'
export const RESET_PASSWORD_EXPIRES_HINT = 'about 1 hour'

export async function sendMagicLinkMail(
  emailPort: AuthEmailPort,
  input: { email: string; url: string },
): Promise<void> {
  const tmpl = buildMagicLinkEmailText({
    to: input.email,
    magicUrl: input.url,
    expiresHint: MAGIC_LINK_EXPIRES_HINT,
  })
  await emailPort.send({
    to: tmpl.to,
    subject: tmpl.subject,
    text: tmpl.text,
    html: tmpl.html,
  })
}

export async function sendResetPasswordMail(
  emailPort: AuthEmailPort,
  input: { email: string; url: string },
): Promise<void> {
  const tmpl = buildResetPasswordEmailText({
    to: input.email,
    resetUrl: input.url,
    expiresHint: RESET_PASSWORD_EXPIRES_HINT,
  })
  await emailPort.send({
    to: tmpl.to,
    subject: tmpl.subject,
    text: tmpl.text,
    html: tmpl.html,
  })
}
