/**
 * Injectable session boundary (ADR-0002 — Better Auth only).
 *
 * Apps inject `createBetterAuthSessionPort`. The port resolves BA sessions and
 * clears the cookie; issuance is owned by the BA HTTP handler.
 * HMAC-era `sign` / `verify` / `secret` / `cookieHeader` are intentionally absent.
 */
export type ResolveSessionInput = {
  cookieHeader?: string | null
  /** Full request headers when available (Better Auth getSession). */
  headers?: Headers
}

export type SessionPort = {
  /**
   * Preferred session resolve for dual-auth (cookie \| Bearer).
   * BA: getSession({ headers }).
   */
  resolveSession(input: ResolveSessionInput): Promise<import('./session').SessionPayload | null>
  /** Logout helper — BA issues Set-Cookie; this only clears. Default Secure. */
  clearCookieHeader(opts?: { secure?: boolean }): string
}
