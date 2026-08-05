---
title: "MCP agent contracts — ToolRegistrar · Zod · probes · wire SSOT"
issue: 68
status: approved
tier: F-lite
date: 2026-08-02
spark: 132
frame: artifacts/frames/68-mcp-agent-contracts-frame.md
plan_ssot: plans/008-mcp-agent-contracts.md
expert_review: "architect+doc-writer+product-lead+adversarial 2026-08-02 — dual-channel whoami vs tool errors; budget pre-handler; assertExact vs runtime list; single name SSOT for smoke; CP-MCP Proves/Does-not; effect≠authz unit; registerAll error wrap"
---

## Context

- **Source:** approved frame `artifacts/frames/68-mcp-agent-contracts-frame.md` (analyze skipped, F-lite)
- **SSoT plan:** `plans/008-mcp-agent-contracts.md` (design sketch, AC1–AC10, sequencing S1–S4)
- **Baseline:** `@gosilex/mcp` · `apps/mcp-example` · `smoke:mcp` in `validate:full` · existing `CP-MCP` row in `docs/testing.md`
- **Orthogonal:** #19 B7 quality · #18 B6 patterns · #69 import boundary — do not merge epics
- **Spark:** #132
- **Defaults from plan open decisions:** schemas mcp-owned; catalogue + FastMCP duck-typed adapter (no `fastmcp` dep in package); no structuredContent dual unless free

## Intent

Kit MCP is example-grade: app-local allowlist + ad-hoc `addTool` loop, informal whoami body handling, fragmented constants. Product forks will copy-paste registration and invent status strings without a reusable catalogue, public Zod, or contract probes that fail on catalogue/runtime drift.

**Why now:** plan 008 is written; baseline smoke is green; orthogonal to B7/B6 so we can ship a clean kit surface before product MCP tools (frame M5).

## Goal

Ship a **copyable MCP agent-contract surface** in `@gosilex/mcp` (ToolCatalogue/Registrar, public Zod for kit demo tools, agent wire SSOT, honest CP-MCP-* probes) and migrate **mcp-example** so kit CI fails when example catalogue ≠ live tools/list or shapes drift.

**JTBD:** a product `apps/<x>-mcp` can copy the kit pattern (catalogue + wire + probes); kit demo tools use parse-compatible Zod for agent-stable outs — **not** dual-owned full API schema SSoT.

## Users

| Role | Need |
|------|------|
| Product eng (fork kit) | Copyable catalogue + registerAll pattern + probe honesty docs |
| Kit maintainer | Banlist clean; mcp-example proves package API; validate:full green |
| MCP / agent client | Stable tool names, whoami status enum, public tool error codes |
| CI / pre-push | smoke:mcp + units catch registry/schema/budget drift on **kit example** |

## Constraints

- Keep FastMCP as runtime in the app; package stays transport-agnostic (duck-type `addTool`)
- Machine MCP path: Bearer `sk_…` only (no cookies)
- A8: grow `@gosilex/mcp` (+ types only if justified later); no empty `@gosilex/agent`
- Banlist: 0 product-domain strings in `packages/mcp` | `packages/types`
- Orthogonal: do not merge into #19 / #18 / #69
- Goal is **kit example + package pattern**; product fleet CI adoption is out of this issue’s priced claim

## Expected Behavior

