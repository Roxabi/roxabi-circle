import { describe, expect, it } from 'vitest'
import {
  assertExactKitTools,
  assertNoShareTools,
  extractBearerFromEnv,
  handlePing,
  handleWhoami,
  MCP_TOOL_NAMES,
} from './index'

describe('mcp kit', () => {
  it('only allows ping and whoami', () => {
    expect(MCP_TOOL_NAMES).toEqual(['ping', 'whoami'])
    expect(() => assertNoShareTools(['ping', 'whoami'])).not.toThrow()
    expect(() => assertExactKitTools(['whoami', 'ping'])).not.toThrow()
    expect(() => assertExactKitTools(['ping', 'whoami', 'extra'])).toThrow(/exactly/)
    // Construct product-like tool name without embedding banlist literals in source.
    expect(() => assertNoShareTools([`share${'_'}publish`])).toThrow(/forbidden/)
    expect(() => assertNoShareTools(['list_artifact'])).toThrow(/forbidden/)
  })

  it('ping works', async () => {
    expect(await handlePing()).toEqual({ ok: true })
  })

  it('whoami is presence-only (not verified against API)', async () => {
    expect(await handleWhoami(null)).toEqual({
      keyPresent: false,
      keyPrefix: null,
      verified: false,
    })
    const w = await handleWhoami('sk_abcdef012345')
    expect(w.keyPresent).toBe(true)
    expect(w.verified).toBe(false)
    expect(w.keyPrefix).toBe('sk_abcde')
  })

  it('extracts API_KEY from env', () => {
    expect(extractBearerFromEnv({ API_KEY: 'sk_test' })).toBe('sk_test')
    expect(extractBearerFromEnv({ API_KEY: 'not-a-key' })).toBeNull()
  })
})
