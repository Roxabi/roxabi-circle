/** Hash an API key for storage (never store plaintext). High-entropy only — not passwords. */
export async function hashApiKey(plaintext: string): Promise<string> {
  const data = new TextEncoder().encode(plaintext)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

/** Constant-time equality for equal-length hex digests (Workers-safe, no node:crypto). */
export async function timingSafeEqualHex(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length || a.length % 2 !== 0) return false
  const ba = hexToBytes(a)
  const bb = hexToBytes(b)
  if (ba.byteLength !== bb.byteLength) return false
  let diff = 0
  for (let i = 0; i < ba.byteLength; i++) diff |= ba[i]! ^ bb[i]!
  return diff === 0
}

/** Generate a demo sk_ key (plaintext shown once to client). */
export function generateApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  const body = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `sk_${body}`
}

/** Stable prefix for DB index lookup (not secret enough alone — always pair with hash). */
export function apiKeyPrefix(plaintext: string): string {
  if (!plaintext.startsWith('sk_') || plaintext.length < 12) {
    throw new Error('invalid api key format for prefix')
  }
  return plaintext.slice(0, 12)
}

export function parseBearer(header: string | null | undefined): string | null {
  if (!header) return null
  const m = /^Bearer\s+(.+)$/i.exec(header.trim())
  return m?.[1]?.trim() || null
}

/**
 * Verify a presented `sk_` against its stored hash.
 *
 * @capability auth-api-key-verify
 * @tag security
 * @invariant api-key-compare-is-constant-time: comparison goes through timingSafeEqualHex — never === on a digest — ADR-0002 D6 § Credential comparison
 */
export async function verifyApiKey(plaintext: string, expectedHash: string): Promise<boolean> {
  const h = await hashApiKey(plaintext)
  return timingSafeEqualHex(h, expectedHash)
}

/** Default iterations for new hashes (demo kit; raise for production policies). */
export const PBKDF2_ITERS = 100_000
/** Reject stored hashes below this (downgrade / planted weak hashes). */
export const PBKDF2_MIN_ITERS = 100_000
/** Cap iterations on verify to bound CPU DoS if hash column is writable. */
export const PBKDF2_MAX_ITERS = 600_000

/**
 * Password KDF (PBKDF2-SHA-256). Format: `pbkdf2$iterations$saltHex$hashHex`
 * Do not reuse for API keys — use `hashApiKey` for high-entropy sk_ values.
 *
 * @deprecated For session/login credentials — Better Auth crypto owns real passwords.
 * Kit PBKDF2 remains for legacy `demo_users` rows and offline tools only.
 * Prefer `better-auth/crypto` `hashPassword` for BA credential accounts.
 */
export async function hashPassword(password: string, salt?: Uint8Array): Promise<string> {
  const saltBytes = salt ?? crypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes as BufferSource, iterations: PBKDF2_ITERS, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  const hashHex = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('')
  const saltHex = [...saltBytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `pbkdf2$${PBKDF2_ITERS}$${saltHex}$${hashHex}`
}

/**
 * Verify a kit PBKDF2 password hash (`pbkdf2$…` format from {@link hashPassword}).
 *
 * @deprecated For session/login credentials — Better Auth crypto owns real passwords.
 * Kit PBKDF2 remains for legacy `demo_users` / tools only; do not use for BA accounts.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = Number(parts[1])
  const saltHex = parts[2]
  const expectedHex = parts[3]
  if (
    !Number.isFinite(iterations) ||
    iterations < PBKDF2_MIN_ITERS ||
    iterations > PBKDF2_MAX_ITERS ||
    !saltHex ||
    !expectedHex
  ) {
    return false
  }
  try {
    const salt = hexToBytes(saltHex)
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits'],
    )
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
      keyMaterial,
      256,
    )
    const gotHex = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('')
    return timingSafeEqualHex(gotHex, expectedHex)
  } catch {
    return false
  }
}
