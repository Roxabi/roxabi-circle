---
title: 'ADR-0012 — Kernel persistence + request-context stratum'
status: proposed
normative: false
date: 2026-08-24
axial: false
related:
  - docs/kit/architecture/adr/0001-primary-axis-packages-compose-apps.md
  - docs/kit/architecture/adr/0003-multi-tenant-rbac-modules.md
  - docs/kit/architecture/adr/0005-flows-platform-agentic-workflows.md
  - docs/kit/architecture/adr/0008-kit-schema-identity-product-compose.md
  - artifacts/goals/137-extractible-kernel-persist-runtime-goal.md
  - 'GitHub #137'
  - 'GitHub #139'
  - 'GitHub #142'
  - 'GitHub #143'
  - 'GitHub #144'
---

# ADR-0012 — Kernel persistence + request-context stratum


**Authority:** proposed only. Not binding until a human sets `status: accepted` and `normative: true`. Do not start [#142](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/142) (schema / org middleware / migrations) before that flip — AGENTS.md requires targeted proof and human review for organization isolation and migrations.

This **is** the [ADR-0008](./0008-kit-schema-identity-product-compose.md) **D3 follow-up**: promoting applied SQL to the kit persist SSoT, and giving `@kit/*` the request-context stratum that ADR-0008 D6 already shipped for Better Auth.

Does **not** implement the move. Implementation = [#142](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/142). FlowRun driver export = [#143](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/143). Compose proof = [#144](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/144). Parent goal: [`137-extractible-kernel-persist-runtime-goal.md`](../../../../artifacts/goals/137-extractible-kernel-persist-runtime-goal.md).

## Problem

`@kit/*` is a pure-logic kernel. Kit-generic tables, org middleware, and the FlowRun driver live in non-extractible `apps/example-api`. `packages/db` still says schemas live in apps. The extractible-kernel claim is false for tenancy and runtime (review S1).

ADR-0008 D3 left applied SQL in the dogfood app on purpose and reserved this ADR. Package `packages/*/migrations` sketches have **already drifted** from applied bytes. Promoting sketches would ship a weaker tenancy model than production.

ADR-0008 D4 still says `--modules core` = example-api **0001–0008**. Catalog `core` already includes `0014_better_auth_1_7_additive`. The catalog is SSoT; the 0001–0008 sentence is stale.

## Options considered

### Option A — Keep applied SSoT in `example-api`; products keep syncing from the dogfood app

- **Pros:** zero file move; D3 as written stays true
- **Cons:** S1 remains fatal; second compose still copies runtime; D6 polarity (import factory) does not extend to schema/repos/hono

### Option B — Promote drifted `packages/*/migrations` sketches as the new apply path

- **Pros:** files already sit under packages
- **Cons:** **S5 violation.** Applied `0012_flows_plans_runs.sql` has composite FK `(plan_id, org_id)` + integer ms. `packages/flows/migrations/0001_flows_plans_runs.sql` has single-column `plan_id` + text timestamps. Sketch promote would drop org-scoped FK.

### Option C — Promote **applied** kit-generic bytes; expand existing `@kit/*` schema/hono surfaces (chosen)

- **Pros:** production FK/types win; polarity matches `@kit/auth/schema` + `./react`; `@kit/db` stays handle-only
- **Cons:** copy + retire sketches; wrangler apply path stays on the dogfood journal until retargeted

## Decision

### D1 — Applied bytes are SSoT (S5)

Promote kit-generic files from `apps/example-api/migrations/*`. Discard drifted `packages/*/migrations` sketches. Never hash or apply a sketch that lost composite `(plan_id, org_id)`.

| Tree | After this ADR (normative) | #142 does |
|------|----------------------------|-----------|
| Applied `apps/example-api/migrations/*` kit-generic files | **Promote source** | Copy into package / catalog; hashes of **those** bytes |
| `packages/*/migrations` sketches | **Not SSoT** | Delete or retire off any hashable promote path |
| Product apply journal | Still the product `migrations/` + wrangler | Dogfood journal remains apply path until retarget |

Evidence that forbids Option B:

| | Applied `0012_flows_plans_runs.sql` | Sketch `packages/flows/migrations/0001` |
|--|-------------------------------------|----------------------------------------|
| Plan/run FK | Composite `(plan_id, org_id)` | Single-column `plan_id` |
| Timestamps | Integer ms | Text |

`kit-schema-sync` hashes **promoted applied bytes**, never sketches.

### D2 — Schema export per capability

| Export | Owns |
|--------|------|
| `@kit/tasks/schema` | Tasks tables |
| `@kit/comments/schema` | Comments tables |
| `@kit/flows/schema` | Plans / runs / related flow tables |
| `@kit/auth/schema` | Tenancy/RBAC: orgs, memberships, modules, roles, grants, `api_keys`, `audit_events`, `rate_limit_buckets` (expand existing — **not** a new `@kit/orgs` unless file-length/folder-size forces a later ADR) |

**Never** declare tables in `@kit/db`.

Product compose: `{ ...kitSchema, ...productTables }`. `demo_*` stays in `apps/example-api`.

### D3 — Repos live behind the schema they own

`@kit/db` = handle + types + `D1_IN_ARRAY_CHUNK` / `mapInChunks` (and `createDb` if that is the existing factory). Not a table home. Not a disclaimer that « schemas live in apps ».

### D4 — Request context is `@kit/auth/hono`

`requireOrgContext` / `requireOrgRole` / `requireOrgCapability` / `requireModule` ship as `@kit/auth/hono` — same polarity as `@kit/auth/react`.

No Worker middleware on the SPA graph. App keeps a thin Env / wrangler apply path.

### D5 — FlowRun driver must be package-exportable (specified here, moved in #143)

[#143](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/143) moves existing `drive` / `persist` / `invoke-step` / `infer-step` / `ports`. App keeps `WorkflowEntrypoint` + wrangler `[[workflows]]`. Persist talks to kit flow tables. **Snapshot-only** (`parseRunnerView`; never reread live `flow_plans`). Do **not** bind infer in this ADR. Stay **incubating** until ADR-0005 D6 (second call site). This ADR does not implement the move.

### D6 — Amend ADR-0008 D4: catalog is SSoT for `core`

`--modules core` is **whatever catalog `set: core` lists**, not the sentence « example-api 0001–0008 ». Catalog already includes `0014_better_auth_1_7_additive` in `core`. Set ↔ file tables in ADR-0008 are illustrative of 2026-08-19; they do not override `config/kit/kit-schema-modules.json`.

### D7 — New catalog ids stay out of this promote

INV-03 (`demo_*` org-scope) and INV-04 (`api_keys.organization_id NOT NULL`) are **new catalog ids** (or a narrowed D8 scope), not silent extras on the mechanical #142 promote. Prefer a sibling if they need new applied SQL.

## Consequences

### Positive

- Second compose imports schema + `requireOrg*` the way it already imports `@kit/auth/factory`
- S5 keeps composite org FK
- D4 table vs catalog contradiction closes
- ADR-0001 test becomes implementable for persist+context

### Negative

- #142 is a large, auth/ACL/migrations-reviewed move
- Dogfood D1 journal filenames stay product-local until wrangler retarget
- Driver remains copy-paste until #143

### Neutral

- Wave 0 (this ADR + honesty docs) does **not** kill S1; claim stays false until #142+#143+#144
- Platform-proof D3 / JTBD-platform stay Not met (named tenant + HITL + second compose)

## Anti-patterns

| Anti | Why |
|------|-----|
| Promote `packages/flows/migrations/0001` (or any sketch that lost `(plan_id, org_id)`) | **S5** — weaker tenancy than applied |
| Put kit-generic tables in `@kit/db` | Handle-only; D2 |
| New `@kit/orgs` / `@kit/tenancy` without file-length force + ADR | D11 — expand `@kit/auth/schema` |
| Worker org middleware imported from SPA / `@kit/auth/react` graph | D4 polarity |
| Bind infer or leave incubating while claiming D6 met | #141 out; ADR-0005 D6 |
| Fold INV-03 / INV-04 into the mechanical promote | D7 — new catalog ids |
| Kitchen-sink PR (#142+#143+#144) | One concern per `/ship` |
| Treat this ADR as the move | Docs only; #142 implements |

## Non-goals

- Implementing the schema/repos/hono move (#142)
- Moving the FlowRun driver (#143)
- Rewriting `extract-dry-run` (#144)
- Flows console (#33)
- Infer vs invoke binding (#141 — sibling under #16)
- Second product app
- `@kit/agents`
- Declaring JTBD-platform or platform-proof D3 met
- Rewriting ADR-0008 (banners only)
