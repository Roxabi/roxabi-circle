---
title: MCP agent contracts — ToolRegistrar · Zod · probes · wire SSOT
issue: 68
status: approved
tier: F-lite
date: 2026-08-02
---

## Problem

Kit MCP is **example-grade**: `apps/mcp-example` owns a local `REGISTERED_TOOL_NAMES` loop into FastMCP `addTool`, and `@gosilex/mcp` only exposes allowlist assert + handlers (`ping` / `whoami`) plus fragmented constants (`MCP_TOOL_NAMES`, `WhoamiResult.status`). Product apps that fork the kit will copy-paste registration, Zod shapes, and status strings without a reusable SSoT.

Observable impact: tool names drift from allowlist, MCP results diverge from HTTP `/api/me` shapes, agents cannot rely on stable wire constants or public error codes, and CI only smokes the example path rather than a reusable contract harness.

**Why now:** orthogonal to B7 quality prod (#19 / Spark #120) and B6 patterns (#18 / Spark #119); plan SSoT already exists (`plans/008-mcp-agent-contracts.md`); baseline (`@gosilex/mcp` · `mcp-example` · `smoke:mcp`) is ready to promote **pattern → package API** without inventing a third MCP framework.

## Who

- **Primary:** GOSILEX product developers forking the kit (`apps/<product>-mcp`) who need a copyable registration + probe pattern
- **Secondary:** agents / MCP clients consuming kit tools (stable names, status enums, public error shapes); kit maintainers guarding extractibility and banlist

## Constraints

- **Runtime:** keep FastMCP (or existing SDK path) — no new MCP framework
- **Package rule A8:** grow `@gosilex/mcp` (+ types if justified); no empty `@gosilex/agent` package
- **Kit purity:** 0 product-domain strings in `packages/mcp` | `packages/types` (banlist)
- **Auth:** machine path remains Bearer `sk_…` only (no cookies on MCP); whoami still verifies via API `/api/me`
- **Gates:** `validate:full` must stay green (smoke:mcp + units + banlist)
- **Orthogonal:** do not merge into #19 B7 or #18 B6
- **Inspiration only:** semctx ToolRegistrar / roxabi-contracts patterns — not full MCP Apps / dual plugin bundles

## Out of Scope

- Product tools (share, zip, publish, …)
- New MCP server framework
- OAuth interactive MCP multi-tenant public
- HTTP streamable transport as required DoD (stdio first remains)
- Empty `@gosilex/agent` package zoo
- Agent-facing string lint as security bar
- Replacing dual-auth Vitest with MCP probes (auth SoT stays API tests)

## Premise Validity

**Success in 6 months:** Product `apps/<x>-mcp` clones register N tools via kit ToolRegistrar/catalogue; public Zod shapes parse shared kit demo results; CI contract probes (registry + stdio smoke + schema) fail on catalogue/runtime drift; wire constants (env keys, Bearer header, tool names source, whoami status enum, agent-safe error codes) are imported from one module — no ad-hoc status strings.

**Failure in 6 months:** Three or more product MCP apps re-implement allowlist + addTool loops with divergent whoami status strings and no shared Zod; `smoke:mcp` still only greenlights the example while product tools ship unprobed name/schema drift.

**Simplest alternative:** Document the current example pattern in README only (no registrar API, no public Zod, no new probes).
**Why not simplest:** Docs do not fail CI when registration drifts; products will still invent ad-hoc schemas and status enums. Package API + probes are the enforcement surface.

## Complexity

**Tier: F-lite** — clear scope, single domain (MCP agent contracts), plan 008 already sketches design; no multi-domain architecture unknowns requiring full analyze.

Signals observed:

- Single domain: `@gosilex/mcp` + `apps/mcp-example` + docs/testing CP-MCP
- Clear DoD from GH #68 / Spark #132 / plans/008
- No size label; session `/dev` + auto signals → F-lite
- Analyze skipped (F-lite)
- Not S: multi-file package surface + probes + docs exceeds ≤3 files
- Not F-full: no new runtime, no multi-tenant OAuth, no product domain tools
