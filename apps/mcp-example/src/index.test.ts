import { assertToolsMatchAllowlist } from '@gosilex/mcp'
import { describe, expect, it } from 'vitest'
import { REGISTERED_TOOL_NAMES } from './index'

describe('mcp-example registration SSoT', () => {
  it('registers exactly the app allowlist (single source of truth)', () => {
    // REGISTERED_TOOL_NAMES is what is looped into server.addTool in index.ts.
    // Live tools/list is proven by scripts/stdio-smoke.mjs (part of package test).
    expect([...REGISTERED_TOOL_NAMES]).toEqual(['ping', 'whoami'])
    expect(() =>
      assertToolsMatchAllowlist([...REGISTERED_TOOL_NAMES], REGISTERED_TOOL_NAMES),
    ).not.toThrow()
  })

  it('fails if an extra tool is introduced into the registration list', () => {
    expect(() =>
      assertToolsMatchAllowlist(['ping', 'whoami', 'admin_x'], REGISTERED_TOOL_NAMES),
    ).toThrow(/exactly/)
  })
})
