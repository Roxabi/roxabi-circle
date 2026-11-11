/** Connect-src extras from the API base used by `apiFetch` (`VITE_API_URL`). Empty = same-origin proxy. */
export function spaConnectSrc(apiBase: string | undefined): string[] {
  const connect = ["'self'"]
  const raw = apiBase?.trim()
  if (!raw) return connect
  try {
    connect.push(new URL(raw).origin)
  } catch {
    /* invalid VITE_API_URL — leave same-origin only */
  }
  return connect
}

/** HTTP CSP. Do not put `ws:`/`wss:` here — same-origin HMR is `'self'`; blanket WS is a prod hole. */
export function buildSpaCsp(apiBase: string | undefined): string {
  const connect = spaConnectSrc(apiBase).join(' ')
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connect}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ')
}
