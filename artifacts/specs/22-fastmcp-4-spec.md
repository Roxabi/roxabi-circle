---
title: "chore(deps): wave 4 — fastmcp 4"
description: "Bump FastMCP 3→4 on mcp-example; adapt catalogue wiring if needed; green smoke:mcp + mcp tests."
type: spec
status: approved
issue: 22
tier: F-lite
---

## Context

**Promoted from:** [frame #22 fastmcp 4](../frames/22-fastmcp-4-frame.md) (F-lite — analyze skipped)
**GitHub issue:** #22
**Related:** Dependabot PR #7 (`fastmcp` 3.35.0 → 4.12.2, open); waves #19–#21 closed; blocks #23 (Zod monorepo) unless a documented peer force appears

## Intent

Keep the kit MCP dogfood on a supported FastMCP major. `apps/mcp-example` still depends on **`fastmcp` ^3.1.0** (lock **3.35.0**) while upstream is **4.x** (npm latest **4.12.6**; Dependabot #7 targets **4.12.2**). A major can break constructor / `addTool` / stdio `start` contracts; merging Dependabot alone does not prove `smoke:mcp`. Wave 4 owns the bump + any adapter fix so catalogue registration and stdio smoke stay green before Zod wave 5a.

## Goal

`apps/mcp-example` resolves **FastMCP 4.x** (concrete range at implement, prefer ≥ Dependabot target); after clean install, `bun run smoke:mcp` and package tests for `@kit/mcp` + `@kit/mcp-example` exit 0; dedicated PR closes #22 and supersedes Dependabot #7.

## Users

- **Kit maintainers** landing deps waves and running local/CI gates (`validate:full` includes `smoke:mcp`)
- **Product MCP apps** that copy `createToolCatalogue` + `registerAll` → FastMCP registration

## Expected Behavior

1. Inventory FastMCP touchpoints: `apps/mcp-example/package.json` dependency; `apps/mcp-example/src/index.ts` (`new FastMCP`, `start({ transportType: 'stdio' })`); `packages/mcp` duck-typed `ToolServer` / `registerAll` → `server.addTool({ name, description, parameters, execute })` (no `fastmcp` package dep today — keep unless peer/docs force is written down).
2. Bump `apps/mcp-example` `dependencies.fastmcp` to a concrete **4.x** range (e.g. `^4.12.6` or Dependabot-aligned `^4.12.2+`); regenerate lock via **one** `bun install`.
3. Fix compile/runtime breaks only as required:
   - Constructor options (`name` / `version`)
   - `addTool` argument shape vs `ToolServer` duck-type
   - `server.start({ transportType: 'stdio' })` or equivalent 4.x API
   - Any stdio JSON-RPC handshake change that breaks `scripts/stdio-smoke.mjs`
4. **Do not** widen scope to monorepo Zod 4 (#23). Note: FastMCP 3.35 already pulls `zod` ^4 transitively in the lockfile; kit packages still pin `zod` ^3.25 — **known residual dual-graph**. Peer-force escape (if typecheck/smoke hard-fail): only a **minimal pin/override under `apps/mcp-example`** + PR note. Changing monorepo / `packages/*` `zod` ranges = **hard fail → #23**, not this PR.
5. Keep example tools **only** `ping` + `whoami`; registration **only** via `catalogue.registerAll(server)` (no ad-hoc `addTool` outside catalogue). No product MCP paths.
6. Gates after clean install (ship DoD — **all required**, not optional subset):
   - `bun run --filter @kit/mcp typecheck` and `bun run --filter @kit/mcp-example typecheck`
   - `bun run --filter @kit/mcp test`
   - `bun run --filter @kit/mcp-example test` (includes vitest + stdio smoke)
   - `bun run smoke:mcp` (root alias → `mcp-example` `smoke:stdio`)
   - Before push: `bun run validate:full` (local primary gate; includes smoke:mcp)
7. Machine assert after install (D2): lockfile has **no** `fastmcp@3.` resolution for the consumer path; `apps/mcp-example` range is `^4.…`. Concrete check at implement, e.g. `rg 'fastmcp@3\\.' bun.lock` empty for the workspace graph after install + package.json range is 4.x.
8. Dedicated PR against base (`main`) closes #22. Title shape: `chore(deps): wave4 fastmcp4…`. **Do not merge Dependabot #7** as the ship unit. Close/supersede **#7 before merge** of the dedicated PR (no parallel merge-on-green race).

## Data Model & Consumers

### Data Structure

No application data model. Dependency + registration surface only:

| Package / path | Field / API | Today | Target |
|----------------|-------------|-------|--------|
| `@kit/mcp-example` | `dependencies.fastmcp` | `^3.1.0` (lock 3.35.0) | concrete `^4.N.M` |
| lockfile | `fastmcp@…` | 3.35.0 | 4.x only for mcp-example |
| `apps/mcp-example/src/index.ts` | `new FastMCP({ name, version })` | v3 API | v4-compatible |
| `apps/mcp-example/src/index.ts` | `server.start({ transportType: 'stdio' })` | v3 | v4-compatible |
| `@kit/mcp` `ToolServer` | `addTool(tool: any)` | duck-type | still assignable to FastMCP 4 |
| `@kit/mcp` `registerAll` | `parameters: tool.input` (Zod) | works on 3.x | adjust only if 4.x expects different param schema API |
| `@kit/mcp` package.json | no `fastmcp` dep | intentional | keep unless documented peer force |

### Consumers

| Consumer | Consumes | When | Status |
|----------|----------|------|--------|
| `mcp-example` | FastMCP runtime + `@kit/mcp` catalogue | smoke:stdio / test | This issue |
| `@kit/mcp` unit tests | catalogue fakes (no real FastMCP) | `bun run test` | This issue (regression) |
| root `validate:full` | `smoke:mcp` | pre-push + CI | This issue |
| Product MCP apps | registration pattern | after merge | Future |

## Breadboard

### Dep axis

| ID | Element | Handler | Data |
|----|---------|---------|------|
| D1 | `apps/mcp-example/package.json` `fastmcp` | edit + `bun install` | lockfile FastMCP 4 |
| D2 | Single-major assert (no 3.x) | lockfile grep + package range | no `fastmcp@3.` for consumer; range `^4` |

### Adapter axis

| ID | Element | Handler | Data |
|----|---------|---------|------|
| A1 | `apps/mcp-example/src/index.ts` FastMCP construct + start | edit if API break | compiles + starts stdio |
| A2 | `packages/mcp` `ToolServer` / `registerAll` addTool payload | edit if FastMCP 4 rejects shape | duck-type still works |
| A3 | `apps/mcp-example/scripts/stdio-smoke.mjs` | edit only if protocol/handshake break | list tools + ping + whoami |

### Ship axis

| ID | Element | Handler | Data |
|----|---------|---------|------|
| S1 | `@kit/mcp` + `mcp-example` typecheck | monorepo filter | exit 0 |
| S2 | `@kit/mcp` + `mcp-example` test | monorepo filter | exit 0 |
| S3 | `bun run smoke:mcp` | root script | exit 0 |
| S4 | Dependabot PR #7 | close/supersede before merge | GH |
| S5 | Dedicated PR for #22 | open against base | GH |

### Wiring

```
D1 → one bun install → D2 assert
  → A1/A2/A3 only if break
  → S1+S2+S3 green → dedicated PR (S5) → S4 close #7 before merge
```

## Slices

**Ship rule:** slices are **commit/logic gates**, not separately mergeable PRs. **Mergeable only when S1+S2+S3 are green** and process S4/S5 complete. Slice 1 alone (version bump without smoke) is **not** a ship unit (rejects Dependabot-only merge).

| # | Name | Scope (IDs) | Demo criteria |
|---|------|-------------|---------------|
| 1 | Manifest + lock | D1, D2 | `fastmcp` ^4.x in mcp-example; D2 single-major assert passes — **not mergeable alone** |
| 2 | Adapter (if needed) + green gates | A1?, A2?, A3?, S1, S2, S3 | typecheck + package tests + smoke:mcp green after clean install — **required for ship** |
| 3 | Ship process | S4, S5 | Dedicated PR for #22; **do not merge #7**; #7 closed/superseded **before** dedicated merge |

## Success Criteria

- [ ] `apps/mcp-example` declares `fastmcp` at a concrete **4.x** range (not 3.x)
- [ ] D2: no `fastmcp@3.` left for the mcp-example consumer after clean install (concrete lockfile assert)
- [ ] `@kit/mcp` remains without a hard `fastmcp` dependency **or** a peer pin is documented in the PR body with reason
- [ ] Example tools remain exactly `ping` and `whoami`; registration only via `catalogue.registerAll`; no product MCP path edits
- [ ] `bun run --filter @kit/mcp typecheck` exits 0
- [ ] `bun run --filter @kit/mcp-example typecheck` exits 0
- [ ] `bun run --filter @kit/mcp test` exits 0
- [ ] `bun run --filter @kit/mcp-example test` exits 0
- [ ] `bun run smoke:mcp` exits 0 (required ship control — not optional)
- [ ] `bun run validate:full` exits 0 before push (local primary gate)
- [ ] Dedicated PR for #22 is opened against base with wave4 title shape
- [ ] Dependabot #7 is **not** merged as ship unit; closed/superseded **before** dedicated PR merges
- [ ] No monorepo / `packages/*` `zod` range change in this PR; peer force if any is **only** under `apps/mcp-example` + PR note (full Zod wave = #23)
- [ ] Known residual documented in PR if still true: kit Zod 3 vs FastMCP transitive Zod 4; smoke proves empty-input tools + registration, not full schema matrix

## Edge Cases

| Case | Handling |
|------|----------|
| FastMCP 4 changes `addTool` param schema field name | Update `registerAll` payload and/or ToolServer type; keep duck-type |
| FastMCP 4 requires Zod 4 types at the boundary while kit is on Zod 3 | Prefer minimal adapter coercion; document peer force if unavoidable; do not full-migrate monorepo |
| Smoke timeout / handshake change | Adjust `stdio-smoke.mjs` only; keep tools/list + ping + whoami coverage |
| Dependabot #7 merges first | Rebase wave branch; still land adapter+proof PR if #7 was version-only; prefer close #7 early once wave PR supersedes |
| `@kit/mcp` tests use fakes only | Still run them — regression on catalogue; real FastMCP contract is proven by **smoke:mcp**, not unit fakes alone |
| Empty-input tools only (`z.object({})`) | Accept residual: smoke proves registration + tools/list + ping/whoami execute; non-empty schema product tools are product follow-up, not this wave |
| Dual Zod 3 (kit) / 4 (fastmcp transitive) | Accept residual unless hard fail; monorepo fix = #23 |

## χ

none after expert pass (API details deferred to implement against installed FastMCP 4 types; residuals dual-Zod + empty-input are **documented non-claims**, not blockers)
