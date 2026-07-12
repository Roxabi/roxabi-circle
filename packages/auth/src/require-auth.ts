import { AppError } from '@gosilex/core'
import { apiKeyPrefix, parseBearer, verifyApiKey } from './keys'
import { parseCookie, SESSION_COOKIE } from './session'
import { defaultSessionPort, type SessionPort } from './session-port'

export type AuthMethod = 'session' | 'api_key'

export type AuthIdentity = {
  subject: string
  method: AuthMethod
}

/** Active key row needed for dual-auth (app supplies D1 lookup). */
export type ApiKeyRecord = {
  subject: string
  keyHash: string
  revokedAt: number | null
  expiresAt: number | null
}

export type DualAuthPorts = {
  secret: string
  sessions?: SessionPort
  /** Lookup by sk_ prefix (unique index). */
  findApiKeyByPrefix: (prefix: string) => Promise<ApiKeyRecord | null>
}

/**
 * Pure dual-path auth: Bearer sk_ (prefix + hash + expiry/revoke) or session cookie.
 * Throws AppError.unauthorized for invalid bearer; returns null when no credentials.
 */
export async function resolveDualAuth(
  authorization: string | null | undefined,
  cookieHeader: string | null | undefined,
  ports: DualAuthPorts,
): Promise<AuthIdentity | null> {
  const sessions = ports.sessions ?? defaultSessionPort
  const bearer = parseBearer(authorization)
  if (bearer) {
    let prefix: string
    try {
      prefix = apiKeyPrefix(bearer)
    } catch {
      throw AppError.unauthorized()
    }
    const row = await ports.findApiKeyByPrefix(prefix)
    if (!row || row.revokedAt != null) throw AppError.unauthorized()
    if (row.expiresAt != null && row.expiresAt <= Date.now()) throw AppError.unauthorized()
    const ok = await verifyApiKey(bearer, row.keyHash)
    if (!ok) throw AppError.unauthorized()
    return { subject: row.subject, method: 'api_key' }
  }

  const token = parseCookie(cookieHeader, SESSION_COOKIE)
  if (token) {
    const payload = await sessions.verify(token, ports.secret)
    if (payload) return { subject: payload.sub, method: 'session' }
  }

  return null
}

/** Minimal Hono-like context for the middleware factory (avoids hard Workers typing). */
export type RequireAuthContext = {
  req: { header: (name: string) => string | undefined }
  set: (key: 'subject' | 'authMethod', value: string) => void
}

/**
 * Hono middleware factory: dual-path auth with injected ports.
 * Usage: `app.use('*', createRequireAuth((c) => ({ secret, findApiKeyByPrefix, sessions })))`
 */
export function createRequireAuth<C extends RequireAuthContext>(
  getPorts: (c: C) => DualAuthPorts | Promise<DualAuthPorts>,
): (c: C, next: () => Promise<void>) => Promise<void> {
  return async (c, next) => {
    const ports = await getPorts(c)
    const auth = await resolveDualAuth(
      c.req.header('authorization') ?? null,
      c.req.header('cookie') ?? null,
      ports,
    )
    if (!auth) throw AppError.unauthorized()
    c.set('subject', auth.subject)
    c.set('authMethod', auth.method)
    await next()
  }
}
