/**
 * Injectable session boundary (ADR-0002 — Better Auth only).
 *
 * Apps inject `createBetterAuthSessionPort`. Cookie helpers stay on the port
 * for clear-cookie / name overrides; session issuance is owned by BA HTTP handler.
 * HMAC-era `sign` / `verify` / `secret` are intentionally absent.
 */
export type ResolveSessionInput = {
  cookieHeader?: string | null
  /** Full request headers when available (Better Auth getSession). */
  headers?: Headers
  cookieName: string
}

export type SessionPort = {
  /**
   * Preferred session resolve for dual-auth (cookie \| Bearer).
   * BA: getSession({ headers }).
   */
  resolveSession(input: ResolveSessionInput): Promise<import('./session').SessionPayload | null>
  cookieHeader(token: string, opts?: { secure?: boolean; maxAge?: number }): string
  clearCookieHeader(opts?: { secure?: boolean }): string
}
