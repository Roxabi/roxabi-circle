---
title: "feat(flows): D1 flow_plans/flow_runs + module catalogue flows"
description: "Apply org-scoped D1 tables for flow plans/runs and register flows in the ADR-0003 module catalogue."
type: spec
status: approved
normative: false
issue: 29
tier: F-lite
---

## Context

- **Source:** `artifacts/frames/29-flows-d1-plans-runs-module-frame.md` (approved, F-lite)
- **Issue:** [#29](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/29)
- **Parent:** #16 · **Blocked by:** #28 ✓ · **Blocks:** #31 · **Parallel:** #30
- **Refs:** ADR-0005 D4/D5 · ADR-0003 · sketch `packages/flows/migrations/0001_flows_plans_runs.sql`

## Intent

`@kit/flows` pure core is live, but D1 has no `flow_plans` / `flow_runs` tables and `KIT_MODULE_IDS` still only lists `demo`. Admin API (#31) and Workflows (#30) need durable, **org-scoped** storage and a catalogue id `flows` for platform/org enablement. Why now: #28 unblocked this slice; sequence marks #29 as NEXT.

## Goal

example-api ships a versioned D1 migration for `flow_plans` + `flow_runs` with required `org_id`, Drizzle tables matching that shape, and `flows` registered in `KIT_MODULE_IDS` / platform_modules seed so catalogue list/ensure sees the module (default **unavailable** until admin enables).

## Users

- **Primary:** kit maintainers wiring flows persistence and module control plane before #31.
- **Secondary:** operators running local D1 migrations / dogfood; future admin API consumers.

## Expected Behavior

1. Developer pulls kit, runs D1 migrations for example-api → tables `flow_plans` and `flow_runs` exist with `org_id NOT NULL` and indexes on `org_id` (and plan FK index).
2. `ensurePlatformModules` / public platform module list include key `flows` (from `KIT_MODULE_IDS` + defaults seed).
3. `flows` is treated as **configured without external secrets** for V0 (same class as `demo`) so platform can set `available=true` without a fake integration config path requirement blocking enablement; config path may point at a future `/admin/flows` or modules page.
4. Drizzle `schema` exports `flowPlans` / `flowRuns` (names per local convention) so typed queries are possible; **no HTTP CRUD in this issue**.
5. Tests cover: module id present in registry; ensure/seed path includes `flows`; schema/migration shape assertions where cheap (e.g. constant + drizzle table columns or SQL fixture).

## Data Model & Consumers

### Tables (D1 / SQL)

**Applied migration is SSoT.** Copy shape from sketch `packages/flows/migrations/0001_flows_plans_runs.sql`, but **timestamps are integer ms** (mode number) to match `platform_modules` / BA / demo tables — not sketch text. Update sketch header to point at applied path (OUT OF DATE for types) so dual-file drift is explicit.

**FK delete:** SQLite default RESTRICT on `flow_runs.plan_id` → `flow_plans(id)` — do not invent CASCADE.

**Tenancy residual (honest):** `org_id NOT NULL` + indexes is schema half of IDOR; composite integrity (run.org_id must match plan.org_id) is **not** enforced by FK-on-id-only. Spec requires either (a) composite UNIQUE(id, org_id) + composite FK, **or** (b) explicit open residual documented for #31 service-layer CHECK — not “IDOR done” from NOT NULL alone. Prefer (a) if cheap under D1/SQLite; else (b) with AC wording that tenancy match is #31 write invariant.

**`flow_plans`**

| Column | Type | Notes |
|--------|------|--------|
| id | text PK | |
| org_id | text NOT NULL | tenancy; never nullable |
| plan_key | text NOT NULL | |
| version | integer NOT NULL DEFAULT 1 | |
| enabled | integer/bool NOT NULL DEFAULT 1 | |
| yaml_source | text | optional source |
| plan_json | text NOT NULL | sealed plan body |
| plan_digest | text NOT NULL | content-address index |
| created_by | text | optional |
| created_at | NOT NULL | |
| updated_at | NOT NULL | |
| UNIQUE(org_id, plan_key, version) | | |

**`flow_runs`**

| Column | Type | Notes |
|--------|------|--------|
| id | text PK | |
| org_id | text NOT NULL | tenancy; denormalized for IDOR queries |
| plan_id | text NOT NULL | FK → flow_plans(id) |
| plan_key | text NOT NULL | denormalized |
| status | text NOT NULL | lifecycle string (opaque here) |
| actor_id | text NOT NULL | |
| snapshot_json | text NOT NULL | frozen run snapshot |
| plan_digest | text NOT NULL | |
| workflow_instance_id | text | nullable until #30 |
| receipt_json | text | nullable |
| error_code | text | nullable |
| created_at / updated_at | NOT NULL | |

Indexes: `flow_plans_org_idx`, `flow_runs_org_idx`, `flow_runs_plan_idx`.

**IDOR invariant:** every query path later (#31) MUST filter `org_id`; schema forbids unscoped rows.

### Module catalogue

| Id | Default available | Configured V0 | Config path |
|----|-------------------|---------------|-------------|
| `flows` | false (seed via ensure) | true (no external secrets) | e.g. `/admin/modules` or `/admin/flows` placeholder |

Use `FLOWS_MODULE_ID` from `@kit/flows` where example-api already imports the package (dogfood) — avoid string drift.

### Consumers

| Consumer | Fields / surface | Status |
|----------|------------------|--------|
| ensurePlatformModules / listPlatformPublic | module id `flows` | **this issue** |
| org role grant seed (`systemRoleGrantSeed(KIT_MODULE_IDS)`) | includes flows | **this issue** (automatic via KIT_MODULE_IDS) |
| Drizzle schema + future repos | plan/run rows | **this issue** tables only |
| Admin API CRUD | all columns | **#31** |
| Workflows adapter | workflow_instance_id, snapshot | **#30** |

## Breadboard

### Affordance table

| ID | Affordance | Handler / artifact | Data |
|----|------------|-------------------|------|
| N1 | D1 migration `0012_flows_plans_runs.sql` (next free number) | wrangler migrations_dir | creates flow_plans, flow_runs |
| N2 | Drizzle tables in `apps/example-api/src/db/schema.ts` | export in schema object | typed columns match SQL |
| N3 | `KIT_MODULE_IDS` + `KIT_MODULE_DEFAULTS` include `flows` | `kit-modules.ts` | registry |
| N4 | `INTEGRATION_CONFIG_PATHS` + no-config set includes `flows` | `integration-config.ts` | V0 no external secrets |
| N5 | Require `FLOWS_MODULE_ID` from `@kit/flows` | kit-modules.ts | no dual string |
| N6 | Tests: registry + ensure includes flows | platform-modules / kit-modules tests | vitest |
| N7 | Optional: note in packages/flows migration that applied path is example-api | comment only | no double apply |

### Wiring

```text
KIT_MODULE_IDS ──► ensurePlatformModules ──► platform_modules row (available=0)
SQL migration ──► D1 tables
Drizzle schema ──► typed access (unused by routes until #31)
```

## Slices

| # | Slice | Demo | Affordance IDs |
|---|-------|------|----------------|
| V1 | Migration SQL applied shape (file + indexes + org_id NOT NULL) | `wrangler d1 migrations list` / file review | N1, N7 |
| V2 | Drizzle schema tables | typecheck | N2 |
| V3 | Module catalogue `flows` + config gate | unit tests list/ensure | N3–N6 |

V1→V2→V3 can ship in one PR; order is dependency for mental model, not separate merges required.

## Success Criteria

- [ ] `apps/example-api/migrations/*_flows_*.sql` creates `flow_plans` and `flow_runs` with **`org_id` NOT NULL** on both tables
- [ ] Timestamp columns `created_at` / `updated_at` are **integer** (ms), not text
- [ ] Unique constraint on `(org_id, plan_key, version)` for plans; FK `flow_runs.plan_id` → `flow_plans.id` (RESTRICT)
- [ ] Indexes on `flow_plans(org_id)`, `flow_runs(org_id)`, `flow_runs(plan_id)` exist
- [ ] Tenancy residual explicit: either composite FK `(plan_id, org_id)` → `(id, org_id)` **or** documented open residual for #31 write CHECK (run.org_id = plan.org_id) — AC text names which was chosen
- [ ] Drizzle schema defines matching tables (column set ⊇ SQL required cols) and is exported in the app `schema` object
- [ ] `KIT_MODULE_IDS` includes `flows` **via** `FLOWS_MODULE_ID` from `@kit/flows` (no dual literal)
- [ ] `ensurePlatformModules` seeds a `platform_modules` row for `flows` when missing (**available=false** default)
- [ ] `flows` is in an explicit no-external-config set (with `demo`); `isModuleConfigured('flows')` true; non-members still fail closed when unconfigured
- [ ] Grant-seed blast documented: expanding `KIT_MODULE_IDS` feeds `systemRoleGrantSeed` — Vitest or note asserts flows appears in seed matrix for system roles (intentional for kit dogfood)
- [ ] Vitest covers presence of `flows` in registry and that platform ensure/list path includes it
- [ ] Sketch package SQL header states applied SSoT path under example-api (types may differ)
- [ ] No new HTTP routes for plans/runs in this PR
- [ ] No product métier strings

## Edge Cases

| Case | Handling |
|------|----------|
| Existing DBs without tables | New migration only; no backfill needed (greenfield tables) |
| `flows` already partially registered | ensure is idempotent (existing platform_modules pattern) |
| Timestamp style integer vs text | Match example-api integer ms in applied migration; keep sketch file as reference or update comment |
| Grant seed growth | Adding to KIT_MODULE_IDS expands system role seeds for **new** ensure paths; intentional for kit dogfood; document blast; do not special-case exclude without #31 policy |
| isModuleConfigured was demo-only | Named no-config set `{demo, flows}` — not a one-off boolean hack |
| Cross-org plan↔run via FK-on-id | Prefer composite FK if supported; else residual owned by #31 service CHECK |

## Out of Scope

- HTTP admin API (#31)
- CF Workflows binding / instance ids fill (#30)
- UI `/admin/flows` (#33)
- Changing pure core check/snapshot APIs
