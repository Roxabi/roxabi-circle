/**
 * Allowlisted post-login return path for invite accept only.
 * Rejects open redirects (absolute URLs, protocol-relative, path traversal).
 */
export function safeInviteReturnPath(candidate: unknown): string | null {
  if (typeof candidate !== 'string') return null
  const t = candidate.trim()
  if (!t.startsWith('/') || t.startsWith('//')) return null
  // Reject scheme-prefixed strings even if they start with / somehow
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t)) return null
  try {
    const u = new URL(t, 'http://local.invalid')
    if (u.pathname !== '/invite/accept') return null
    // Drop hash; keep query (invitationId)
    return `${u.pathname}${u.search}`
  } catch {
    return null
  }
}

/** Same-origin bounce after BA login; `r` is a loopback `/authorize` URL. */
const MCP_OAUTH_RESUME_PATH = '/mcp-oauth/resume'

/** Loopback MCP `/authorize` only — never an open redirect. */
export function parseMcpAuthorizeResumeUrl(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  const host = url.hostname.toLowerCase()
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') return null
  if (url.pathname !== '/authorize') return null
  return url.toString()
}

/** Allowlisted SPA `next` that returns to MCP authorize via the API ticket. */
export function safeMcpOAuthResumePath(candidate: unknown): string | null {
  if (typeof candidate !== 'string') return null
  const t = candidate.trim()
  if (!t.startsWith('/') || t.startsWith('//')) return null
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t)) return null
  try {
    const u = new URL(t, 'http://local.invalid')
    if (u.pathname !== MCP_OAUTH_RESUME_PATH) return null
    const resume = parseMcpAuthorizeResumeUrl(u.searchParams.get('r') ?? '')
    if (!resume) return null
    return `${MCP_OAUTH_RESUME_PATH}?r=${encodeURIComponent(resume)}`
  } catch {
    return null
  }
}

function isRelativeSameOriginPath(candidate: unknown): string | null {
  if (typeof candidate !== 'string') return null
  const t = candidate.trim()
  if (!t.startsWith('/') || t.startsWith('//')) return null
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t)) return null
  return t
}

/** Iterative percent-decode until stable — kill %2e%2e and %252e%252e traversal. */
function rejectsPathTraversal(path: string): boolean {
  let decoded = path
  for (let i = 0; i < 8; i++) {
    if (decoded.includes('..')) return true
    let next: string
    try {
      next = decodeURIComponent(decoded)
    } catch {
      return true
    }
    if (next === decoded) break
    decoded = next
  }
  return decoded.includes('..')
}

function allowlistedPostAuthPath(path: string, search: string): string | null {
  if (path.includes('..')) return null
  if (path === '/invite/accept') return `${path}${search}`
  if (path === MCP_OAUTH_RESUME_PATH) return safeMcpOAuthResumePath(`${path}${search}`)
  if (path === '/app' || path.startsWith('/app/')) return path
  if (path === '/admin' || path.startsWith('/admin/')) return path
  if (path === '/login') return path
  return null
}

/**
 * Safe same-origin path for post set-password / first-login navigation.
 * Allows /app, /admin, /invite/accept (+ query); rejects open redirects.
 */
export function safePostAuthPath(candidate: unknown): string | null {
  const t = isRelativeSameOriginPath(candidate)
  if (!t) return null
  if (rejectsPathTraversal(t)) return null
  try {
    const u = new URL(t, 'http://local.invalid')
    return allowlistedPostAuthPath(u.pathname, u.search)
  } catch {
    return null
  }
}
