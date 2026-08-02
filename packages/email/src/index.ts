import { type CfEmailAddress, type SendEmailBinding, sendCf } from './cf'
import { redactEmailBody } from './redact'
import { DemoEmail } from './templates/demo'
import { InviteEmail } from './templates/invite'
import { MagicLinkEmail } from './templates/magic-link'
import { ResetPasswordEmail } from './templates/reset-password'
import { WelcomeSetPasswordEmail } from './templates/welcome-set-password'

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

/** Welcome / first-login set-password email (kit copy only). */
export function buildWelcomeSetPasswordEmailText(params: {
  to: string
  setPasswordUrl: string
  expiresHint?: string
  name?: string
}): {
  to: string
  subject: string
  text: string
  html: string
} {
  const mail = WelcomeSetPasswordEmail(params)
  return {
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  }
}

/** Magic-link sign-in email (kit copy only). */
export function buildMagicLinkEmailText(params: {
  to: string
  magicUrl: string
  expiresHint?: string
}): {
  to: string
  subject: string
  text: string
  html: string
} {
  const mail = MagicLinkEmail(params)
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

/** GOSILEX kit: staging From must be this domain (overridable via EMAIL_FROM_DOMAIN). */
export const DEFAULT_STAGING_FROM_DOMAIN = 'gosilex.com'

/** Forced subject prefix on every staging send (real CF/resend). */
export const STAGING_SUBJECT_PREFIX = '[TEST STAGING]'

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
  /**
   * Recipient domain allowlist (exact match, lowercase).
   * Staging + cf|resend: **required** non-empty.
   * Production: optional; when set, enforced.
   */
  allowDomains?: string[] | null
  /**
   * Required domain for EMAIL_FROM (e.g. `gosilex.com`).
   * Staging defaults to {@link DEFAULT_STAGING_FROM_DOMAIN} when unset.
   * Production: only enforced when explicitly set.
   */
  fromDomain?: string | null
}

function envNorm(environment?: string): string {
  return (environment || 'development').trim().toLowerCase()
}

function isDevLike(environment?: string): boolean {
  const e = envNorm(environment)
  return e === 'development' || e === 'test' || e === ''
}

function isStaging(environment?: string): boolean {
  return envNorm(environment) === 'staging'
}

/** Parse `EMAIL_ALLOW_DOMAINS=a.com,b.com` → normalized unique list. */
export function parseAllowDomains(raw?: string | null): string[] {
  if (raw == null || raw.trim() === '') return []
  const out = new Set<string>()
  for (const part of raw.split(',')) {
    const d = part.trim().toLowerCase().replace(/^\./, '')
    if (d.length > 0) out.add(d)
  }
  return [...out]
}

/** Extract domain from an email address (after last @). */
export function emailDomain(address: string): string | null {
  const s = address.trim().toLowerCase()
  const at = s.lastIndexOf('@')
  if (at <= 0 || at === s.length - 1) return null
  return s.slice(at + 1)
}

export function fromEmailString(from: CfEmailAddress): string {
  return typeof from === 'string' ? from : from.email
}

/** Exact domain match (no parent-domain wildcard). */
export function isRecipientDomainAllowed(to: string, allowDomains: string[]): boolean {
  if (allowDomains.length === 0) return true
  const domain = emailDomain(to)
  if (domain == null) return false
  const allow = new Set(allowDomains.map((d) => d.trim().toLowerCase()).filter(Boolean))
  return allow.has(domain)
}

