import { assertToolsMatchAllowlist } from '@gosilex/mcp'
import { describe, expect, it } from 'vitest'
import { catalogue, REGISTERED_TOOL_NAMES } from './index'

describe('mcp-example registration', () => {
  it('REGISTERED_TOOL_NAMES matches catalogue.names (smoke SSOT)', () => {
    expect([...REGISTERED_TOOL_NAMES]).toEqual([...catalogue.names])
    expect([...REGISTERED_TOOL_NAMES]).toEqual(['ping', 'whoami'])
  })

  it('allowlist assert matches catalogue', () => {
    expect(() =>
      assertToolsMatchAllowlist([...REGISTERED_TOOL_NAMES], catalogue.names),
    ).not.toThrow()
  })

  it('assertExact passes for catalogue names as runtime twin only when equal — plant fails', () => {
    expect(() => catalogue.assertExact([...catalogue.names])).not.toThrow()
    expect(() => catalogue.assertExact([...catalogue.names, 'admin_x'])).toThrow(/exactly/)
  })
})
