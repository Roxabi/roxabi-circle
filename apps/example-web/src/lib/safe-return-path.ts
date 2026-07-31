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
