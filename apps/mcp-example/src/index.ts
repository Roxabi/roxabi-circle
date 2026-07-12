#!/usr/bin/env bun
/**
 * MCP example — stdio tools: ping, whoami only.
 * Auth: set API_KEY=sk_... in env for whoami authenticated=true.
 */
import {
  assertNoShareTools,
  extractBearerFromEnv,
  handlePing,
  handleWhoami,
  MCP_TOOL_NAMES,
} from '@gosilex/mcp'
import { FastMCP } from 'fastmcp'
import { z } from 'zod'

assertNoShareTools([...MCP_TOOL_NAMES])

const server = new FastMCP({
  name: 'gosilex-mcp-example',
  version: '0.0.1',
})

server.addTool({
  name: 'ping',
  description: 'Health check',
  parameters: z.object({}),
  execute: async () => {
    const r = await handlePing()
    return JSON.stringify(r)
  },
})

server.addTool({
  name: 'whoami',
  description: 'Show API key auth state (Bearer via API_KEY env)',
  parameters: z.object({}),
  execute: async () => {
    const key = extractBearerFromEnv(process.env as Record<string, string | undefined>)
    const r = await handleWhoami(key)
    return JSON.stringify(r)
  },
})

// stdio when run as CLI
if (import.meta.main) {
  server.start({ transportType: 'stdio' })
}

export { MCP_TOOL_NAMES, server }
