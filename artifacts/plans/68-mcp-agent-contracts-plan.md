---
title: "Plan: MCP agent contracts — ToolRegistrar · Zod · probes · wire SSOT"
issue: 68
spec: artifacts/specs/68-mcp-agent-contracts-spec.md
complexity: 5/10
tier: F-lite
generated: 2026-08-02
status: approved
plan_ssot: plans/008-mcp-agent-contracts.md
---

## Summary

Promote kit MCP from example-grade allowlist loop to package **ToolCatalogue** + **wire SSOT** + **public Zod** + **registerAll execute wrap** (budget, public errors, no secret leak), migrate `mcp-example`, fix smoke expected names to **example catalogue.names**, and document honest **CP-MCP-*** rows. Single preferred PR (or PR-008-1…4 if split); slices V1→V4.

## Architecture

**Data flow:** [MCP agent contracts data flow](../visuals/68-mcp-agent-contracts-data-flow.html)  
**File map:** [Files × functions](../visuals/68-mcp-agent-contracts-file-map.html)

## Bootstrap Context

- Worktree: `~/.grok/worktrees/gosilex-silex-boilerplate/68-mcp-agent-contracts`
- Branch: `feat/68-mcp-agent-contracts` (principal stays on `main`)
- Frame + spec approved on branch; SSoT `plans/008-mcp-agent-contracts.md`
- Baseline: `packages/mcp/src/index.ts` (`assertToolsMatchAllowlist`, `handlePing`, `handleWhoami`, `MCP_TOOL_NAMES`, `extractBearerFromEnv`); `apps/mcp-example` REGISTERED loop + `stdio-smoke.mjs`; `smoke:mcp` already in `validate:full`
- Patterns: keep duck-typed `registerAll({ addTool })` — **no** `fastmcp` dep in `@gosilex/mcp`; add `zod` to package deps aligned with monorepo
- Dual channel: WhoamiResult.status (domain) ≠ PublicToolError codes (infra)
- assertExact(runtime registered names) — never self-twin of catalogue.names
- Effect/auth annotations never authorize in package path
- Prefer split modules if `index.ts` approaches god-file / file-length gate

## Agents

| Agent | Instance | Tasks | Files |
|-------|----------|-------|-------|
| backend-dev | backend-dev-A | T1–T2 | packages/mcp wire + schemas + handlers |
| backend-dev | backend-dev-B | T3–T4 | catalogue + wrap; mcp-example migrate |
| tester | tester-A | T5–T6 | package units + smoke SSOT |
| doc-writer | doc-writer-A | T7 | README + testing.md |
| tester | tester-B | T8 | RED-GATE validate |

## Wave Structure

5 waves, max 1 parallel agent (sequential deps; small surface). Elapsed ~1 session.

| Wave | Trigger | Agents | Tasks |
|------|---------|--------|-------|
| 1 | start | backend-dev-A | T1 → T2 |
| 2 | Wave 1 done | backend-dev-B | T3 → T4 |
| 3 | Wave 2 done | tester-A | T5 → T6 |
| 4 | Wave 3 done | doc-writer-A | T7 |
| 5 | Wave 4 done | tester-B | T8 (RED-GATE) |

### Budget — per task

| Task | Items | Class | Est. ops | Split? |
|------|-------|-------|----------|--------|
| T1 | agentWire + schemas | judgmental | 8 | — |
| T2 | handlers parse + barrel | judgmental | 8 | — |
| T3 | catalogue + budget + errors + registerAll | judgmental | 12 | — |
| T4 | mcp-example migrate | bounded | 6 | — |
| T5 | package units (drift, budget, leak, effect) | judgmental | 10 | — |
| T6 | smoke SSOT + whoami shape | bounded | 5 | — |
| T7 | README + CP-MCP docs | bounded | 4 | — |
| T8 | RED-GATE | bounded | 4 | — |

**Total estimated ops: ~57** (sequential; no single task >50)

### Budget — per agent instance

| Instance | Tasks | Σ ops | Subjects | Split? |
|----------|-------|-------|----------|--------|
| backend-dev-A | T1–T2 | 16 | wire, handlers | — |
| backend-dev-B | T3–T4 | 18 | catalogue, example | — |
| tester-A | T5–T6 | 15 | units, smoke | — |
| doc-writer-A | T7 | 4 | docs | — |
| tester-B | T8 | 4 | verify | — |

