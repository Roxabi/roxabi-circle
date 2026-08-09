---
title: "Plan: feat(flows): D1 flow_plans/flow_runs + module catalogue flows"
issue: 29
spec: artifacts/specs/29-flows-d1-plans-runs-module-spec.md
complexity: 4/10
tier: F-lite
generated: 2026-08-07
status: approved
normative: false
---

## Summary

Apply org-scoped D1 tables `flow_plans` / `flow_runs` (integer ms timestamps, composite tenancy FK) via example-api migration, mirror in Drizzle, and register `flows` in `KIT_MODULE_IDS` using `FLOWS_MODULE_ID` with an explicit no-external-config set. No HTTP routes.

## Architecture

**Data flow:** [29 data flow](../visuals/29-flows-d1-plans-runs-module-data-flow.html)  
**File map:** [29 file map](../visuals/29-flows-d1-plans-runs-module-file-map.html)

## Bootstrap Context

- Sketch: `packages/flows/migrations/0001_flows_plans_runs.sql` (NOT applied)
- Pattern migration: `apps/example-api/migrations/0011_demo_items.sql` (integer ms)
- Pattern tables: `apps/example-api/src/db/schema.ts` (`demoItems`, `platformModules`)
- Module registry: `apps/example-api/src/lib/kit-modules.ts` + `integration-config.ts`
- Ensure path: `apps/example-api/src/services/platform-modules.ts`
- Constant: `packages/flows/src/constants.ts` → `FLOWS_MODULE_ID = 'flows'`
- Spec decision: **composite FK** `(plan_id, org_id) → flow_plans(id, org_id)` — tenancy residual closed at schema for plan↔run

## Agents

| Agent instance | Tasks | Files |
|----------------|-------|-------|
| backend-dev-A | T1, T2, T3 | migrations, sketch header, schema.ts |
| backend-dev-B | T4, T5 | kit-modules.ts, integration-config.ts |
| tester-A | T6, T7 | platform-modules tests, verify gates |

## Wave Structure

3 waves, max 2 parallel agents. Elapsed ~1 session vs sequential same PR.

| Wave | Trigger | Agents | Tasks |
|------|---------|--------|-------|
| 1 | start | 2 ∥ | backend-dev-A: T1 · backend-dev-B: T4 |
| 2 | Wave 1 done | 2 ∥ | backend-dev-A: T2→T3 · backend-dev-B: T5 |
| 3 | Wave 2 done | 1 | tester-A: T6→T7 |

### Budget — per task

| Task | Items | Class | Est. ops | Split? |
|------|-------|-------|----------|--------|
| T1 migration SQL | 1 file | bounded | 3 | — |
| T2 sketch header | 1 file | trivial | 2 | — |
| T3 Drizzle tables | 1 file | bounded | 3 | — |
| T4 KIT_MODULE_IDS | 1 file | bounded | 3 | — |
| T5 no-config set | 1 file | bounded | 3 | — |
| T6 unit tests | 1–2 files | judgmental | 5 | — |
| T7 RED-GATE | commands | bounded | 3 | — |

**Total estimated ops: ~22**

### Budget — per agent instance

| Instance | Tasks | Σ ops | Subjects | Split? |
|----------|-------|-------|----------|--------|
| backend-dev-A | T1–T3 | 8 | migrations, schema | — |
| backend-dev-B | T4–T5 | 6 | modules, config | — |
| tester-A | T6–T7 | 8 | tests | — |

## Consistency Report

| Metric | Value |
|--------|-------|
| Spec SC covered | 14/14 (via T1–T7) |
| Uncovered | — |
| Untraced tasks | — |
| Breadboard N1–N7 | all mapped |

## Micro-Tasks

### Slice V1 — Migration

#### T1 — GREEN · Create applied migration
- **File:** `apps/example-api/migrations/0012_flows_plans_runs.sql`
- **Agent:** backend-dev-A · **Subject:** migrations · **Slice:** V1
- **Spec trace:** SC-org_id, SC-timestamps-int, SC-unique-fk, SC-indexes, SC-composite-tenancy
- **Description:** Create tables from sketch shape with:
  - `org_id text NOT NULL` on both
  - `created_at`/`updated_at` **integer NOT NULL** (ms)
  - UNIQUE `(org_id, plan_key, version)` on plans
  - UNIQUE `(id, org_id)` on plans (for composite FK target)
  - FK `flow_runs(plan_id, org_id)` → `flow_plans(id, org_id)` (no CASCADE)
  - indexes: org on both, plan_id on runs
  - columns per spec (yaml_source, plan_json, plan_digest, workflow_instance_id nullable, etc.)
- **Verify:** `rg -n 'org_id|integer|flow_plans|flow_runs' apps/example-api/migrations/0012_flows_plans_runs.sql`
- **Expected:** NOT NULL org_id; integer timestamps; composite FK present
- **Time:** 5 min · **Difficulty:** 2 · **[P]** with T4

#### T2 — GREEN · Point sketch at applied SSoT
- **File:** `packages/flows/migrations/0001_flows_plans_runs.sql`
- **Agent:** backend-dev-A · **Subject:** migrations · **Slice:** V1
- **Spec trace:** SC-sketch-header
- **Description:** Update header: applied SSoT is `apps/example-api/migrations/0012_…`; sketch types may lag (text vs integer); still NOT applied by wrangler.
- **Deps:** T1
- **Verify:** `rg -n '0012|SSoT|OUT OF DATE|example-api' packages/flows/migrations/0001_flows_plans_runs.sql`
- **Time:** 2 min · **Difficulty:** 1