1. **Wire SSOT module** in `@gosilex/mcp` (e.g. `agentWire` / `mcpWire`) exports: env key names (`AUTHORIZATION`, `API_KEY`, `API_BASE_URL`, `MCP_ALLOWED_HOSTS`), Bearer header convention, whoami **status** enum values, public **tool error** codes, input-budget constants (depth 32, values 10_000, array 1_000, key 256). Optional `DEFAULT_EXAMPLE_TOOL_NAMES` for docs/tests only — **not** the smoke expected-set for the example app.
2. **Public Zod schemas** exported from `@gosilex/mcp`: `pingResultSchema`, `whoamiResultSchema`, `meResponseSchema`. `meResponseSchema` is a **parse subset** for whoami (`subject` non-empty string + optional fields if needed) — **not** full HTTP `/api/me` SSoT. Product domain schemas stay in apps.
3. **`handleWhoami`** parses `/api/me` JSON via `meResponseSchema` (safeParse); invalid body → `status: 'invalid_response'`. Success still requires non-empty `subject`. Never returns key material. Domain outcomes stay on **WhoamiResult.status** (tool call succeeds with JSON body).
4. **`handlePing`** return value is parseable by `pingResultSchema` (`{ ok: true }`). Kit demo tools set `output` schemas so the output path is dogfooded.
5. **ToolCatalogue / Registrar** in `@gosilex/mcp`: typed tool defs (`name`, `description`, `input` Zod, optional `output` Zod, optional `effect: 'read'|'write'`, optional `auth: 'none'|'api_key'`, `execute`). `createToolCatalogue(tools)` yields `names`, `get`, `assertExact(runtimeNames)`, `registerAll(server)` for duck-typed `{ addTool }`.
6. **`assertExact` semantics:** input `runtimeNames` MUST be the **live registered names** (FastMCP list / tools/list source), **never** a twin of `catalogue.names` only. Unit + smoke: plant extra `addTool` after registerAll → assert or smoke **fails**.
7. **Input budget (fail-closed):** at the start of the **wrapped execute** (pre-handler), reject oversize input with public code `INVALID_ARGUMENTS`. Accept FastMCP may already Zod-validate `parameters` before our wrap — budget is **pre-handler**, not a claim of “before all framework Zod”. Spy unit: over-budget → execute body not called.
8. **Output path:** on success, if `output` set → safeParse; fail → public `INTERNAL_ERROR` (no stack/path/secret). Tool text = deterministic JSON of the canonical value.
9. **Public tool error catalogue (infra channel):** agent-facing body exactly `{ code, message }` (v1: **omit** free-form `details` by default). Codes: `INVALID_ARGUMENTS` | `UNAUTHORIZED` | `BAD_CONFIG` | `UNREACHABLE` | `INTERNAL_ERROR`. Message from catalogue (≤ ~200 chars).
10. **Dual channel (normative):**
    | Channel | When | Shape |
    |---------|------|--------|
    | Whoami **result** | Domain outcomes (missing key, 401, bad_config, …) | `WhoamiResult.status` — tool **succeeds** with JSON body |
    | Public **tool error** | Infra: budget / input fail / output fail / unexpected throw | `{ code, message }` via MCP error path |
11. **`registerAll` wraps execute:** catch unexpected throws → map to catalogue `INTERNAL_ERROR` only; never surface `error.message`, Zod flatten, stacks, `sk_…`, or Authorization values. Unit injects throw containing `sk_` substring → agent text must not contain it.
12. **Effect / auth annotations:** descriptive only. `registerAll` / package execute path **MUST NOT** branch on `effect` or `auth` for authorization. Unit: tool with `auth: 'none'` still may run handler that checks keys; tool with `effect: 'write'` still executes without package-level write gate. Real auth remains handler + API.
13. **`apps/mcp-example` migration:** builds catalogue of `ping` + `whoami` only; registers **only** via `catalogue.registerAll(server)`. Prefer no bare `server.addTool` in app source (grep/convention); adversarial smoke plants post-register addTool and expects fail when runtime list checked.
14. **Name SSOT for smoke:** `smoke:mcp` expected tool set **imports from mcp-example catalogue.names** (or a single export built from the same `ToolDef[]`). Package demo names may exist for docs but must not be a second live expected set that can drift. Optional unit: if both package demo list and example catalogue exist, they must match for kit example.
15. **Smoke:** `bun run smoke:mcp` remains in `validate:full`; whoami body parseable by `whoamiResultSchema`; never contains `sk_` / raw Authorization.
16. **Units:** registrar drift vs **runtime** list; schema fail; budget reject → `INVALID_ARGUMENTS` + execute not called; public error wrap no secret leak; whoami status enum from wire SSOT; effect/auth non-branch.
17. **Docs:** package README “add a tool” copy-paste block via `createToolCatalogue` + `registerAll` (prefer ≤15 lines; DoD is presence of the block, not vanity line count). `docs/testing.md` expands CP-MCP-* with normative Proves / Does not prove (below). Effect non-authorizing stated in README **and** enforced by SC12 unit.
18. **Purity:** zero product-domain strings in `packages/mcp` / `packages/types`; banlist green.
19. **`bun run validate:full` green** after change (hygiene gate, not the priced invariant alone).

## Data Model & Consumers

Kit-contract domain — types and catalogues, not DB tables.

### Core types (illustrative — implement may refine names)

| Type | Owner | Fields / notes |
|------|-------|----------------|
| `ToolEffect` | `@gosilex/mcp` | `'read' \| 'write'` — **not** authz |
| `ToolDef` | `@gosilex/mcp` | name, description, input Zod, output? Zod, effect?, auth?, execute |
| `ToolContext` | `@gosilex/mcp` | env-derived key, opts; no secrets in logs |
| `ToolCatalogue` | `@gosilex/mcp` | names, get, assertExact(**runtime** names), registerAll |
| `WhoamiResult` | `@gosilex/mcp` | keyPresent, verified, subject, status (SSOT enum) |
| `AgentWire` / constants | `@gosilex/mcp` | env keys, headers, budgets, error codes, optional demo names |
| `PublicToolError` | `@gosilex/mcp` | `{ code, message }` only in v1 |
| Product ToolDef instances | **apps only** | never in packages without 2nd call site + ADR |

