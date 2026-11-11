import { assertToolsMatchAllowlist } from '@kit/mcp'
import { afterEach, describe, expect, it } from 'vitest'
import { catalogue, REGISTERED_TOOL_NAMES } from './index'

describe('mcp-example registration', () => {
  afterEach(() => {
    delete process.env.API_BASE_URL
    delete process.env.MCP_ALLOWED_HOSTS
    delete process.env.API_KEY
  })

  it('REGISTERED_TOOL_NAMES matches catalogue.names (smoke SSOT)', () => {
    expect([...REGISTERED_TOOL_NAMES]).toEqual([...catalogue.names])
    expect([...REGISTERED_TOOL_NAMES]).toEqual(['ping', 'whoami'])
  })

  it('allowlist assert matches catalogue', () => {
    expect(() =>
      assertToolsMatchAllowlist([...REGISTERED_TOOL_NAMES], catalogue.names),
    ).not.toThrow()
  })

  it('assertExact fails when runtime list plants an extra tool', () => {
    expect(() => catalogue.assertExact([...catalogue.names])).not.toThrow()
    expect(() => catalogue.assertExact([...catalogue.names, 'admin_x'])).toThrow(/exactly/)
  })

  it('catalogue tools execute via registerAll wrap (ping + whoami domain channel)', async () => {
    const handlers = new Map<string, (args: unknown) => Promise<unknown>>()
    catalogue.registerAll({
      addTool(t: { name: string; execute: (args: unknown) => Promise<unknown> }) {
        handlers.set(t.name, t.execute)
      },
    })

    const pingText = await handlers.get('ping')?.({})
    expect(String(pingText)).toContain('"ok":true')

    process.env.API_KEY = 'sk_unit_test_key_not_real'
    // no API_BASE_URL → domain bad_config (not throw)
    const whoText = await handlers.get('whoami')?.({})
    expect(String(whoText)).toContain('bad_config')
    expect(String(whoText)).not.toMatch(/sk_unit/)

    process.env.API_BASE_URL = 'http://127.0.0.1:8787'
    process.env.MCP_ALLOWED_HOSTS = '127.0.0.1,localhost'
    const who2 = await handlers.get('whoami')?.({})
    // still fails network/unreachable without mock fetch — domain channel only
    expect(String(who2)).toMatch(/unreachable|bad_config|unauthorized|missing_key/)
  })
})
