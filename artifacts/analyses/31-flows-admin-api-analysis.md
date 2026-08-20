---
title: "feat(flows): admin API P1 — plans/runs, enable, org_id, admin gate"
description: "HTTP admin surface in example-api composing @kit/flows + FLOW_RUN; no second sequencer."
type: analysis
status: approved
---

## Source

GitHub [#31](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/31) (child of #16). Approved frame `artifacts/frames/31-flows-admin-api-frame.md`. Interview phases pre-filled from φ (no extra elicitation). Expert pass 2026-08-19 (doc-writer · product-lead · architect) folded into this draft.

> example-api routes: list/get plans & runs, create plan from YAML, create-run (snapshot), enable/disable. V0 **org admin only**. Multi-tenant `org_id` + membership.

## Problem

Durable execution exists (`driveFlowRun` + `FLOW_RUN` binding) and D1 tables exist (`flow_plans` / `flow_runs` with composite plan↔org FK). Nothing exposes that lifecycle over HTTP: `app.ts` has no flows routes; `persist.ts` can load/claim/write receipts but **cannot insert** a queued run; tests seed rows and call `driveFlowRun` directly. `canCreateFlowRun` already fail-closes `api_key` / omitted `authMethod`, but no route calls it. There is no enable/disable that blocks **new** runs only. Without this slice, D3 cannot start; the next HTTP author will treat handler-200 / Workflow `complete` as success (the silent-ok class #30 closed).

## Outcome

An org-admin **session** can publish a YAML plan, start a durable org-scoped run, list/get **app** status and receipts, and disable a plan so **new** runs stop while in-flight snapshots continue. A member or `sk_` cannot create-run. Cross-org IDs do not leak.

## Appetite

One F-full cycle: example-api HTTP only. No new package. No UI.

## Shapes

**Diagram:** [Three shapes](../visuals/31-flows-admin-api-shapes.html)

### Shape 1: App-owned admin REST

example-api owns `routes → services → repos`. Compose kit helpers (`check`, `createRunSnapshot`, `parseRunnerView`, `readRunRollup`, `canCreateFlowRun`). Persist `runnerView` only. Insert `queued` then `FLOW_RUN.create({ id: runId, params: { runId, orgId } })`. GET reads D1 rollup. PATCH enable blocks **new** runs only.

**Trade-offs:**
- Pro: ADR-0001 axis; reuses org middleware, module grants, `#30` sequencer; second product copies the pattern without forking the runner.
- Con: first HTTP writer of flows — auth review is mandatory; test harness must stub `FLOW_RUN.create` (binding already typed).

**Rough scope:** L

### Shape 2: Hono router inside `@kit/flows`

Promote a kit-level `flowsRouter(env)` so products `app.route('/api/flows', kitRouter)`.

**Trade-offs:**
- Pro: second compose would import instead of copy routes.
- Con: no second call site yet (ADR-0001 / D6); kit would take D1 + Workflow binding + session shape — Worker/app concerns in a pure package.

**Rough scope:** XL

### Shape 3: In-process snapshot POST

Wrap `dogfoodPlanToSnapshot` in one POST that returns snapshot JSON. No D1 write, no Workflow create, no org gate.

**Trade-offs:**
- Pro: smallest code, reuses today’s dogfood freeze.
- Con: no durable run, no IDOR isolation, D3 unmet; reopens silent-ok if the client treats 200 as success.

**Rough scope:** S

## Fit Check

**Diagram:** [Recommended data flow](../visuals/31-flows-admin-api-data-flow.html)

**Shape 1** fits appetite + constraints.

| Requirement | Shape 1 | Shape 2 | Shape 3 |
|-------------|---------|---------|---------|
| Apps own routes (ADR-0001) | yes | no | n/a (no surface) |
| Durable run + receipts | yes | yes (if copied) | no |
| Org-scoped IDOR | yes | maybe | no |
| No second sequencer | yes | risk | n/a |

Shape 2 killed by **ADR-0001 / D6** (no second call site; HTTP/bindings stay in the app). Shape 3 killed by **D3 unmet + silent-ok class #30 + no IDOR**.

Anti-goals (moved out of Outcome): never walk `sealedPlan.tasks` in Hono; never read `instance.status()`; never accept client `allowedTools`; never treat HTTP 200 / Workflow `complete` as app `succeeded`.

Three vocabularies (do not mix):

1. **Module grant** — `requireModule(FLOWS_MODULE_ID, read|write)` (platform/org enable + role grant).
2. **HTTP admin gate** — `requireSession` on **all V0 verbs** (do not copy `tasks.ts` auth as-is: that lets `sk_` through). `canAdminFlows` on create-plan / enable; `canCreateFlowRun` on create-run. Module `write` is necessary-not-sufficient (Phase B custom roles can have `write` without owner/admin).
3. **CapabilityGrant ∩ permits** — minted **server-side** at snapshot time (`dogfoodFixedGrant(orgId)` as-is). Not an HTTP role.

V0 authz matrix (pin in spec):

| Verb | Session | `sk_` | Extra |
|------|---------|-------|-------|
| GET list/detail | yes if module read + membership | **off** unless spec opens later | org-scoped 404 |
| POST plan / PATCH enable | admin/owner (or super_admin) + module write | deny | `canAdminFlows` |
| POST run | same + `canCreateFlowRun` | deny | stored plan must be `enabled` |

IDOR status split (match example-api): unknown / cross-org id → **404**. Authenticated member/`sk_` forbidden write → **403**. Not interchangeable.

Create-run input = **stored plan row** `(id, org_id)`, not request YAML. Snapshot `plan_json`. Reject `enabled=false`. Persist `JSON.stringify(runnerView)` only (`grantAudit` off the blob). Insert queued in **`repos/flows.ts`**. `persist.ts` stays runner-only (load / claim / receipts). Services must not import `driveFlowRun` / `interpretRun`. Then `env.FLOW_RUN.create({ id: runId, params: { runId, orgId } })` with `runId` matching `drive.ts` charset. If `create()` throws, do not leave a silent `queued` with no `error_code`.

### Files impacted (expected)

| File | Role |
|------|------|
| `apps/example-api/src/routes/flows.ts` | new — HTTP |
| `apps/example-api/src/services/flows.ts` | new — mint, check, snapshot, enable, start |
| `apps/example-api/src/repos/flows.ts` | new — insert/list/get plans+runs (`queued` insert lives here) |
| `apps/example-api/src/app.ts` | mount |
| `apps/example-api/src/lib/flows-dogfood.ts` | keep mint app-owned; do not export free-form allowlists |
| `apps/example-api/src/flows-run/persist.ts` | **no insert** — runner load/claim/receipts only |
| `apps/example-api` IDOR tests | cross-org **404**; forbidden write **403**; sk_ create-run 403 |
| `packages/flows` | **no** HTTP; reuse `canCreateFlowRun`, `parseRunnerView`, `readRunRollup` |

## Spec residuals

(Not shape-blocking. Close in `/spec`.)

- Path prefix: default `tasks.ts` convention (`/api/flows` + org from path `orgId` or `X-Org-Id`).
- Create-run HTTP status: lean **202 after `create()` accepts** vs 201 on insert. Pick one. `create()` throw → fail the HTTP request; do not leave orphan `queued`.
- Dogfood YAML: create-plan may store `DEMO_ECHO_PLAN_YAML`; create-run V0 uses an **invoke-only** fixture (echo). Raw echo YAML includes `summarize` infer — Worker `driveFlowRun` has no InferPort → `INFER_FAILED`.
- `sk_` GET: issue says “read may allow sk_ later”. V0 = session-only for **all** verbs (folded into Shape 1 matrix above).
