# `@kit/mcp-example`

Kit dogfood MCP: **ping** / **whoami** only. One app, two transports.

## Stdio (CI smoke)

```bash
bun run smoke:mcp
```

`CP-MCP-SMOKE` — JSON-RPC list + ping + whoami schema. Does **not** prove HTTP or OAuth. Stdio `whoami` still uses `sk_` → `GET /api/me`.

## Hosted Streamable HTTP + Worker MCP OAuth

The authorization server is `createHostedMcpWorker` from `@kit/mcp/hosted`. This app registers ping / whoami and passes the dogfood consent exception. It does not own the provider wiring.

```bash
bun run --filter @kit/mcp-example dev:http
# wrangler dev --port 8788  → http://127.0.0.1:8788/mcp
```

Requires `example-api` on `http://127.0.0.1:8787` for Better Auth login / identity tickets.

Connect Claude Code (no `--header` JWT, no stdio proxy):

```bash
claude mcp add --transport http kit-mcp http://127.0.0.1:8788/mcp
```

Then `/mcp` in the agent. The stored token is **Worker-issued**. Do not paste a JWT.

Probe: `apps/mcp-example/src/http-oauth.test.ts` (**CP-MCP-HTTP-OAUTH**), run via package `test`. Shell consent and fallthrough: `packages/mcp` hosted tests. Not folded into `smoke:mcp`.

Do **not** put Cloudflare Access in front of `/mcp`.
