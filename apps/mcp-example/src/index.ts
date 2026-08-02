#!/usr/bin/env bun
/**
 * MCP example — stdio tools: ping, whoami only.
 *
 * Registration is **only** via @gosilex/mcp createToolCatalogue + registerAll.
 *
 * whoami verifies Bearer sk_ via GET {API_BASE_URL}/api/me (see @gosilex/mcp).
 *
 * Env:
 * - AUTHORIZATION=sk_… or API_KEY=sk_…  (machine key)
 * - API_BASE_URL=http://127.0.0.1:8787  (kit API origin; required for verified:true)
 * - MCP_ALLOWED_HOSTS=localhost,127.0.0.1  (optional override, comma-separated)
 */
import {
  createToolCatalogue,
  extractBearerFromEnv,
  handlePing,
  handleWhoami,
  pingResultSchema,
  type ToolDef,
  whoamiResultSchema,
} from '@gosilex/mcp'
import { FastMCP } from 'fastmcp'
import { z } from 'zod'

function whoamiOptsFromEnv() {
  const hosts = process.env.MCP_ALLOWED_HOSTS?.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return {
    apiBaseUrl: process.env.API_BASE_URL ?? null,
    allowedHosts: hosts && hosts.length > 0 ? hosts : undefined,
  }
}

const emptyInput = z.object({})

const pingTool: ToolDef = {
  name: 'ping',
  description: 'Health check',
  input: emptyInput,
  output: pingResultSchema,
  effect: 'read',
  auth: 'none',
  execute: async () => handlePing(),
}

const whoamiTool: ToolDef = {
  name: 'whoami',
  description: 'Verify API key via GET /api/me (set API_BASE_URL + AUTHORIZATION/API_KEY)',
  input: emptyInput,
  output: whoamiResultSchema,
  effect: 'read',
  auth: 'api_key',
  execute: async () => {
    const key = extractBearerFromEnv(process.env as Record<string, string | undefined>)
    return handleWhoami(key, whoamiOptsFromEnv())
  },
}

/** App catalogue SSoT — smoke imports names from here (not orphan hardcode). */
export const catalogue = createToolCatalogue([pingTool, whoamiTool])

/** Live export for smoke + tests — same array as catalogue.names. */
export const REGISTERED_TOOL_NAMES = catalogue.names

const server = new FastMCP({
  name: 'gosilex-mcp-example',
  version: '0.0.1',
})

// Sole registration path — no ad-hoc server.addTool outside registerAll.
catalogue.registerAll(server)

// stdio when run as CLI
if (import.meta.main) {
  server.start({ transportType: 'stdio' })
}

export { server }