### Consumers

| Consumer | Facts consumed | When | Status |
|----------|----------------|------|--------|
| mcp-example | catalogue, wire, handlers | boot + stdio | this issue |
| product `*-mcp` | register pattern + Zod + wire | product repos | future (pattern only) |
| smoke:mcp / validate:full | **example catalogue.names**, ping/whoami shapes | pre-push + CI | this issue |
| agents / MCP clients | tool names, status enum, public errors | runtime | this issue |
| whoami parse | meResponseSchema subset | verify | this issue (not full API SSoT) |
| `@gosilex/types` ErrorCode | optional map from public tool codes | docs / later | optional; no third HTTP code set |

### Normative decisions (v1)

```text
schemas live in @gosilex/mcp (not types) for tool I/O
meResponseSchema = parse subset only (subject non-empty)
app catalogue.names IS the smoke expected-set for mcp-example
assertExact(runtimeNames) — runtime/list, not self-twin of catalogue.names
registerAll wraps execute: budget → handler → optional output Zod → catch→catalogue
effect/auth never authorize in package path
whoami domain outcomes ≠ public tool error channel
no fastmcp dependency in packages/mcp (duck-type addTool)
```

### CP-MCP honesty (normative draft for testing.md)

| CP | Proves | Does not prove |
|----|--------|----------------|
| **CP-MCP-REG** | tools/list (or runtime registered names) equals catalogue.names; planted extra tool fails assert/smoke | tool business correctness; product apps’ registration discipline |
| **CP-MCP-SMOKE** | stdio JSON-RPC list + ping + whoami path works; whoami body matches whoamiResultSchema; no sk_ in results | auth IDOR / org RBAC; cookie session; product tools |
| **CP-MCP-SCHEMA** | public Zod outs + public error codes stable on kit paths | full FE session; API as sole schema owner for all fields |
| **CP-MCP-BUDGET** | oversized input rejected before handler body; execute not called | full DoS resistance under attack; network-layer limits |

**Honesty:** never claim “verified” for presence-only key checks; whoami `verified: true` only after `/api/me` subject parse OK.

## Breadboard

### Package surface (P*)

| ID | Affordance | Handler / module | Data |
|----|------------|------------------|------|
| P1 | Wire SSOT exports | `agentWire` / `mcpWire` | env keys, budgets, status enum, error codes |
| P2 | Zod publics | schemas | ping / whoami / me subset |
| P3 | handlePing | existing + schema | pingResult |
| P4 | handleWhoami | parse me via Zod | WhoamiResult (domain channel) |
| P5 | createToolCatalogue | registrar | ToolDef[] → catalogue |
| P6 | input budget gate | wrapped execute pre-handler | INVALID_ARGUMENTS |
| P7 | public tool error + wrap | registerAll catch | { code, message } |
| P8 | registerAll(duck addTool) | thin adapter | only registration helper |

### App surface (A*)

| ID | Affordance | Handler | Data |
|----|------------|---------|------|
| A1 | define kit tools | mcp-example catalogue builder | ping, whoami defs |
| A2 | assertExact(runtime) | boot or probe against live list | fail on drift / planted extra |
| A3 | registerAll | only intended registration path | FastMCP server |
| A4 | stdio entry | existing | env → wire |

### Probes (S*)

| ID | Affordance | Entry | Asserts |
|----|------------|-------|---------|
| S1 | CP-MCP-REG | unit + smoke tools/list | names == catalogue; plant extra fails |
| S2 | CP-MCP-SMOKE | `smoke:mcp` | list+ping+whoami shape; no sk_ |
| S3 | CP-MCP-SCHEMA | unit | Zod outs + public errors |
| S4 | CP-MCP-BUDGET | unit | oversize → INVALID_ARGUMENTS; execute not called |

### Docs (D*)

| ID | Affordance | Entry | Content |
|----|------------|-------|---------|
| D1 | README add-tool pattern | packages/mcp README | createToolCatalogue + registerAll block |
| D2 | CP-MCP-* honesty | docs/testing.md | Proves / Does not prove table above |
| D3 | effect non-authz note | README | effect/auth descriptive only |

