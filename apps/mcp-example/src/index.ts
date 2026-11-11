#!/usr/bin/env bun
/**
 * MCP example — stdio tools: ping, whoami only.
 *
 * Registration is **only** via @kit/mcp createToolCatalogue + registerAll.
 *
 * whoami verifies Bearer sk_ via GET {API_BASE_URL}/api/me (see @kit/mcp).
 *
 * Env:
 * - AUTHORIZATION=sk_… or API_KEY=sk_…  (machine key)
 * - API_BASE_URL=http://127.0.0.1:8787  (kit API origin; required for verified:true)
 * - MCP_ALLOWED_HOSTS=localhost,127.0.0.1  (optional; loopback only unless break-glass)
 * - MCP_ALLOW_NONLOCAL_HOSTS=1  (break-glass: allow non-loopback MCP_ALLOWED_HOSTS)
 */
import { extractBearerFromEnv, handleWhoami } from '@kit/mcp'
import { FastMCP } from 'fastmcp'
import { createExampleCatalogue } from './catalogue'

function whoamiOptsFromEnv() {
  const raw = process.env.MCP_ALLOWED_HOSTS
  const hosts =
    typeof raw === 'string'
      ? raw
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
      : undefined
  return {
    apiBaseUrl: process.env.API_BASE_URL ?? null,
    allowedHosts: hosts && hosts.length > 0 ? hosts : undefined,
    allowNonLocalHosts: process.env.MCP_ALLOW_NONLOCAL_HOSTS === '1',
  }
}

/** App catalogue SSoT — smoke imports names from here (not orphan hardcode). */
export const catalogue = createExampleCatalogue(async () => {
  const key = extractBearerFromEnv(process.env as Record<string, string | undefined>)
  return handleWhoami(key, whoamiOptsFromEnv())
})

/** Live export for smoke + tests — same array as catalogue.names. */
export const REGISTERED_TOOL_NAMES = catalogue.names

const server = new FastMCP({
  name: 'kit-mcp-example',
  version: '0.0.1',
})

// Sole registration path — no ad-hoc server.addTool outside registerAll.
catalogue.registerAll(server)

// stdio when run as CLI
if (import.meta.main) {
  server.start({ transportType: 'stdio' })
}

export { server }
