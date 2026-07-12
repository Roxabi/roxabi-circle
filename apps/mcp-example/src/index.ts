#!/usr/bin/env bun
/**
 * MCP example — stdio tools: ping, whoami only.
 * whoami = env key *presence* only (not API verification).
 */
import {
  assertExactKitTools,
  extractBearerFromEnv,
  handlePing,
  handleWhoami,
  MCP_TOOL_NAMES,
} from '@gosilex/mcp'
import { FastMCP } from 'fastmcp'
import { z } from 'zod'

/**
 * Single source of truth for registered tool names.
 * Every entry here is addTool'd below — do not register tools outside this list.
 */
export const REGISTERED_TOOL_NAMES = ['ping', 'whoami'] as const

// Fail boot if allowlist and registration list diverge
assertExactKitTools([...REGISTERED_TOOL_NAMES])
if (
  JSON.stringify([...REGISTERED_TOOL_NAMES].sort()) !== JSON.stringify([...MCP_TOOL_NAMES].sort())
) {
  throw new Error('REGISTERED_TOOL_NAMES must match @gosilex/mcp MCP_TOOL_NAMES')
}

const server = new FastMCP({
  name: 'gosilex-mcp-example',
  version: '0.0.1',
})

const toolHandlers: Record<(typeof REGISTERED_TOOL_NAMES)[number], () => Promise<string>> = {
  ping: async () => JSON.stringify(await handlePing()),
  whoami: async () => {
    const key = extractBearerFromEnv(process.env as Record<string, string | undefined>)
    return JSON.stringify(await handleWhoami(key))
  },
}

// Register exactly REGISTERED_TOOL_NAMES — no ad-hoc addTool outside this loop
for (const name of REGISTERED_TOOL_NAMES) {
  server.addTool({
    name,
    description: name === 'ping' ? 'Health check' : 'Env API key presence (not verified)',
    parameters: z.object({}),
    execute: toolHandlers[name],
  })
}

// stdio when run as CLI
if (import.meta.main) {
  server.start({ transportType: 'stdio' })
}

export { MCP_TOOL_NAMES, server }
