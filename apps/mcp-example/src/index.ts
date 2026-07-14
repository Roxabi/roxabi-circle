#!/usr/bin/env bun
/**
 * MCP example — stdio tools: ping, whoami only.
 *
 * whoami verifies Bearer sk_ via GET {API_BASE_URL}/api/me (see @gosilex/mcp).
 *
 * Env:
 * - AUTHORIZATION=sk_… or API_KEY=sk_…  (machine key)
 * - API_BASE_URL=http://127.0.0.1:8787  (kit API origin; required for verified:true)
 * - MCP_ALLOWED_HOSTS=localhost,127.0.0.1  (optional override, comma-separated)
 */
import {
  assertToolsMatchAllowlist,
  extractBearerFromEnv,
  handlePing,
  handleWhoami,
} from '@gosilex/mcp'
import { FastMCP } from 'fastmcp'
import { z } from 'zod'

/**
 * App-local SSoT for registered tool names (not package law).
 * Every entry here is addTool'd below — do not register tools outside this list.
 */
export const REGISTERED_TOOL_NAMES = ['ping', 'whoami'] as const

// Fail boot if registration list drifts from this allowlist
assertToolsMatchAllowlist([...REGISTERED_TOOL_NAMES], REGISTERED_TOOL_NAMES)

const server = new FastMCP({
  name: 'gosilex-mcp-example',
  version: '0.0.1',
})

function whoamiOptsFromEnv() {
  const hosts = process.env.MCP_ALLOWED_HOSTS?.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return {
    apiBaseUrl: process.env.API_BASE_URL ?? null,
    allowedHosts: hosts && hosts.length > 0 ? hosts : undefined,
  }
}

const toolHandlers: Record<(typeof REGISTERED_TOOL_NAMES)[number], () => Promise<string>> = {
  ping: async () => JSON.stringify(await handlePing()),
  whoami: async () => {
    const key = extractBearerFromEnv(process.env as Record<string, string | undefined>)
    return JSON.stringify(await handleWhoami(key, whoamiOptsFromEnv()))
  },
}

// Register exactly REGISTERED_TOOL_NAMES — no ad-hoc addTool outside this loop
for (const name of REGISTERED_TOOL_NAMES) {
  server.addTool({
    name,
    description:
      name === 'ping'
        ? 'Health check'
        : 'Verify API key via GET /api/me (set API_BASE_URL + AUTHORIZATION/API_KEY)',
    parameters: z.object({}),
    execute: toolHandlers[name],
  })
}

// stdio when run as CLI
if (import.meta.main) {
  server.start({ transportType: 'stdio' })
}

export { server }
