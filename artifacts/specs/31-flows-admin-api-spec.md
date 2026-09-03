---
title: "feat(flows): admin API P1 — plans/runs, enable, org_id, admin gate"
description: "example-api HTTP for org-admin session: YAML plan, queued run + FLOW_RUN.create, org-scoped GET via readRunRollup."
type: spec
status: approved
normative: false
issue: 31
tier: F-full
---

## Context

**Promoted from:** [analysis #31](../analyses/31-flows-admin-api-analysis.md) (F-full; Shape 1). Frame: [frame #31](../frames/31-flows-admin-api-frame.md). Expert pass 2026-08-19 folded (architect · doc-writer · product-lead · adversarial).
**GitHub issue:** [#31](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/31)
**Parent:** epic 16 · **Blocked by:** #30 ✓ · **Blocks:** #32 · #33 · #36
**Refs:** ADR-0005 D4/D5 · ADR-0001 · ADR-0003 · `#30` spec · `packages/flows` · `0012_flows_plans_runs.sql` · `tasks.ts` prefix · `admin-users.ts` session

## Intent

D1 + `driveFlowRun` exist; nothing exposes them over HTTP. Tests insert `queued` and call the driver. Without this API, D3 cannot start and the next author will treat handler-200 / Workflow `complete` as success.

## Goal

An org-admin **session** can publish a YAML plan, start a durable org-scoped run, list/get **app** status+receipts, and disable a plan so **new** runs stop while in-flight snapshots continue. Member and `sk_` cannot mutate. Cross-org ids 404. PR closing keyword references **issue 31 only**.

## Users

- **Primary:** kit maintainer / dogfood org-admin with a session cookie.
- **Secondary:** #32/#33 authors (compose this HTTP + rollup; no second sequencer).

## Constraints

- Apps own routes (ADR-0001). No `@kit/flows` Hono router. No `driveFlowRun` / `interpretRun` / `FlowRunWorkflow` import under `routes/` **or** `services/`.
- Persist `runnerView` only; `parseRunnerView` on any snapshot read; GET uses `readRunRollup({ status, receiptJson, errorCode })` — **map from D1 snake_case**; never pass a raw SQL row; never `instance.status()`.
- Public `ErrorCode` stays the kit closed set. 409 → `CONFLICT`. 5xx → `INTERNAL_ERROR`. D1 `error_code` may be `WORKFLOW_CREATE_FAILED` (not the HTTP `code`).
- Seed today leaves `flows` **unavailable**. Fixtures must `setPlatformAvailable('flows')` + org-enable **two** orgs before IDOR. Module off → 404 (not empty list).
- `FLOW_RUN.create` is **awaited** in the handler (no `waitUntil`). HTTP tests **stub** `env.FLOW_RUN.create` (`createMemoryEnv`). Terminal `succeeded` is **not** this issue.

## Expected Behavior

1. **Mount:** `/api/flows/*`. Org from **`X-Org-Id` only** (tasks convention — no `:orgId` in the path). Middleware **in order:** `requireAuth` → `requireSession` (`.use` on `/api/flows` and `/*`, fail-closed for `sk_`) → `requireOrgContext()` with **`allowSuperAdmin: false`** (super_admin must be a member; no break-glass). Then per-verb `requireModule(FLOWS_MODULE_ID, 'read'|'write')` — GET = `read`, mutations = `write`. Missing org header → 400. No cookie → 401. Module not effective → 404.
2. **V0 authz** (three vocabularies — do not mix):

   | Verb | Module | Session | Admin gate |
   |------|--------|---------|------------|
   | GET list/detail | `read` | required | **no** — membership + grant `read` |
   | POST plan / PATCH enable | `write` | required | `canAdminFlows` |
   | POST run | `write` | required | `canCreateFlowRun` + plan `enabled` |

   Seed `member`/`reader` have `flows=disabled` → GET 403 via `requireModule`, not 200. **Custom role** with `flows=write` and `orgRole ∉ {owner,admin}` → POST/PATCH/run **403** (`canAdminFlows` / `canCreateFlowRun`). `sk_` any verb → 403. Super_admin: still session + membership; `canAdminFlows` true via `platformRole`.
3. **POST plan:** JSON `{ yaml: string }` **`.strict()`**. Extra keys (`allowedTools`, `grant`, …) → 400 `VALIDATION_ERROR`. `c.req.text()` raw YAML is **not** V0. Catch `PlanYamlError` → 400 (not 500). `loadPlanFromYaml` → `checkPlan(plan, dogfoodFixedGrant(orgId), dogfoodToolRegistry)`. Fail → 400 `VALIDATION_ERROR` + issues. Ok → `plan_key = plan.id`, **`version = 1`**, duplicate `(org_id, plan_key, version)` → 409 `CONFLICT`. Persist `yaml_source`, `plan_json`, `plan_digest = digestPlan(plan)`, `enabled=true`, `created_by = subject`. **201** `{ plan, requestId }` with `id` (row), `orgId`, `planKey`, `version`, `enabled`, `digest`.
4. **PATCH enable:** JSON `{ enabled: boolean }` `.strict()`. Updates **`flow_plans` only**. `enabled=false` → new POST run 409 `CONFLICT` (details may say plan disabled). In-flight `flow_runs` **unchanged** (queued stays queued).
5. **POST run:** no body (or empty object `.strict()` — extra YAML/grant **400**; always snapshot **stored** `plan_json`). Load `(planId, orgId)` — missing → 404. Disabled → 409 `CONFLICT`. `createRunSnapshot` with server grant + `dogfoodToolRegistry` + `actorId = subject`. **Do not** `checkPlan` again. Persist `JSON.stringify(runnerView)` only (`grantAudit` off blob). `runId` matches `#30` / `drive.ts`: length 1..100, CF instance-id charset; `orgId` 1..256. Insert `queued` via **`repos/flows.ts`**. Then **await** `env.FLOW_RUN.create({ id: runId, params: { runId, orgId } })` — extra keys forbidden by `.strict()` on the worker. **202** `{ run, requestId }` with `id`, `status: 'queued'`. If `create()` throws: compensating `UPDATE … SET status='failed', error_code='WORKFLOW_CREATE_FAILED' WHERE id=? AND org_id=? AND status='queued'`; HTTP **502** `INTERNAL_ERROR`. GET after that is `failed`, **never** `queued`. Do **not** delete. Do **not** `waitUntil`. Invoke port **not** called from this request.
6. **GET:** `WHERE org_id = ?`. Stolen `planId`/`runId` of org B with **own** `X-Org-Id=A` → **404**. Map with `readRunRollup({ status: row.status, receiptJson: row.receipt_json, errorCode: row.error_code })`. Response `{ plan|plans|run|runs, requestId }`. Run JSON: `id`, `orgId`, `planId`, `status`, `receipts`, `errorCode` — **no** CF instance status field. List unpaginated V0.
7. **IDOR / auth tests (enumerated):** two orgs with `flows` available+enabled; stolen id + attacker header → 404; unknown id → 404; `sk_` any verb → 403; member POST plan → 403; custom `write` non-admin → 403; unauthenticated → 401.
8. **Rollup pin (not queued-proxy):** seed a run `status=failed` + skip/fail `receipt_json`; stub `FLOW_RUN` as if CF `complete`. GET body matches D1 rollup; **no** `complete` anywhere in JSON.
9. **Dogfood YAML:** HTTP tests use **invoke-only** echo (`INVOKE_ONLY_PLAN_YAML` or equivalent — no infer). Storing `DEMO_ECHO_PLAN_YAML` is allowed; Worker without InferPort → `INFER_FAILED` (not an HTTP filter).
10. **PR:** closing keyword references **31 only**. No `close #16` / `fix #16` / same for 72.

## Data Model & Consumers

Existing `flow_plans` / `flow_runs` (0012). No new migration unless a column is missing. Composite unique `(org_id, plan_key, version)` and FK `(plan_id, org_id) → (id, org_id)`.

#31 writes `queued` (insert) and may write `failed` + `WORKFLOW_CREATE_FAILED` if create throws. Workflow writes `running` / terminal. `cancelled` unused.

| Consumer | Fields | When | Status |
|----------|--------|------|--------|
| GET handlers | rollup camelCase | list/detail | This issue |
| #32 / #33 | run id + JSON | later | Future |
| `driveFlowRun` | snapshot_json | claim | #30 |

## Breadboard

### HTTP

| ID | Element | Handler | Data |
|----|---------|---------|------|
| N1 | `GET /api/flows/plans` | listPlans | org-scoped plans |
| N2 | `GET /api/flows/plans/:planId` | getPlan | `(id, org_id)` |
| N3 | `POST /api/flows/plans` | createPlan | `{ yaml }` → plan row |
| N4 | `PATCH /api/flows/plans/:planId` | setEnabled | `flow_plans.enabled` |
| N5 | `POST /api/flows/plans/:planId/runs` | createRun | queued + `FLOW_RUN.create` |
| N6 | `GET /api/flows/runs` | listRuns | org-scoped runs |
| N7 | `GET /api/flows/runs/:runId` | getRun | rollup |

### Gates / services

| ID | Element | Handler | Data |
|----|---------|---------|------|
| S1 | session + org + module `.use` | middleware | cookie, `X-Org-Id` |
| S2 | `canAdminFlows` / `canCreateFlowRun` | service | role + `authMethod` |
| S3 | `checkPlan` + mint | createPlan only | grant + registry |
| S4 | plan repo | insert/list/get/setEnabled | D1 `flow_plans` |
| S5 | run repo insert + start | insert queued + await create | D1 + binding |
| S6 | run repo load + `readRunRollup` | GET mapper | camelCase input |
| S7 | create() throw | CAS queued→failed | `WORKFLOW_CREATE_FAILED` |

### Wiring

S1 wraps all N*. N3 → S2 + S3 → S4. N4 → S2 → S4 (plans table only). N5 → S2 → load plan → snapshot (no S3 check) → S5 → 202; throw → S7. N1/N2 → S4. N6/N7 → S6. `persist.ts` not on this board.

## Slices

| # | Name | Scope (IDs) | Demo criteria |
|---|------|-------------|---------------|
| 1 | Gates + GET | S1, N1, N2, N6, N7, S6 | session + module read lists 0; `sk_` 403; stolen id + own header 404; module off 404 |
| 2 | Publish + enable | N3, N4, S2, S3, S4 | POST `{ yaml }` invoke-only 201; extra `allowedTools` 400; PATCH disable; GET plan `enabled=false`; queued run **unchanged** |
| 3 | Create-run + rollup | N5, N7, S2, S5, S6, S7 | 202 + stub `create({ id, params: { runId, orgId } })`; GET `queued`; disable then POST run → 409; `create` throw → 502 and GET `failed`; seeded failed+CF complete → D1 rollup only |

## Success Criteria

- [ ] Seven paths exist as N1–N7; `app.ts` mounts them; no import of `driveFlowRun` / `interpretRun` / `FlowRunWorkflow` under `routes/` or `services/`
- [ ] `requireSession` is route `.use` (not per-handler); `sk_` on GET, POST, PATCH, create-run → 403
- [ ] GET 200 requires module `read` + membership; seed member → 403; custom `write` non-admin → 403 on N3/N4/N5
- [ ] POST plan: `{ yaml: string }` `.strict()`; `checkPlan` with `dogfoodFixedGrant` + `dogfoodToolRegistry`; `plan_key = plan.id`, `version = 1`; duplicate → 409 `CONFLICT`; 201 `{ plan, requestId }`
- [ ] POST `{ allowedTools }` or `{ grant }` → 400; snapshot `allowedTools` is `['echo']` only
- [ ] POST run: no client YAML; snapshot stored `plan_json`; `snapshot_json` is `parseRunnerView`-valid and has no `grantAudit`; insert in `repos/flows.ts`; `persist.ts` has no INSERT
- [ ] POST run **awaits** `FLOW_RUN.create({ id: runId, params: { runId, orgId } })`; 202 `{ run: { id, status: 'queued' }, requestId }`; invoke port not called
- [ ] `create()` throw → 502 `INTERNAL_ERROR`; row `status='failed'` + `error_code='WORKFLOW_CREATE_FAILED'` (not `queued`); GET shows `failed`
- [ ] `enabled=false` → new POST run 409 `CONFLICT`; existing queued run GET still `queued`
- [ ] GET maps via `readRunRollup({ status, receiptJson, errorCode })`; seeded failed bundle + stub CF `complete` → body has D1 rollup and **no** `complete`
- [ ] Stolen plan/run id + attacker `X-Org-Id` → 404; unknown id → 404; missing org header → 400; no cookie → 401; module off → 404
- [ ] HTTP tests stub `FLOW_RUN.create`; invoke-only YAML; fixtures enable `flows` on two orgs; no claim of terminal `succeeded`
- [ ] 0 product métier strings; PR closing keyword references **31 only**

## Edge Cases

| Case | Handling |
|------|----------|
| YAML parse fail | 400 `VALIDATION_ERROR` |
| `checkPlan` fail | 400 `VALIDATION_ERROR` + issues |
| Unique `(org_id, plan_key, version)` | 409 `CONFLICT` |
| Registry version mismatch at snapshot | 400 `VALIDATION_ERROR` |
| Unauthenticated | 401 |
| `sk_` | 403 all verbs |
| Super_admin, not a member | 404 (no bypass) |
| POST run body with YAML | 400 |
| List | unpaginated V0 |

## Out of scope

HITL (#32) · `/admin/flows` (#33) · authoring UI (#34) · token meter (#35) · `net`/`r2` (#36) · terminate/`cancelled` · `sk_` read · kit Hono router · closing #16/#72 · InferPort on Worker · pagination · new `ErrorCode` values
