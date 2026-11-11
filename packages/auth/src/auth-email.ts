/**
 * BA plugin email wiring — templates from `@kit/email`, send via EmailPort.
 * Products inject the port; they do not copy sendMagicLink / sendResetPassword.
 */
import {
  buildMagicLinkEmailText,
  buildResetPasswordEmailText,
  type EmailPort,
  type TokenHrefPolicy,
} from '@kit/email'

/** Same type as `@kit/email` EmailPort — do not fork the shape. */
export type AuthEmailPort = EmailPort

export const MAGIC_LINK_EXPIRES_IN_SEC = 300
export const RESET_PASSWORD_TOKEN_EXPIRES_IN_SEC = 3600
const MAGIC_LINK_EXPIRES_HINT = 'about 5 minutes'
const RESET_PASSWORD_EXPIRES_HINT = 'about 1 hour'

async function sendOrThrow(
  emailPort: EmailPort,
  tmpl: {
    to: string
    subject: string
    text: string
    html: string
  },
): Promise<void> {
  const sent = await emailPort.send({
    to: tmpl.to,
    subject: tmpl.subject,
    text: tmpl.text,
    html: tmpl.html,
  })
  if (!sent.ok) throw new Error('email send returned not ok')
}

export async function sendMagicLinkMail(
  emailPort: AuthEmailPort,
  input: { email: string; url: string } & TokenHrefPolicy,
): Promise<void> {
  const tmpl = buildMagicLinkEmailText({
    to: input.email,
    magicUrl: input.url,
    expiresHint: MAGIC_LINK_EXPIRES_HINT,
    allowedOrigins: input.allowedOrigins,
    allowLoopbackHttp: input.allowLoopbackHttp,
  })
  await sendOrThrow(emailPort, tmpl)
}

export async function sendResetPasswordMail(
  emailPort: AuthEmailPort,
  input: { email: string; url: string } & TokenHrefPolicy,
): Promise<void> {
  const tmpl = buildResetPasswordEmailText({
    to: input.email,
    resetUrl: input.url,
    expiresHint: RESET_PASSWORD_EXPIRES_HINT,
    allowedOrigins: input.allowedOrigins,
    allowLoopbackHttp: input.allowLoopbackHttp,
  })
  await sendOrThrow(emailPort, tmpl)
}
