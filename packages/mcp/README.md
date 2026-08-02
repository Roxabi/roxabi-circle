# `@gosilex/mcp`

Kit MCP conventions around FastMCP: **ToolCatalogue**, public Zod shapes, agent wire SSOT, and fail-closed execute wrap (input budget + public tool errors).

## Add a tool (product pattern)

```ts
import { createToolCatalogue, type ToolDef } from '@gosilex/mcp'
import { FastMCP } from 'fastmcp'
import { z } from 'zod'

const input = z.object({ q: z.string().optional() })
const myTool: ToolDef<typeof input> = {
  name: 'my_tool',
  description: 'Example kit-style tool',
  input,
  effect: 'read', // descriptive only — NOT authorization
  auth: 'none', // descriptive only — NOT authorization
  execute: async (args) => ({ ok: true, q: args.q ?? null }),
}

const catalogue = createToolCatalogue([myTool] as const)
const server = new FastMCP({ name: 'my-mcp', version: '0.0.1' })
catalogue.registerAll(server) // sole registration path
// smoke expected set: catalogue.names
```

## Effect / auth annotations

`effect` and `auth` on `ToolDef` are **descriptive hints for agents/docs only**.  
`registerAll` does **not** branch on them for authorization. Real auth remains in the handler and API (Bearer `sk_…`).

## Dual channels

| Channel | Shape | When |
|---------|--------|------|
| Domain (whoami) | `WhoamiResult.status` | missing key, 401, bad_config, … — tool **succeeds** with JSON |
| Infra (public tool error) | `{ code, message }` | budget / wrap / unexpected throw |

## Wire SSOT

Import budgets, env key names, whoami status enum, and public error codes from `@gosilex/mcp` (`agentWire` / barrel). Do not re-declare stringly constants in apps.

## Probes

See `docs/testing.md` **CP-MCP-REG / SMOKE / SCHEMA / BUDGET**.
