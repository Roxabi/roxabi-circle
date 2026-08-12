import { AppError } from '@kit/core'
import { apiKeyPrefix, parseBearer, verifyApiKey } from './keys'
import { SESSION_COOKIE } from './session'
import type { SessionPort } from './session-port'

export type AuthMethod = 'session' | 'api_key'

export type AuthIdentity = {
  subject: string
  method: AuthMethod
  /** Set when Bearer sk_ is org-bound (ADR-0003 D11). */
  organizationId?: string | null
}

export type ApiKeyRecord = {
  subject: string
  keyHash: string
  revokedAt: number | null
  expiresAt: number | null
  /** Org scope for multi-tenant keys; null = unbound legacy key. */
  organizationId?: string | null
}

export type DualAuthPorts = {
  secret?: string
  cookieName?: string
  /** Full request headers for BA getSession (preferred over cookie-only). */
  headers?: Headers
  /** Required — apps inject createBetterAuthSessionPort (ADR-0002 BA-only). */
  sessions: SessionPort
  findApiKeyByPrefix: (prefix: string) => Promise<ApiKeyRecord | null>
  /**
   * Multi-tenant (ADR-0003 D11): when true, Bearer keys without `organizationId` → 401.
   * Prefer true in product injects; example-api sets it. Default false only for legacy
   * single-tenant / migration escape — do not leave off on multi-tenant products.
   *
   * Note: `findApiKeyByPrefix` may still enforce membership recheck; this flag is the
   * package-level fail-closed for unbound rows that a naïve inject would otherwise accept.
   */
  requireApiKeyOrganization?: boolean
}

/**
 * Pure dual-path auth: Bearer sk_ or session cookie.
 * Bearer wins when both are present.
 */
export async function resolveDualAuth(
  authorization: string | null | undefined,
  cookieHeader: string | null | undefined,
  ports: DualAuthPorts,
): Promise<AuthIdentity | null> {
  const sessions = ports.sessions
  const cookieName = ports.cookieName ?? SESSION_COOKIE
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
    const organizationId = row.organizationId ?? null
    // ADR-0003 D11 — unbound keys must not authenticate when multi-tenant gate is on.
    if (ports.requireApiKeyOrganization && !organizationId) {
      throw AppError.unauthorized()
    }
    return {
      subject: row.subject,
      method: 'api_key',
      organizationId,
    }
  }

  const payload = await sessions.resolveSession({
    cookieHeader,
    headers: ports.headers,
    secret: ports.secret,
    cookieName,
  })
  if (payload) return { subject: payload.sub, method: 'session' }

  return null
}

export type RequireAuthContext = {
  req: {
    header: (name: string) => string | undefined
    /** Hono raw Request — used to forward Headers to BA getSession. */
    raw?: { headers: Headers }
  }
  set: (key: 'subject' | 'authMethod' | 'keyOrganizationId', value: string) => void
}

export function createRequireAuth<C extends RequireAuthContext>(
  getPorts: (c: C) => DualAuthPorts | Promise<DualAuthPorts>,
): (c: C, next: () => Promise<void>) => Promise<void> {
  return async (c, next) => {
    const ports = await getPorts(c)
    const cookieHeader = c.req.header('cookie') ?? null
    const headers =
      ports.headers ?? (c.req.raw?.headers ? new Headers(c.req.raw.headers) : undefined)
    const auth = await resolveDualAuth(c.req.header('authorization') ?? null, cookieHeader, {
      ...ports,
      headers,
    })
    if (!auth) throw AppError.unauthorized()
    c.set('subject', auth.subject)
    c.set('authMethod', auth.method)
    if (auth.method === 'api_key' && auth.organizationId) {
      c.set('keyOrganizationId', auth.organizationId)
    }
    await next()
  }
}
