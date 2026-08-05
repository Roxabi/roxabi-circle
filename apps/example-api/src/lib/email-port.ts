import {
  createEmailPort,
  type EmailPort,
  type EmailTransport,
  parseAllowDomains,
  resolveEmailTransport,
} from '@kit/email'
import type { Env } from '../env'

/**
 * Resolve Worker EmailPort from env (ADR-0004).
 * development|test → default log; staging|production → require cf|resend.
 * Staging + cf|resend → EMAIL_ALLOW_DOMAINS + From @example.com (D6).
 */
export function resolveEmailPort(env: Env): EmailPort {
  const environment = env.ENVIRONMENT
  const transport: EmailTransport = resolveEmailTransport(env.EMAIL_TRANSPORT, environment)
  const fromEmail = env.EMAIL_FROM?.trim()
  const fromName = env.EMAIL_FROM_NAME?.trim()
  const from =
    fromEmail != null && fromEmail !== ''
      ? fromName
        ? { email: fromEmail, name: fromName }
        : fromEmail
      : undefined

  return createEmailPort({
    transport,
    environment,
    email: env.EMAIL ?? null,
    from,
    resendApiKey: env.RESEND_API_KEY,
    allowDomains: parseAllowDomains(env.EMAIL_ALLOW_DOMAINS),
    fromDomain: env.EMAIL_FROM_DOMAIN?.trim() || null,
  })
}
