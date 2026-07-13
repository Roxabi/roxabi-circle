import { parseBearer } from '@gosilex/auth'

/**
 * Assert registered tool names equal an app-supplied allowlist (order-insensitive).
 * Kit purity (no product-domain tools) is enforced by scripts/check-banned-strings.sh,
 * not by hardcoding product lexicon in this package.
 */
export function assertToolsMatchAllowlist(names: string[], allowlist: readonly string[]): void {
  const sorted = [...names].sort()
  const expected = [...allowlist].sort()
  if (sorted.length !== expected.length || sorted.some((n, i) => n !== expected[i])) {
    throw new Error(
      `MCP tools must be exactly ${expected.join(',')}; got ${sorted.join(',') || '(none)'}`,
    )
  }
}

/**
 * @deprecated Use {@link assertToolsMatchAllowlist} with an app-local allowlist.
 * Kept as thin alias so older call sites keep compiling during migrate.
 */
export function assertExactKitTools(names: string[]): void {
  // Default example allowlist only — products must pass their own list.
  assertToolsMatchAllowlist(names, ['ping', 'whoami'])
}

/** @deprecated Prefer banlist script + app allowlist; no product tokens in kit package. */
export function assertNoShareTools(names: string[]): void {
  for (const n of names) {
    // Generic: reject empty / non-identifier tool names only (not product lexicon).
    if (!n || !/^[a-z][a-z0-9_]*$/i.test(n)) {
      throw new Error(`invalid MCP tool name: ${n}`)
    }
  }
}

/** Example kit tool names — for docs/tests; apps own registration SSoT. */
export const MCP_TOOL_NAMES = ['ping', 'whoami'] as const
export type McpToolName = (typeof MCP_TOOL_NAMES)[number]

export function extractBearerFromEnv(env: Record<string, string | undefined>): string | null {
  const auth = env.AUTHORIZATION?.trim()
  if (auth) {
    // Accept bare sk_… or full "Bearer sk_…" without double-prefixing.
    const fromBearer = parseBearer(auth) ?? parseBearer(`Bearer ${auth}`)
    if (fromBearer) return fromBearer
  }
  return env.API_KEY?.startsWith('sk_') ? env.API_KEY : null
}

export async function handlePing(): Promise<{ ok: true }> {
  return { ok: true }
}

export type WhoamiResult = {
  keyPresent: boolean
  verified: boolean
  /** Subject from GET /api/me when verified; never key material. */
  subject: string | null
  /** Machine-readable fail reason when not verified. */
  status: 'ok' | 'missing_key' | 'unauthorized' | 'unreachable' | 'invalid_response' | 'bad_config'
}

export type WhoamiFetch = (
  input: string,
  init: { method: string; headers: Record<string, string>; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

export type WhoamiOptions = {
  /** Base URL of the kit API, e.g. http://127.0.0.1:8787 — no path. */
  apiBaseUrl?: string | null
  /** Default 3000ms. */
  timeoutMs?: number
  /**
   * Hostnames allowed for SSRF protection (exact host match).
   * Defaults to localhost / 127.0.0.1.
   */
  allowedHosts?: string[]
  /** Injectable fetch (tests). Defaults to globalThis.fetch. */
  fetch?: WhoamiFetch
}

const DEFAULT_ALLOWED_HOSTS = ['localhost', '127.0.0.1', '[::1]']

function isAllowedApiBase(apiBaseUrl: string, allowedHosts: string[]): URL | null {
  let url: URL
  try {
    url = new URL(apiBaseUrl)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  const host = url.hostname.toLowerCase()
  if (!allowedHosts.some((h) => h.toLowerCase() === host)) return null
  return url
}

/**
 * Verify Bearer sk_ against GET {apiBaseUrl}/api/me.
 * Never returns key material. Fail-closed on network/auth/config errors (does not throw).
 */
export async function handleWhoami(
  apiKey: string | null,
  opts?: WhoamiOptions,
): Promise<WhoamiResult> {
  if (!apiKey) {
    return { keyPresent: false, verified: false, subject: null, status: 'missing_key' }
  }

  const base = opts?.apiBaseUrl?.trim()
  if (!base) {
    return { keyPresent: true, verified: false, subject: null, status: 'bad_config' }
  }

  const allowed = opts?.allowedHosts ?? DEFAULT_ALLOWED_HOSTS
  const url = isAllowedApiBase(base, allowed)
  if (!url) {
    return { keyPresent: true, verified: false, subject: null, status: 'bad_config' }
  }

  const meUrl = new URL('/api/me', url).toString()
  const timeoutMs = opts?.timeoutMs ?? 3000
  const fetchImpl = opts?.fetch ?? (globalThis.fetch as WhoamiFetch)
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)

  try {
    const res = await fetchImpl(meUrl, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: 'application/json',
      },
      signal: ac.signal,
    })
    if (res.status === 401 || res.status === 403) {
      return { keyPresent: true, verified: false, subject: null, status: 'unauthorized' }
    }
    if (!res.ok) {
      return { keyPresent: true, verified: false, subject: null, status: 'unreachable' }
    }
    const body = (await res.json()) as { subject?: unknown }
    if (typeof body.subject !== 'string' || body.subject.length === 0) {
      return { keyPresent: true, verified: false, subject: null, status: 'invalid_response' }
    }
    return { keyPresent: true, verified: true, subject: body.subject, status: 'ok' }
  } catch {
    return { keyPresent: true, verified: false, subject: null, status: 'unreachable' }
  } finally {
    clearTimeout(timer)
  }
}
