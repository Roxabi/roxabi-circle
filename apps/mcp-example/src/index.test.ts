import { assertExactKitTools } from '@gosilex/mcp'
import { describe, expect, it } from 'vitest'
import { MCP_TOOL_NAMES, REGISTERED_TOOL_NAMES } from './index'

describe('mcp-example registration SSoT', () => {
  it('registers exactly the kit allowlist (single source of truth)', () => {
    // REGISTERED_TOOL_NAMES is what is looped into server.addTool in index.ts.
    // FastMCP hides tools on private fields — we do not fake-probe them.
    // Live tools/list is proven by scripts/stdio-smoke.mjs (part of package test).
    expect([...REGISTERED_TOOL_NAMES]).toEqual(['ping', 'whoami'])
    expect([...REGISTERED_TOOL_NAMES].sort()).toEqual([...MCP_TOOL_NAMES].sort())
    expect(() => assertExactKitTools([...REGISTERED_TOOL_NAMES])).not.toThrow()
  })

  it('fails if an extra tool is introduced into the registration list', () => {
    // Falsification contract: assertExactKitTools rejects non-allowlist sets.
    expect(() => assertExactKitTools(['ping', 'whoami', 'admin_x'])).toThrow(/exactly/)
  })
})
