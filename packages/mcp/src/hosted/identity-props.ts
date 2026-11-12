import type { McpIdentity } from '../identity'

/**
 * The one identity shape the shell mints and reads back: a non-empty `userId`
 * and an optional email, nothing else (not organization, grants, or spend).
 * `userId` must not contain `:` — the provider prefixes grant and token keys
 * with it (`grant:<userId>:…`), so a colon would let one user's prefix cover
 * another's.
 */
export function normalizeIdentity(raw: unknown): McpIdentity | null {
  if (!raw || typeof raw !== 'object') return null
  if (!('userId' in raw) || typeof raw.userId !== 'string') return null
  const userId = raw.userId.trim()
  if (!userId || userId.includes(':')) return null
  const email = 'email' in raw && typeof raw.email === 'string' ? raw.email.trim() : ''
  return email ? { userId, email } : { userId }
}

/** Grant metadata is the email only. */
export function grantMetadata(identity: McpIdentity): { email: string | null } {
  return { email: identity.email ?? null }
}