## Consistency Report

| | |
|--|--|
| Covered SC | SC1–SC13 via T1–T8 |
| Uncovered | product fleet CI (explicit OOS) |
| Untraced tasks | none |
| Exemptions | SC7 hygiene only; docs SC8–10 via T7 |

## Micro-Tasks

### Slice V1 — Wire SSOT + Zod + parse

#### T1 — agentWire + public Zod schemas

| Field | Value |
|-------|-------|
| Description | Create `packages/mcp/src/agentWire.ts` (or `mcpWire.ts`) exporting: env key name constants (`AUTHORIZATION`, `API_KEY`, `API_BASE_URL`, `MCP_ALLOWED_HOSTS`), Bearer convention note, whoami **status** enum values as const, public **tool error** codes as const, input-budget numbers (depth 32, values 10_000, array 1_000, key 256). Optional `DEFAULT_EXAMPLE_TOOL_NAMES` for docs only. Create `packages/mcp/src/schemas.ts` with `pingResultSchema`, `whoamiResultSchema`, `meResponseSchema` (parse subset: non-empty `subject` string; optional extra fields only if needed). Add `zod` dependency to `packages/mcp/package.json` (workspace-aligned version). Do not put product domain strings. |
| File path | `packages/mcp/src/agentWire.ts`, `packages/mcp/src/schemas.ts`, `packages/mcp/package.json` |
| Code snippet | `export const WHOAMI_STATUS = ['ok','missing_key',…] as const` · `export const pingResultSchema = z.object({ ok: z.literal(true) })` |
| Verify | `bun run --filter @gosilex/mcp typecheck` |
| Expected | typecheck exit 0; files export symbols |
| Time | 15 min |
| `[P]` | N |
| Agent | backend-dev |
| Agent instance | backend-dev-A |
| Subject | wire |
| Spec trace | SC3 · SC11 · SC13 · P1–P2 · EB1–2 |
| Slice | V1 |
| Phase | GREEN |
| Difficulty | 3 |

#### T2 — handlers use schemas + barrel exports

| Field | Value |
|-------|-------|
| Description | Update `handleWhoami` to parse `/api/me` body via `meResponseSchema.safeParse` → `invalid_response` on fail; keep domain statuses on WhoamiResult. Ensure `handlePing` return matches `pingResultSchema`. Keep no key material in results. Re-export wire + schemas from `packages/mcp/src/index.ts` (or subpath exports if preferred). Preserve `assertToolsMatchAllowlist` / deprecated aliases. Split modules if index grows past file-length comfort. |
| File path | `packages/mcp/src/index.ts` (+ handlers if split) |
| Code snippet | `const parsed = meResponseSchema.safeParse(body); if (!parsed.success) return { … status: 'invalid_response' }` |
| Verify | `bun run --filter @gosilex/mcp test` |
| Expected | existing whoami/ping units still green; typecheck green |
| Time | 15 min |
| `[P]` | N (after T1) |
| Agent | backend-dev |
| Agent instance | backend-dev-A |
| Subject | handlers |
| Spec trace | SC3 · SC11 · P3–P4 · EB3–4 |
| Slice | V1 |
| Phase | GREEN |
| Difficulty | 3 |

### Slice V2 — Catalogue + wrap + mcp-example migrate

#### T3 — ToolCatalogue + budget + public errors + registerAll

| Field | Value |
|-------|-------|
| Description | Implement `createToolCatalogue(tools)` with `names`, `get`, `assertExact(runtimeNames)` (order-insensitive; **runtimeNames must not be required to equal a self-copy of the same array used only as catalogue input — document that callers pass live list**), and `registerAll(server: { addTool: … })` duck-typed. Inside registerAll wrap: (1) budget gate pre-handler using wire constants → public `INVALID_ARGUMENTS`; (2) call execute; (3) optional output Zod → `INTERNAL_ERROR` on fail; (4) catch throws → map to public catalogue only (no raw message, no sk_ leak). Map `input` Zod to FastMCP `parameters` field at addTool boundary. **Do not** branch on `effect`/`auth` for authorization. Export public error helper `{ code, message }` only (no free-form details v1). Unit-testable pure functions for budget + error map. |
| File path | `packages/mcp/src/catalogue.ts`, `packages/mcp/src/budget.ts`, `packages/mcp/src/publicErrors.ts` (names flexible) |
| Code snippet | `registerAll(server){ for (const t of tools) server.addTool({ name, description, parameters: t.input, execute: wrapped }) }` |
| Verify | `bun run --filter @gosilex/mcp typecheck` |
| Expected | catalogue exports compile; no fastmcp import in package |
| Time | 25 min |
| `[P]` | N (after T2) |
| Agent | backend-dev |
| Agent instance | backend-dev-B |
| Subject | catalogue |
| Spec trace | SC2 · SC5 · SC11–SC13 · P5–P8 · EB5–12 |
| Slice | V2 |
| Phase | GREEN |
| Difficulty | 5 |

