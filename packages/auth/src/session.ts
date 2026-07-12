/**
 * Cookie session for kit demo (B3) — Better Auth–compatible *contract*:
 * HttpOnly cookie + credentials: 'include' on the SPA.
 *
 * Implementation: HMAC-signed payload (Workers-friendly, zero extra deps).
 * Swap to Better Auth adapters later without changing FE fetch/cookie shape.
 */

export type SessionPayload = {
  sub: string
  email: string
  exp: number
}

function b64url(data: ArrayBuffer | Uint8Array | string): string {
  const bytes =
    typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

export async function signSession(payload: SessionPayload, secret: string): Promise<string> {
  const body = b64url(JSON.stringify(payload))
  const key = await hmacKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return `${body}.${b64url(sig)}`
}

export async function verifySession(token: string, secret: string): Promise<SessionPayload | null> {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const key = await hmacKey(secret)
  const sigBytes = fromB64url(sig)
  const ok = await crypto.subtle.verify(
    'HMAC',
    key,
    sigBytes.buffer.slice(
      sigBytes.byteOffset,
      sigBytes.byteOffset + sigBytes.byteLength,
    ) as ArrayBuffer,
    new TextEncoder().encode(body),
  )
  if (!ok) return null
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as SessionPayload
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export const SESSION_COOKIE = 'gosilex_session'

export function sessionCookieHeader(
  token: string,
  opts?: { secure?: boolean; maxAge?: number },
): string {
  const secure = opts?.secure ? '; Secure' : ''
  const maxAge = opts?.maxAge ?? 60 * 60 * 24 * 7
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
}

export function parseCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return rest.join('=') || null
  }
  return null
}
