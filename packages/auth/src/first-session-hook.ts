/**
 * Best-effort first-session hook (kit first_login audit).
 * Never blocks session mint. Product supplies the insert (`tryFirstLogin`).
 */
export type FirstSessionHandler = (input: { userId: string }) => Promise<void>

export type FirstSessionLike = { userId?: string | null }

export function createFirstSessionAfterHook(
  onFirstSession?: FirstSessionHandler,
): (session: FirstSessionLike) => Promise<void> {
  return async (session) => {
    if (!onFirstSession) return
    const userId = session.userId
    if (!userId) return
    try {
      await onFirstSession({ userId })
    } catch (err) {
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'audit_append_failed',
          action: 'first_login',
          requestId: 'session_hook',
          error: err instanceof Error ? err.message : String(err),
        }),
      )
    }
  }
}