#### T4 — mcp-example migrate to catalogue

| Field | Value |
|-------|-------|
| Description | Replace ad-hoc `for … addTool` in `apps/mcp-example/src/index.ts` with ToolDef[] for ping/whoami (wire handlers + output schemas), `createToolCatalogue`, `registerAll(server)`. Export `catalogue.names` (or `REGISTERED_TOOL_NAMES` derived from catalogue) as the single expected-set source for smoke. Prefer no bare `server.addTool` in app source. Boot may document assertExact against runtime when available; smoke remains the hard list parity check. Keep env whoami opts. |
| File path | `apps/mcp-example/src/index.ts`, optionally `apps/mcp-example/src/tools.ts` |
| Code snippet | `const catalogue = createToolCatalogue([pingDef, whoamiDef]); catalogue.registerAll(server); export const REGISTERED_TOOL_NAMES = catalogue.names` |
| Verify | `bun run --filter @gosilex/mcp-example typecheck` |
| Expected | typecheck 0; no orphan for-loop addTool for registration |
| Time | 15 min |
| `[P]` | N (after T3) |
| Agent | backend-dev |
| Agent instance | backend-dev-B |
| Subject | example |
| Spec trace | SC1 · SC4 · A1–A4 · EB13–14 |
| Slice | V2 |
| Phase | GREEN |
| Difficulty | 3 |

### Slice V3 — Probes

#### T5 — package units (adversarial + contract)

| Field | Value |
|-------|-------|
| Description | Extend `packages/mcp` Vitest: (a) assertExact fails when runtime names ≠ catalogue.names (plant extra name); (b) budget over depth/array → INVALID_ARGUMENTS and execute body not called (spy); (c) registerAll wrap: execute throws Error containing `sk_…` → agent-facing text/code has no `sk_`; (d) whoami status values imported from wire SSOT; (e) effect/auth: register path does not refuse execute based on annotations (SC12); (f) schema parse invalid me body → invalid_response. Keep banlist clean. |
| File path | `packages/mcp/src/*.test.ts` |
| Code snippet | `vi.fn` execute spy; fake server capturing addTool handlers |
| Verify | `bun run --filter @gosilex/mcp test` |
| Expected | all new cases green |
| Time | 20 min |
| `[P]` | N (after T3–T4) |
| Agent | tester |
| Agent instance | tester-A |
| Subject | units |
| Spec trace | SC2 · SC5 · SC11–SC13 · S1 · S3 · S4 · EB6–12 |
| Slice | V3 |
| Phase | GREEN |
| Difficulty | 4 |

#### T6 — smoke SSOT + whoami shape

| Field | Value |
|-------|-------|
| Description | Update `apps/mcp-example/scripts/stdio-smoke.mjs` so expected tools/list set comes from **example catalogue.names** (import from app entry export or shared fixture built from same ToolDef list — not orphan hardcode, not package-only twin that can drift). Assert whoami result JSON parses against kit whoami shape (or at least status enum + no sk_ in body). Keep smoke in package scripts / root `smoke:mcp`. |
| File path | `apps/mcp-example/scripts/stdio-smoke.mjs` |
| Code snippet | `import { REGISTERED_TOOL_NAMES } from '../src/index.ts'` (or equivalent Bun-compatible import) |
| Verify | `bun run smoke:mcp` |
| Expected | exit 0; list matches catalogue; whoami no sk_ |
| Time | 12 min |
| `[P]` | N (after T4) |
| Agent | tester |
| Agent instance | tester-A |
| Subject | smoke |
| Spec trace | SC4 · SC5 · S1–S2 · EB14–15 |
| Slice | V3 |
| Phase | GREEN |
| Difficulty | 3 |

