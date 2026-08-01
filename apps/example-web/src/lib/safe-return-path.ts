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

/**
 * Safe same-origin path for post set-password / first-login navigation.
 * Allows /app, /admin, /invite/accept (+ query); rejects open redirects.
 */
export function safePostAuthPath(candidate: unknown): string | null {
  if (typeof candidate !== 'string') return null
  const t = candidate.trim()
  if (!t.startsWith('/') || t.startsWith('//')) return null
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t)) return null
  if (t.includes('..')) return null
  try {
    const u = new URL(t, 'http://local.invalid')
    const p = u.pathname
    if (p === '/invite/accept') return `${p}${u.search}`
    if (p === '/app' || p.startsWith('/app/')) return p
    if (p === '/admin' || p.startsWith('/admin/')) return p
    if (p === '/login') return p
    return null
  } catch {
    return null
  }
}
