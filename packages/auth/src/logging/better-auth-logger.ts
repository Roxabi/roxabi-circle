// Better Auth messages and arguments can contain SQL parameters, credentials or error causes.
// Preserve severity, but never inspect or forward library-controlled data.
export function logBetterAuthEvent(level: 'debug' | 'info' | 'warn' | 'error'): void {
  switch (level) {
    case 'error':
      console.error('[Better Auth] library_event')
      break
    case 'warn':
      console.warn('[Better Auth] library_event')
      break
    case 'debug':
      console.debug('[Better Auth] library_event')
      break
    case 'info':
      console.log('[Better Auth] library_event')
      break
    default:
      console.error('[Better Auth] library_event')
  }
}
