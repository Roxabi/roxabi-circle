import { describe, expect, it } from 'vitest'
import {
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
    // Construct product-like tool name without embedding banlist literals in source.
    expect(() => assertNoShareTools([`share${'_'}publish`])).toThrow(/forbidden/)
  })

  it('ping works', async () => {
    expect(await handlePing()).toEqual({ ok: true })
  })

  it('whoami reflects key', async () => {
    expect(await handleWhoami(null)).toEqual({ authenticated: false, keyPrefix: null })
    const w = await handleWhoami('sk_abcdef012345')
    expect(w.authenticated).toBe(true)
    expect(w.keyPrefix).toBe('sk_abcde')
  })

  it('extracts API_KEY from env', () => {
    expect(extractBearerFromEnv({ API_KEY: 'sk_test' })).toBe('sk_test')
  })
})