### Wiring

```text
env → extractBearerFromEnv (wire keys)
  → handleWhoami → meResponseSchema → WhoamiResult.status (domain channel)
app ToolDef[] → createToolCatalogue
  → registerAll (wrap: budget → execute → output Zod → catch→public error)
  → FastMCP
assertExact(runtime registered names)  // not catalogue.names twin
smoke expected names ← example catalogue.names only
```

## Slices

| # | Slice | Demo | Affordance IDs |
|---|-------|------|----------------|
| V1 | SSOT wire + public Zod + whoami/ping parse | unit: whoami invalid body → invalid_response; ping schema pass; wire enum import | P1–P4 |
| V2 | ToolCatalogue + gates in wrap + mcp-example migrate | boot/smoke green; registerAll-only path; plant extra tool fails runtime assert | P5–P8, A1–A4 |
| V3 | Probes only (REG/SMOKE/SCHEMA/BUDGET units + smoke SSOT) | units + smoke names from example catalogue | S1–S4 |
| V4 | Docs | README pattern + testing.md CP rows + effect note | D1–D3 |

**Preferred PR map:** V1 → PR-008-1 · V2 → PR-008-2 · V3 → PR-008-3 · V4 → PR-008-4. Single PR acceptable if diff stays reviewable.

## Success Criteria

- [ ] SC1: `mcp-example` registers tools via package `registerAll` (no intentional ad-hoc `addTool` registration loop left in app source)
- [ ] SC2: `assertExact` / equivalent fails when **runtime** registered names ≠ catalogue.names (unit and/or smoke plants extra tool)
- [ ] SC3: Public Zod for `ping` / `whoami` / `me` (parse subset) exported; whoami parse path uses schema
- [ ] SC4: `bun run smoke:mcp` remains in `validate:full`; expected tool set imported from **mcp-example catalogue.names** (not orphan hardcode / not package-only twin)
- [ ] SC5: Units cover: runtime name drift, schema fail, budget reject + execute not called, registerAll error wrap (inject `sk_` in throw → no leak in agent text), whoami status values from wire SSOT
- [ ] SC6: Zero product-domain strings in `packages/mcp` and `packages/types` (banlist green)
- [ ] SC7: `bun run validate:full` green (hygiene)
- [ ] SC8: README contains copy-paste block registering a tool via `createToolCatalogue` + `registerAll`
- [ ] SC9: README states effect/auth are non-authorizing descriptive hints
- [ ] SC10: `docs/testing.md` has CP-MCP-REG / SMOKE / SCHEMA / BUDGET with Proves / Does not prove matching the normative draft above
- [ ] SC11: Agent-facing **tool errors** use public catalogue codes only; whoami domain outcomes stay on `WhoamiResult.status` (separate channel)
- [ ] SC12: Unit proves package register/execute path does **not** authorize by `effect` or `auth` annotations
- [ ] SC13: Wire module is the single import for budget numbers + whoami status enum + public tool error codes (units import SSOT)

## Edge Cases

| Case | Handling |
|------|----------|
| Missing API_BASE_URL / host deny | whoami `status: bad_config` (domain channel) |
| Missing / bad sk_ | whoami `missing_key` / `unauthorized` (domain); never leak key |
| Oversize tool input | budget reject pre-handler → public `INVALID_ARGUMENTS` |
| Handler throws with secret substring | wrap → `INTERNAL_ERROR`; no secret in agent text |
| Output schema fail | public `INTERNAL_ERROR` |
| Extra tool after registerAll | runtime assertExact / smoke fails |
| Product schema temptation | banlist + A8; schemas stay app-owned |
| FastMCP validates parameters first | OK; our budget still pre-handler |
| Annotations look like authz | SC12 unit + docs; handlers/API remain SoT |

## Out of Scope

- Product tools (share, zip, …) and product fleet CI enforcement
- New MCP framework
- OAuth interactive MCP multi-tenant
- HTTP streamable as DoD (stdio first)
- Empty `@gosilex/agent` package
- Dual structuredContent unless free with FastMCP
- Full `/api/me` schema ownership in types
- Merging work into #19 B7 / #18 B6 / #69

## Verification

```bash
bun run --filter @gosilex/mcp test
bun run smoke:mcp
bun run validate:full
# adversarial: plant extra addTool after registerAll → assertExact/smoke fail
# adversarial: budget over limit → execute body not called
# adversarial: throw with sk_ in message → agent text has no sk_
```

## χ (clarifications)

none — plan 008 open decisions defaulted; expert dual-channel / runtime assert / smoke SSOT locked above.
