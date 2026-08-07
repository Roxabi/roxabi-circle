# #22 FastMCP inventory (pre → post)

| Path | Field / API | Today | Target |
|------|-------------|-------|--------|
| `apps/mcp-example/package.json` | `dependencies.fastmcp` | `^3.1.0` | `^4.12.6` |
| `bun.lock` | `fastmcp@…` | `3.35.0` | `4.x` only for consumer |
| `apps/mcp-example/src/index.ts` | `new FastMCP({ name, version })` | v3 | v4-compatible |
| `apps/mcp-example/src/index.ts` | `server.start({ transportType: 'stdio' })` | v3 | v4-compatible |
| `packages/mcp/src/catalogue.ts` | `ToolServer.addTool` + `parameters: tool.input` | duck-type | keep unless break |
| `apps/mcp-example/scripts/stdio-smoke.mjs` | tools/list + ping + whoami | works on 3.x | adjust only if break |
| Dependabot #7 | PR | OPEN → 4.12.2 | **do not merge**; close before dedicated merge |

**npm latest at plan/implement:** `4.12.6`

## D2 evidence (post-install)

- `apps/mcp-example/package.json`: `"fastmcp": "^4.12.6"`
- `bun.lock`: `fastmcp@4.12.6` only — **no** `fastmcp@3.`
- Commands: `grep '"fastmcp"' apps/mcp-example/package.json` · `! grep -E 'fastmcp@3\.' bun.lock`

## Adapter notes (T4)

**No adapter code changes required.** Typecheck + package tests + `smoke:mcp` green on bump-only.

- Tools still `ping` / `whoami` only; registration via `catalogue.registerAll`
- `@kit/mcp` still has no hard `fastmcp` dependency
- No `packages/*` zod range changes

## Residuals (documented non-claims)

- Kit packages pin `zod` ^3.25; FastMCP 4 pulls `zod` ^4 transitively (dual graph) — monorepo Zod wave = #23
- Smoke exercises empty-input tools + registration/list/call — not a full non-empty schema matrix

## PR body material (T6)

**Title:** `chore(deps): wave4 fastmcp 3→4 (#22)`

**Body bullets:**
- Pin `apps/mcp-example` `fastmcp` `^3.1.0` → `^4.12.6` (lock 3.35.0 → 4.12.6)
- Single-major assert: no `fastmcp@3.` in lock for consumer
- No adapter source changes (constructor / `addTool` / stdio smoke unchanged)
- Gates: `@kit/mcp` + `mcp-example` typecheck/test, `smoke:mcp`, `validate:full` green
- **Do not merge Dependabot #7** — close/supersede #7 before this PR merges
- Residuals: dual Zod 3/4 graph (kit vs transitive); empty-input smoke non-claim
- Closes #22

**#7 status at implement:** OPEN (`dependabot/npm_and_yarn/fastmcp-4.12.1`, title targets 4.12.2)
