import { expect, it, vi } from 'vitest'
import { logBetterAuthEvent } from './better-auth-logger'

it('emits only fixed severity events, never library-controlled values', () => {
  const calls: unknown[][] = []
  const spies = (['error', 'warn', 'log', 'debug'] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      calls.push(args)
    }),
  )
  try {
    // The real callback receives a message and arbitrary arguments from Better Auth.
    const callback: (level: 'error' | 'warn', message: string, ...args: unknown[]) => void =
      logBetterAuthEvent
    callback('error', 'secret in message', new Error('secret in error'), { token: 'secret' })
    callback('warn', 'secret in warning', { cause: new Error('secret in cause') })
  } finally {
    for (const spy of spies) spy.mockRestore()
  }
  expect(calls).toEqual([['[Better Auth] library_event'], ['[Better Auth] library_event']])
})