### Slice V4 — Docs

#### T7 — README pattern + testing.md CP-MCP-*

| Field | Value |
|-------|-------|
| Description | Add/update `packages/mcp/README.md` with copy-paste block: define tools → `createToolCatalogue` → `registerAll` (+ note effect/auth non-authorizing). Expand `docs/testing.md`: replace/extend single CP-MCP row with **CP-MCP-REG / CP-MCP-SMOKE / CP-MCP-SCHEMA / CP-MCP-BUDGET** using normative Proves / Does not prove from approved spec. Mention honesty: verified only after /api/me subject parse. |
| File path | `packages/mcp/README.md`, `docs/testing.md` |
| Code snippet | markdown tables + fenced TS pattern |
| Verify | `grep -n 'CP-MCP-REG' docs/testing.md && grep -n 'createToolCatalogue' packages/mcp/README.md` |
| Expected | CP rows + README pattern present |
| Time | 12 min |
| `[P]` | N |
| Agent | doc-writer |
| Agent instance | doc-writer-A |
| Subject | docs |
| Spec trace | SC8–SC10 · D1–D3 |
| Slice | V4 |
| Phase | GREEN |
| Difficulty | 2 |

### RED-GATE

#### T8 — Full gate verify

| Field | Value |
|-------|-------|
| Description | Run `bun run --filter @gosilex/mcp test`, `bun run smoke:mcp`, and at minimum `bun run banlist` + typecheck on touched packages. Prefer `bun run validate:full` if time allows. Confirm no product domain strings in packages/mcp. Record pass evidence for SC1–SC13. |
| File path | — (verify only) |
| Code snippet | — |
| Verify | `bun run --filter @gosilex/mcp test && bun run smoke:mcp && bun run banlist` |
| Expected | all exit 0 |
| Time | 10 min |
| `[P]` | N |
| Agent | tester |
| Agent instance | tester-B |
| Subject | verify |
| Spec trace | SC1–SC13 |
| Slice | V1–V4 |
| Phase | RED-GATE |
| Difficulty | 2 |

## Task Seeding Blueprint

<!-- Used by /implement to seed TaskCreate / todo_write on session start.
     Format: T{n} | agent-instance | blockedBy | subject -->

### Wave 1 — no deps, backend-dev-A sequential

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T1 | backend-dev-A | — | wire |
| T2 | backend-dev-A | T1 | handlers |

### Wave 2 — after Wave 1

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T3 | backend-dev-B | T2 | catalogue |
| T4 | backend-dev-B | T3 | example |

### Wave 3 — after Wave 2

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T5 | tester-A | T3,T4 | units |
| T6 | tester-A | T4,T5 | smoke |

### Wave 4 — after Wave 3

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T7 | doc-writer-A | T3 | docs |

### Wave 5 — RED-GATE

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T8 | tester-B | T5,T6,T7 | verify |

## Ref Patterns

| Path | Why |
|------|-----|
| `packages/mcp/src/index.ts` | handlers, allowlist, whoami SSRF hosts |
| `apps/mcp-example/src/index.ts` | current registration loop to replace |
| `apps/mcp-example/scripts/stdio-smoke.mjs` | tools/list + call probes |
| `packages/mcp/src/index.test.ts` | vitest style |
| `docs/testing.md` CP-MCP / CP-IMPORT rows | honesty table format |
| `artifacts/specs/68-mcp-agent-contracts-spec.md` | dual-channel + SC1–13 |

## Open implement notes

1. FastMCP may Zod-validate `parameters` before our wrap — budget is **pre-handler**, not “before all framework Zod”.
2. Prefer exporting catalogue.names from app for smoke; if Bun import of TS from mjs is awkward, generate a tiny `registered-tool-names.json` at build/test time from the same source — still single SSoT.
3. Do not invent `@gosilex/agent` or product tools.

## Task IDs

<!-- Generated by /plan. Used by /implement to resume tasks on session restart.
     Host: grok-todos — ids match blueprint T{n}; no separate host UUID graph. -->
- T1: T1 — wire
- T2: T2 — handlers
- T3: T3 — catalogue
- T4: T4 — example
- T5: T5 — units
- T6: T6 — smoke
- T7: T7 — docs
- T8: T8 — verify
