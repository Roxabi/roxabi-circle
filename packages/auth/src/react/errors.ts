/** Duck-typed ApiError / BA `Error('HTTP N')` — no @kit/api-client in this package. */
export function resolveAuthFormStatus(err: unknown): {
  status: number | null
  code: string | null
} {
  if (err != null && typeof err === 'object') {
    const o = err as { status?: unknown; code?: unknown }
    const status = typeof o.status === 'number' ? o.status : null
    const code = typeof o.code === 'string' ? o.code : null
    if (status != null || code != null) return { status, code }
  }
  if (err instanceof Error) {
    const match = /^HTTP (\d{3})$/.exec(err.message)
    if (match) return { status: Number(match[1]), code: null }
  }
  return { status: null, code: null }
}

export function isRateLimited(err: unknown): boolean {
  const { status, code } = resolveAuthFormStatus(err)
  return status === 429 || code === 'RATE_LIMITED'
}

export type ChangePasswordErrorCopy = {
  changePasswordReauth: string
  changePasswordWrong: string
  errRateLimited: string
}

/**
 * Map BA / kit errors for change-password toasts only.
 * 401/403 → re-auth; 429 → rate; 400 → wrong current password.
 */
export function changePasswordErrorMessage(
  err: unknown,
  copy: ChangePasswordErrorCopy,
  fallback: (err: unknown) => string,
): string {
  const { status, code } = resolveAuthFormStatus(err)
  if (status === 401 || code === 'UNAUTHORIZED') return copy.changePasswordReauth
  if (status === 429 || code === 'RATE_LIMITED') return copy.errRateLimited
  if (status === 403 || code === 'FORBIDDEN') return copy.changePasswordReauth
  if (status === 400) return copy.changePasswordWrong
  return fallback(err)
}
