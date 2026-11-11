import { AppError } from '@kit/core'
import { BA_BASE_PATH } from '../better-auth-base-path'
import { hashApiKey } from '../keys'
import type { KitRepoDb } from './db-type'
import { assertRateLimit } from './rate-limit'

/**
 * Deny-by-default throttle in front of the Better Auth handler, on durable D1 buckets.
 *
 * The kit limiter is the only Better Auth limiter: `createBetterAuth` pins Better Auth's own one
 * off. Every request under {@link BA_BASE_PATH} spends the address bucket except the two session
 * reads, so an endpoint Better Auth adds spends it the day it ships. The e-mail and
 * session-ending sets are kit lists: an endpoint joins them only through a kit change. Each bucket
 * allows {@link BA_THROTTLE_LIMIT} requests per {@link BA_THROTTLE_WINDOW_MS}:
 * - `ba-auth:<ip>` — every non-exempt request; {@link BA_NO_PLATFORM_IP} without a platform address.
 * - `ba-auth-email:<sha256>` — POSTs that name an account by e-mail
 *   ({@link BA_EMAIL_BUDGET_PATHS}), so rotating addresses refills neither guesses nor mail sends.
 * - `ba-auth-session:<id>` — every non-exempt request that carries a session, except the POSTs that
 *   end sessions ({@link BA_SESSION_ENDING_PATHS}), keyed by the session id, not the account. A
 *   second session of the same account cannot spend this budget, so it cannot block the owner's
 *   password change. Those POSTs still spend the address bucket, so a full address bucket blocks
 *   them too (see `docs/kit/auth-abuse-response.md` § Residual risks).
 *
 * Paths come from `request.url`, the raw pathname Better Auth routes on — never a framework's
 * percent-decoded path.
 */

export const BA_THROTTLE_LIMIT = 20
export const BA_THROTTLE_WINDOW_MS = 15 * 60 * 1000
/** Address bucket shared by every request without a platform address (off Cloudflare). */
export const BA_NO_PLATFORM_IP = 'no-platform-ip'

/** The only requests that spend nothing: GET session reads that test no password and no token. */
const EXEMPT_GETS: Record<string, true> = {
  [`${BA_BASE_PATH}/get-session`]: true,
  [`${BA_BASE_PATH}/ok`]: true,
}

/** POSTs that act on an existing account named by their `email` field (sign-in, mail sends). */
export const BA_EMAIL_BUDGET_PATHS: Readonly<Record<string, true>> = {
  [`${BA_BASE_PATH}/sign-in/email`]: true,
  [`${BA_BASE_PATH}/sign-in/magic-link`]: true,
  [`${BA_BASE_PATH}/request-password-reset`]: true,
  [`${BA_BASE_PATH}/send-verification-email`]: true,
}

/** POSTs that end sessions. They spend the address bucket, never the session's own. */
export const BA_SESSION_ENDING_PATHS: Readonly<Record<string, true>> = {
  [`${BA_BASE_PATH}/sign-out`]: true,
  [`${BA_BASE_PATH}/revoke-session`]: true,
  [`${BA_BASE_PATH}/revoke-sessions`]: true,
  [`${BA_BASE_PATH}/revoke-other-sessions`]: true,
}

/** better-call's JSON media rule (`getBody`): the only body Better Auth reads for these POSTs. */
const JSON_MEDIA = /^application\/([a-z0-9.+-]*\+)?json/i
/** RFC 5321 path limit: a longer value is no address. */
const MAX_EMAIL_LENGTH = 254

/** True only for `GET` on exactly `/api/auth/get-session` or `/api/auth/ok`. */
export function isBaThrottleExempt(method: string, pathname: string): boolean {
  return method === 'GET' && EXEMPT_GETS[pathname] === true
}

export type BaThrottleInput = {
  /** The request about to reach the Better Auth handler. Its body is read through a clone. */
  request: Request
  /** Platform client address (`clientIp`), or `null` off the platform. */
  ip: string | null
  /**
   * Verified Better Auth session id of the request (`session.id` from `auth.api.getSession`), or
   * `null`. Never the account id, never the session token. Called at most once, after the address
   * charge.
   */
  sessionId: () => Promise<string | null>
}

/**
 * Spend the buckets of one Better Auth request, or throw: `AppError.rateLimited` (429 with
 * `retryAfterSeconds`) on a full bucket, `AppError.validation` (400) on an e-mail-budget POST whose
 * e-mail cannot be read, `AppError.internal` (500) when D1 fails. Never lets a request through
 * on an error.
 */
export async function throttleBetterAuthRequest(
  db: KitRepoDb,
  input: BaThrottleInput,
): Promise<void> {
  const { method } = input.request
  const pathname = new URL(input.request.url).pathname
  if (isBaThrottleExempt(method, pathname)) return
  await spend(db, `ba-auth:${input.ip ?? BA_NO_PLATFORM_IP}`)
  if (method !== 'POST') {
    await spendSession(db, input)
    return
  }
  const bare = await spendEmail(db, input.request, pathname)
  if (BA_SESSION_ENDING_PATHS[bare] !== true) await spendSession(db, input)
}

/**
 * Trusted-internal admission only. The caller must authenticate actorId server-side; this function
 * does not authenticate or authorize the actor and must not be mounted on raw HTTP auth routes.
 * It charges an actor source instead of an IP or session, plus the same shared e-mail budget.
 */
export async function throttleBetterAuthActorRequest(
  db: KitRepoDb,
  input: { request: Request; actorId: string },
): Promise<void> {
  if (typeof input.actorId !== 'string' || input.actorId.trim().length === 0) {
    throw AppError.validation('This auth request needs a trusted actor')
  }
  const pathname = new URL(input.request.url).pathname
  if (isBaThrottleExempt(input.request.method, pathname)) return
  await spend(db, `ba-auth-actor:${input.actorId}`)
  if (input.request.method === 'POST') await spendEmail(db, input.request, pathname)
}

async function spendEmail(db: KitRepoDb, request: Request, pathname: string): Promise<string> {
  // Better Auth 404s a trailing slash while `advanced.skipTrailingSlashes` is off; matching the
  // bare path keeps both kit lists right if a product turns that option on.
  const bare = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  if (BA_EMAIL_BUDGET_PATHS[bare] === true) await spend(db, await emailBucket(request))
  return bare
}

function spend(db: KitRepoDb, key: string): Promise<void> {
  return assertRateLimit(db, key, BA_THROTTLE_LIMIT, BA_THROTTLE_WINDOW_MS)
}

async function spendSession(db: KitRepoDb, input: BaThrottleInput): Promise<void> {
  const id = await input.sessionId()
  if (id) await spend(db, `ba-auth-session:${id}`)
}

/**
 * Bucket of the e-mail Better Auth looks up: its JSON `email` field, lower-cased as
 * `findUserByEmail` does, not trimmed. Anything unreadable is a 400 here, so no e-mail-budget POST
 * reaches Better Auth uncharged. The key is a SHA-256 pseudonym: fixed size, no address in clear,
 * but guessable from a list of addresses.
 */
async function emailBucket(request: Request): Promise<string> {
  let email: unknown
  if (JSON_MEDIA.test(request.headers.get('content-type') ?? '')) {
    try {
      const body: unknown = await request.clone().json()
      if (typeof body === 'object' && body !== null && 'email' in body) email = body.email
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e
    }
  }
  if (typeof email !== 'string' || email.length === 0 || email.length > MAX_EMAIL_LENGTH) {
    throw AppError.validation('This auth request needs one readable email')
  }
  return `ba-auth-email:${await hashApiKey(email.toLowerCase())}`
}