### Slice V2 — Drizzle

#### T3 — GREEN · Drizzle flowPlans / flowRuns
- **File:** `apps/example-api/src/db/schema.ts`
- **Agent:** backend-dev-A · **Subject:** schema · **Slice:** V2
- **Spec trace:** SC-drizzle
- **Description:** Add `flowPlans` and `flowRuns` tables matching SQL (integer mode number, boolean mode for enabled if used). Export both on `schema` object.
- **Deps:** T1
- **Verify:** `rg -n 'flowPlans|flowRuns|flow_plans|flow_runs' apps/example-api/src/db/schema.ts`
- **Time:** 5 min · **Difficulty:** 2

### Slice V3 — Module catalogue

#### T4 — GREEN · Register flows in KIT_MODULE_IDS
- **File:** `apps/example-api/src/lib/kit-modules.ts`
- **Agent:** backend-dev-B · **Subject:** modules · **Slice:** V3
- **Spec trace:** SC-FLOWS_MODULE_ID, SC-ensure-seed
- **Description:** Import `FLOWS_MODULE_ID` from `@kit/flows`. Set `KIT_MODULE_IDS = ['demo', FLOWS_MODULE_ID] as const` (or equivalent). Extend `KIT_MODULE_DEFAULTS` with `{ id: FLOWS_MODULE_ID }`. No dual string literal `'flows'` outside the import.
- **Verify:** `rg -n 'FLOWS_MODULE_ID|KIT_MODULE' apps/example-api/src/lib/kit-modules.ts`
- **Time:** 3 min · **Difficulty:** 1 · **[P]** with T1

#### T5 — GREEN · No-config module set
- **File:** `apps/example-api/src/lib/integration-config.ts`
- **Agent:** backend-dev-B · **Subject:** config · **Slice:** V3
- **Spec trace:** SC-no-config-set
- **Description:** Introduce explicit set/list for no-external-config modules (`demo`, `flows`). `isModuleConfigured` returns true for members. Add `INTEGRATION_CONFIG_PATHS[flows]` (e.g. `/admin/modules`). Typecheck must pass with expanded `KitModuleId`.
- **Deps:** T4
- **Verify:** `rg -n 'NO_CONFIG|flows|isModuleConfigured' apps/example-api/src/lib/integration-config.ts`
- **Time:** 3 min · **Difficulty:** 2

#### T6 — GREEN · Tests registry + ensure + grant seed note
- **Files:** `apps/example-api/src/services/platform-modules.test.ts` (and/or small kit-modules test)
- **Agent:** tester-A · **Subject:** tests · **Slice:** V3
- **Spec trace:** SC-vitest-registry, SC-grant-seed
- **Description:** Assert `isKitModuleId('flows')`; after ensure, platform list includes `flows` with available false by default; assert `isModuleConfigured('flows', null)` true. Document grant-seed blast in a one-line test comment or assert systemRoleGrantSeed includes flows when fed KIT_MODULE_IDS (if pure helper is importable).
- **Deps:** T3, T4, T5
- **Verify:** `bun run --filter @kit/example-api test -- platform-modules`
- **Time:** 8 min · **Difficulty:** 3

#### T7 — RED-GATE · typecheck + focused tests
- **Agent:** tester-A · **Subject:** tests · **Slice:** all
- **Spec trace:** all SC
- **Description:** Run typecheck for example-api + focused vitest. Confirm no HTTP routes for flow plans/runs added (`rg 'flow_plans|/api/flows' apps/example-api/src/routes` empty of new CRUD).
- **Deps:** T6
- **Verify:**
  ```bash
  bun run --filter @kit/example-api typecheck
  bun run --filter @kit/example-api test
  ```
- **Expected:** exit 0; no new flow admin routes
- **Time:** 5 min · **Difficulty:** 1 · **Phase:** RED-GATE

## Task Seeding Blueprint

<!-- Used by /implement to seed TaskCreate calls on session start.
     Format: T{n} | agent-instance | blockedBy | subject -->

### Wave 1 — no deps, 2 agents ∥

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T1 | backend-dev-A | — | migrations |
| T4 | backend-dev-B | — | modules |

### Wave 2 — after Wave 1, 2 agents ∥

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T2 | backend-dev-A | T1 | migrations |
| T3 | backend-dev-A | T1 | schema |
| T5 | backend-dev-B | T4 | config |

### Wave 3 — after Wave 2, 1 agent

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T6 | tester-A | T3,T4,T5 | tests |
| T7 | tester-A | T6 | tests |

## Ref Patterns

| Pattern | Path |
|---------|------|
| Integer ms migration | `apps/example-api/migrations/0011_demo_items.sql` |
| Drizzle table export | `apps/example-api/src/db/schema.ts` (`demoItems`) |
| Platform ensure | `apps/example-api/src/services/platform-modules.ts` |
| Module id constant | `packages/flows/src/constants.ts` |

## Notes for implement

- Prefer composite UNIQUE + composite FK for plan↔run org match (spec option a).
- Do **not** add routes under `routes/`.
- Grant seed expansion is intentional; no special-case exclude.
- Principal stays on `main`; all code in worktree only.

## Task IDs

<!-- Generated by /plan. Used by /implement to resume tasks on session restart. -->
- T1: T1 — migrations
- T2: T2 — migrations
- T3: T3 — schema
- T4: T4 — modules
- T5: T5 — config
- T6: T6 — tests
- T7: T7 — tests