export function assertFromDomain(from: CfEmailAddress, fromDomain: string): void {
  const want = fromDomain.trim().toLowerCase().replace(/^\./, '')
  if (!want) return
  const got = emailDomain(fromEmailString(from))
  if (got !== want) {
    throw new Error(
      `EMAIL_FROM must be @${want} (got ${fromEmailString(from)}); set EMAIL_FROM or EMAIL_FROM_DOMAIN`,
    )
  }
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

/**
 * Staging real-send policy (ADR-0004 D6):
 * - recipient allowlist required
 * - From domain = gosilex.com (or EMAIL_FROM_DOMAIN)
 */
export function assertStagingEmailPolicy(opts: {
  transport: EmailTransport
  environment?: string
  from?: CfEmailAddress
  allowDomains?: string[] | null
  fromDomain?: string | null
}): void {
  if (!isStaging(opts.environment)) return
  if (opts.transport !== 'cf' && opts.transport !== 'resend') return

  const allow = opts.allowDomains ?? []
  if (allow.length === 0) {
    throw new Error(
      'EMAIL_ALLOW_DOMAINS is required when ENVIRONMENT=staging and EMAIL_TRANSPORT=cf|resend (comma-separated recipient domains)',
    )
  }

  if (opts.from == null) {
    throw new Error('EMAIL_FROM is required when ENVIRONMENT=staging and EMAIL_TRANSPORT=cf|resend')
  }

  const fromDomain = opts.fromDomain?.trim() || DEFAULT_STAGING_FROM_DOMAIN
  assertFromDomain(opts.from, fromDomain)
}

/**
 * Ensure subject starts with `[TEST STAGING]` (idempotent if already present).
 */
export function prefixStagingSubject(subject: string): string {
  const s = subject.trimStart()
  const upper = s.toUpperCase()
  const prefixUpper = STAGING_SUBJECT_PREFIX.toUpperCase()
  if (upper.startsWith(prefixUpper)) return s
  return `${STAGING_SUBJECT_PREFIX} ${s}`
}

function withRecipientAllowlist(port: EmailPort, allowDomains: string[]): EmailPort {
  if (allowDomains.length === 0) return port
  return {
    async send(input) {
      if (!isRecipientDomainAllowed(input.to, allowDomains)) {
        const d = emailDomain(input.to) ?? '(invalid)'
        throw new Error(`EMAIL_RECIPIENT_DOMAIN_NOT_ALLOWED: ${d} not in EMAIL_ALLOW_DOMAINS`)
      }
      return port.send(input)
    },
  }
}

function withStagingSubjectPrefix(port: EmailPort): EmailPort {
  return {
    async send(input) {
      return port.send({
        ...input,
        subject: prefixStagingSubject(input.subject),
      })
    },
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
 * - staging + cf|resend: EMAIL_ALLOW_DOMAINS required; From @gosilex.com; subject `[TEST STAGING]` (D6)
 */
export function createEmailPort(opts: CreateEmailPortOpts): EmailPort {
  assertEmailTransportAllowed(opts.transport, opts.environment)
  assertStagingEmailPolicy(opts)

  // Production optional From-domain pin (when EMAIL_FROM_DOMAIN set).
  if (envNorm(opts.environment) === 'production' && opts.from != null && opts.fromDomain?.trim()) {
    assertFromDomain(opts.from, opts.fromDomain.trim())
  }

  const allow = (opts.allowDomains ?? []).map((d) => d.trim().toLowerCase()).filter(Boolean)

  let port: EmailPort

  if (opts.transport === 'log') {
    port = createLogEmailPort()
  } else if (opts.transport === 'cf') {
    if (!opts.email) {
      throw new Error('EMAIL_TRANSPORT=cf requires EMAIL send_email binding')
    }
    if (!opts.from) {
      throw new Error('EMAIL_TRANSPORT=cf requires EMAIL_FROM')
    }
    port = createCfEmailPort(opts.email, opts.from)
  } else if (opts.transport === 'resend') {
    if (!opts.resendApiKey?.trim()) {
      throw new Error('EMAIL_TRANSPORT=resend requires RESEND_API_KEY')
    }
    if (!opts.from) {
      throw new Error('EMAIL_TRANSPORT=resend requires EMAIL_FROM')
    }
    port = createResendEmailPort(opts.resendApiKey.trim(), opts.from)
  } else {
    throw new Error(`Unsupported EMAIL_TRANSPORT: ${opts.transport}`)
  }

  port = withRecipientAllowlist(port, allow)
  if (isStaging(opts.environment)) {
    port = withStagingSubjectPrefix(port)
  }
  return port
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
export { WelcomeSetPasswordEmail } from './templates/welcome-set-password'
