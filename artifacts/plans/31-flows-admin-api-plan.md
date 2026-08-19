---
title: "Plan: feat(flows): admin API P1 — plans/runs, enable, org_id, admin gate"
issue: 31
spec: artifacts/specs/31-flows-admin-api-spec.md
complexity: 7/10
tier: F-full
generated: 2026-08-19
status: approved
host: grok-todos
normative: false
---

## Summary

Ship example-api `/api/flows` as one PR: session `.use`, org header, module grants, YAML `{ yaml }` `.strict()`, queued insert in `repos/flows.ts`, **await** `FLOW_RUN.create`, GET via camelCase `readRunRollup`. No second sequencer. Closes #31 only.

Planning slices **V1–V3** (single PR; sequential TDD). Override with `plan slice V2` if you want a thinner first cut.

## Architecture

**Data flow:** [31 data flow](../visuals/31-flows-admin-api-data-flow.html)  
**File map:** [31 file map](../visuals/31-flows-admin-api-file-map.html)

Cookie → session `.use` → `X-Org-Id` → module → service → repo D1; POST run inserts `queued` then awaits `FLOW_RUN.create({ runId, orgId })`. GET maps snake_case row → `readRunRollup`. `persist.ts` stays off the HTTP path.

## Bootstrap Context

- Spec approved: `artifacts/specs/31-flows-admin-api-spec.md`
- Shape 1: app-owned REST (analysis approved)
- Already shipped: `canCreateFlowRun`, `readRunRollup`, `driveFlowRun`, `FLOW_RUN` binding, `0012` tables, `INVOKE_ONLY_PLAN_YAML` (`flows-run/fixtures.ts`)
- Seed does **not** enable `flows` (`PLATFORM_AVAILABLE_MODULES` = demo+tasks+comments) — tests must `setPlatformAvailable` + org-enable **two** orgs
- Patterns: `tasks.ts` (prefix + `X-Org-Id`), `admin-users.ts` (`requireSession` — lift to `.use`), `items.test.ts` / `tasks.test.ts` (login + IDOR), `memory-env.ts` (`FLOW_RUN.create` stub)
- File length: `apps/` max 300 — split routes/services/repos/tests if needed
- Closer unanchored: never `close #16` / `fix #16` / same for 72

## Agents

| Agent instance | Tasks | Files |
|----------------|-------|-------|
| tester-A | T1, T2, T5, T6 | `apps/example-api/src/flows.test.ts` (V1) |
| tester-B | T7, T11, T12 | `flows.test.ts` (V2) |
| tester-C | T13, T17, T19 | `flows.test.ts` (V3) |
| tester-D | T18 | `flows.test.ts` (custom-role write) |
| backend-dev-A | T4, T10, T16 | `routes/flows.ts`, `middleware/require-session.ts`, `app.ts` |
| backend-dev-B | T3, T9, T15 | `repos/flows.ts` |
| backend-dev-C | T8 | `services/flows.ts` (plan) |
| backend-dev-D | T14 | `services/flows.ts` (create-run) |

## Wave Structure

8 waves, max 3 parallel. One PR.

| Wave | Trigger | Agents | Tasks |
|------|---------|--------|-------|
| 1 | start | 3 ∥ | tester-A: T1→T2 · backend-dev-B: T3 · tester-B: T7 |
| 2 | T3 | 1 | backend-dev-A: T4 |
| 3 | T1+T4 | 1 | tester-A: T5→T6 RED-GATE V1 |
| 4 | V1 + T7 | 2 ∥ | backend-dev-C: T8 · backend-dev-B: T9 |
| 5 | T8+T9 | 1 | backend-dev-A: T10 |
| 6 | T10 | 1 | tester-B: T11→T12 RED-GATE V2 |
| 7 | V2 + T13 | 2 ∥ | tester-C: T13 · backend-dev-B: T15 · backend-dev-D: T14 |
| 8 | T14+T15 | 2 ∥ | backend-dev-A: T16 · tester-C: T17→T19 · tester-D: T18 |

### Budget — per task

| Task | Items | Class | Est. ops | Split? |
|------|-------|-------|----------|--------|
| T1 V1 RED | 1 | judgmental | 6 | — |
| T2 enable-flows fixture | 1 | bounded | 3 | — |
| T3 repos GET | 1 | bounded | 3 | — |
| T4 GET routes + session | 3 | judgmental | 6 | — |
| T5 V1 GREEN | 1 | bounded | 3 | — |
| T6 RED-GATE V1 | cmds | bounded | 2 | — |
| T7 V2 RED | 1 | judgmental | 5 | — |
| T8 createPlan service | 1 | judgmental | 6 | — |
| T9 repos insert plan | 1 | bounded | 3 | — |
| T10 POST/PATCH routes | 1 | bounded | 3 | — |
| T11 V2 GREEN | 1 | bounded | 3 | — |
| T12 RED-GATE V2 | cmds | bounded | 2 | — |
| T13 V3 RED | 1 | judgmental | 6 | — |
| T14 createRun service | 1 | judgmental | 6 | — |
| T15 repos insert queued | 1 | bounded | 3 | — |
| T16 POST run route | 1 | bounded | 3 | — |
| T17 V3 GREEN + rollup pin | 1 | judgmental | 5 | — |
| T18 custom-role 403 | 1 | judgmental | 5 | — |
| T19 RED-GATE V3 | cmds | bounded | 2 | — |

**Total estimated ops: ~75**

### Budget — per agent instance

| Instance | Tasks | Σ ops | Subjects | Split? |
|----------|-------|-------|----------|--------|
| tester-A | T1, T2, T5, T6 | 14 | auth | — |
| tester-B | T7, T11, T12 | 10 | plans | — |
| tester-C | T13, T17, T19 | 13 | runs | — |
| tester-D | T18 | 5 | authz | — |
| backend-dev-A | T4, T10, T16 | 12 | http | — |
| backend-dev-B | T3, T9, T15 | 9 | d1 | — |
| backend-dev-C | T8 | 6 | grant | — |
| backend-dev-D | T14 | 6 | workflow | — |

## Consistency Report

- Criteria covered: 13/13
- Uncovered criteria: none
- Tasks without spec backing: none
- Gold plating exemptions applied: 0
- Breadboard N1–N7, S1–S7: all mapped

| SC (abbrev) | Tasks |
|-------------|-------|
| N1–N7 mounted, no sequencer import | T4, T10, T16, T17 |
| session `.use`, sk_ 403 all verbs | T1, T4, T5 |
| GET module read; custom write 403 | T1, T5, T18 |
| POST `{ yaml }` strict, plan_key=id v1 | T7, T8, T11 |
| client grant 400; snapshot echo | T7, T8, T11 |
| POST run stored plan; repos insert; persist no INSERT | T14, T15 |
| await create; 202 queued; no invoke | T13, T14, T16, T17 |
| create throw → 502 failed not queued | T13, T14, T17 |
| disable 409; in-flight queued stays | T11, T13, T17 |
| readRunRollup camelCase; no `complete` | T4, T17 |
| stolen-id 404; 400/401; module off 404 | T1, T5 |
| stub create; invoke-only; two orgs | T2, T13, T17 |
| 0 métier; close #31 only | T19 (PR checklist) |

## Micro-Tasks

### Slice V1: Gates + GET

#### Task 1: Write V1 RED HTTP tests → tester-A
- **File:** `apps/example-api/src/flows.test.ts`
- **Snippet:** `it('GET /api/flows/plans is 401 without cookie')` · sk_ Bearer 403 · stolen planId + own `X-Org-Id` 404 · module off 404 · missing header 400
- **Verify:** `bun run --filter @kit/example-api test src/flows.test.ts` (ready — expect fail)
- **Expected:** file exists; tests fail (no routes)
- **Time:** 8 min | **Difficulty:** 4
- **Traces:** SC-2, SC-3, SC-11, N1,N2,N6,N7,S1 | **Phase:** RED
- **Subject:** auth | **Slice:** V1

#### Task 2: Add enable-flows test fixture for two orgs → tester-A
- **File:** `apps/example-api/src/flows.test.ts` (helper in same file or `src/test/flows-fixture.ts`)
- **Snippet:** `setPlatformAvailable(db, FLOWS_MODULE_ID, true)` + org-enable `org_acme` and `org_team`
- **Verify:** `grep -q setPlatformAvailable apps/example-api/src/flows.test.ts` (ready)
- **Expected:** helper used by V1 tests
- **Time:** 4 min | **Difficulty:** 2
- **Traces:** SC-12, S1 | **Phase:** RED
- **Subject:** auth | **Slice:** V1

#### Task 3: Org-scoped plan/run list+get in repo [P] → backend-dev-B
- **File:** `apps/example-api/src/repos/flows.ts`
- **Snippet:** `listPlansForOrg(db, orgId)` / `getPlan(db, id, orgId)` / same for runs — always `AND org_id = ?`
- **Verify:** `test -f apps/example-api/src/repos/flows.ts` (ready)
- **Expected:** no `WHERE id = ?` without `org_id`
- **Time:** 5 min | **Difficulty:** 3
- **Traces:** S4,S6,N1,N2,N6,N7 | **Phase:** GREEN
- **Subject:** d1 | **Slice:** V1

#### Task 4: Mount GET routes with session `.use` → backend-dev-A
- **File:** `apps/example-api/src/middleware/require-session.ts`, `src/routes/flows.ts`, `src/app.ts`
- **Snippet:** `flowsRoutes.use('/api/flows', requireAuth, requireSession, orgMw)` + `requireModule(FLOWS_MODULE_ID, 'read')` on GET; map run rows with `readRunRollup({ status, receiptJson: row.receipt_json, errorCode: row.error_code })`; `allowSuperAdmin: false`
- **Verify:** `grep -q requireSession apps/example-api/src/routes/flows.ts && grep -q flowsRoutes apps/example-api/src/app.ts` (ready)
- **Expected:** GET list empty 200 when enabled
- **Time:** 8 min | **Difficulty:** 4
- **Traces:** N1,N2,N6,N7,S1,S6,SC-1,SC-10 | **Phase:** GREEN
- **Subject:** http | **Slice:** V1

#### Task 5: Green V1 tests → tester-A
- **File:** `apps/example-api/src/flows.test.ts`
- **Snippet:** same cases as T1 now pass
- **Verify:** `bun run --filter @kit/example-api test src/flows.test.ts` (deferred)
- **Expected:** V1 cases pass
- **Time:** 5 min | **Difficulty:** 3
- **Traces:** SC-2,SC-3,SC-11 | **Phase:** GREEN
- **Subject:** auth | **Slice:** V1

#### RED-GATE: RED complete V1 → tester-A (T6)
- **Verify:** V1 RED written and GREEN passing; stolen-id + own header is 404
- **Phase:** RED-GATE
- **Traces:** V1
- **Subject:** auth | **Slice:** V1

### Slice V2: Publish + enable

#### Task 7: Write V2 RED tests → tester-B
- **File:** `apps/example-api/src/flows.test.ts`
- **Snippet:** POST `{ yaml: INVOKE_ONLY_PLAN_YAML }` 201; `{ yaml, allowedTools: ['net'] }` 400; duplicate plan_key 409; PATCH disable; GET plan `enabled: false`
- **Verify:** `grep -q INVOKE_ONLY_PLAN_YAML apps/example-api/src/flows.test.ts` (ready)
- **Expected:** fail until T8–T10
- **Time:** 6 min | **Difficulty:** 3
- **Traces:** SC-4,SC-5,N3,N4,S3 | **Phase:** RED
- **Subject:** plans | **Slice:** V2

#### Task 8: createPlan / setEnabled service → backend-dev-C
- **File:** `apps/example-api/src/services/flows.ts`
- **Snippet:** `parseOrThrow(z.object({ yaml: z.string() }).strict(), body)`; `checkPlan(plan, dogfoodFixedGrant(orgId), dogfoodToolRegistry)`; `plan_key = plan.id`; `version = 1`; `canAdminFlows`; no client allowlist
- **Verify:** `grep -q checkPlan apps/example-api/src/services/flows.ts` (ready)
- **Expected:** no `driveFlowRun` / `interpretRun` import
- **Time:** 8 min | **Difficulty:** 4
- **Traces:** S2,S3,SC-4,SC-5 | **Phase:** GREEN
- **Subject:** grant | **Slice:** V2

#### Task 9: Insert plan + setEnabled (plans table only) → backend-dev-B
- **File:** `apps/example-api/src/repos/flows.ts`
- **Snippet:** `insertPlan`; `setPlanEnabled(db, { id, orgId, enabled })` — `UPDATE flow_plans` only
- **Verify:** `grep -q setPlanEnabled apps/example-api/src/repos/flows.ts` (ready)
- **Expected:** unique conflict bubbles as 409
- **Time:** 4 min | **Difficulty:** 2
- **Traces:** S4,N3,N4,SC-9 | **Phase:** GREEN
- **Subject:** d1 | **Slice:** V2

#### Task 10: POST plan + PATCH enable routes → backend-dev-A
- **File:** `apps/example-api/src/routes/flows.ts`
- **Snippet:** `requireModule(..., 'write')` on N3/N4; 201 `{ plan, requestId }`
- **Verify:** `grep -q POST apps/example-api/src/routes/flows.ts` (ready)
- **Expected:** mutations not on GET module read
- **Time:** 5 min | **Difficulty:** 3
- **Traces:** N3,N4,S2,SC-1 | **Phase:** GREEN
- **Subject:** http | **Slice:** V2

#### Task 11: Green V2 + in-flight unchanged → tester-B
- **File:** `apps/example-api/src/flows.test.ts`
- **Snippet:** after T15 exists: insert queued (helper/sql), PATCH disable, GET run still `queued`
- **Verify:** `bun run --filter @kit/example-api test src/flows.test.ts` (deferred — in-flight case after T15)
- **Expected:** V2 pass; disable does not rewrite `flow_runs`
- **Time:** 5 min | **Difficulty:** 3
- **Traces:** SC-4,SC-5,SC-9 | **Phase:** GREEN
- **Subject:** plans | **Slice:** V2

#### RED-GATE: RED complete V2 → tester-B (T12)
- **Verify:** POST yaml green; extra keys 400; disable does not mutate runs
- **Phase:** RED-GATE
- **Subject:** plans | **Slice:** V2

### Slice V3: Create-run + rollup

#### Task 13: Write V3 RED tests → tester-C
- **File:** `apps/example-api/src/flows.test.ts`
- **Snippet:** POST run 202 + stub `create` called with `{ id, params: { runId, orgId } }` only; disabled plan 409 `CONFLICT`; `create` throw → 502 and GET `failed`; body `{ yaml }` on run → 400
- **Verify:** `grep -q FLOW_RUN apps/example-api/src/flows.test.ts` (ready)
- **Expected:** fail until T14–T16
- **Time:** 8 min | **Difficulty:** 4
- **Traces:** SC-7,SC-8,SC-9,N5,S5,S7 | **Phase:** RED
- **Subject:** runs | **Slice:** V3

#### Task 14: createRun service — snapshot stored plan, await create, compensate → backend-dev-D
- **File:** `apps/example-api/src/services/flows.ts`
- **Snippet:** load `(planId, orgId)`; `canCreateFlowRun`; snapshot `plan_json`; insert queued; `await env.FLOW_RUN.create({ id: runId, params: { runId, orgId } })`; on throw `UPDATE … failed + WORKFLOW_CREATE_FAILED WHERE status='queued'`; 502 `INTERNAL_ERROR`; no `waitUntil`; no `checkPlan` again
- **Verify:** `grep -q FLOW_RUN.create apps/example-api/src/services/flows.ts && ! grep -q waitUntil apps/example-api/src/services/flows.ts` (ready)
- **Expected:** no `driveFlowRun` import in services
- **Time:** 8 min | **Difficulty:** 5
- **Traces:** S2,S5,S7,SC-6,SC-7,SC-8 | **Phase:** GREEN
- **Subject:** workflow | **Slice:** V3

#### Task 15: Insert queued run in repo → backend-dev-B
- **File:** `apps/example-api/src/repos/flows.ts`
- **Snippet:** `insertQueuedRun` — `snapshot_json` only; `runId` 1..100
- **Verify:** `grep -q insertQueuedRun apps/example-api/src/repos/flows.ts && ! grep -q INSERT apps/example-api/src/flows-run/persist.ts` (ready)
- **Expected:** `persist.ts` unchanged (no INSERT)
- **Time:** 4 min | **Difficulty:** 2
- **Traces:** S5,SC-6 | **Phase:** GREEN
- **Subject:** d1 | **Slice:** V3

#### Task 16: POST run route → backend-dev-A
- **File:** `apps/example-api/src/routes/flows.ts`
- **Snippet:** `POST /api/flows/plans/:planId/runs`; empty/strict body; 202 `{ run: { id, status: 'queued' }, requestId }`
- **Verify:** `grep -q '/runs' apps/example-api/src/routes/flows.ts` (ready)
- **Expected:** write module + session
- **Time:** 4 min | **Difficulty:** 3
- **Traces:** N5,SC-1,SC-7 | **Phase:** GREEN
- **Subject:** http | **Slice:** V3

#### Task 17: Green V3 + rollup pin + import grep → tester-C
- **File:** `apps/example-api/src/flows.test.ts`
- **Snippet:** seed `status=failed` + skip/fail receipts; stub CF complete; GET body has D1 rollup, no `complete`; grep services/routes for `driveFlowRun`/`interpretRun`/`FlowRunWorkflow` empty
- **Verify:** `bun run --filter @kit/example-api test src/flows.test.ts` (deferred)
- **Expected:** 202 queued; throw path failed; rollup ≠ CF
- **Time:** 6 min | **Difficulty:** 4
- **Traces:** SC-7,SC-8,SC-10,SC-1,S6 | **Phase:** GREEN
- **Subject:** runs | **Slice:** V3

#### Task 18: Custom role flows=write non-admin is 403 [P] → tester-D
- **File:** `apps/example-api/src/flows.test.ts`
- **Snippet:** mint org role `operator` with `flows=write`, `orgRole` not owner/admin; POST plan/run/PATCH → 403
- **Verify:** `grep -q operator apps/example-api/src/flows.test.ts` (ready)
- **Expected:** not the seed `member` (already module-disabled)
- **Time:** 6 min | **Difficulty:** 4
- **Traces:** SC-3,S2 | **Phase:** GREEN
- **Subject:** authz | **Slice:** V3

#### RED-GATE: RED complete V3 → tester-C (T19)
- **Verify:** all example-api flows tests pass; `persist.ts` has no INSERT; PR body will `Fixes #31` only
- **Phase:** RED-GATE
- **Subject:** runs | **Slice:** V3

## Task Seeding Blueprint

<!-- Used by /implement to seed TaskCreate calls on session start. -->

### Wave 1 — no deps, 3 agents ∥

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T1 | tester-A | — | auth |
| T2 | tester-A | T1 | auth |
| T3 | backend-dev-B | — | d1 |
| T7 | tester-B | — | plans |

### Wave 2 — after T3

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T4 | backend-dev-A | T3 | http |

### Wave 3 — V1 GREEN

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T5 | tester-A | T1,T2,T4 | auth |
| T6 | tester-A | T5 | auth |

### Wave 4 — V2 impl

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T8 | backend-dev-C | T6 | grant |
| T9 | backend-dev-B | T6 | d1 |

### Wave 5

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T10 | backend-dev-A | T8,T9 | http |

### Wave 6 — V2 GREEN

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T11 | tester-B | T7,T10 | plans |
| T12 | tester-B | T11 | plans |

### Wave 7 — V3 impl

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T13 | tester-C | T12 | runs |
| T15 | backend-dev-B | T12 | d1 |
| T14 | backend-dev-D | T12,T15 | workflow |

### Wave 8 — V3 GREEN

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T16 | backend-dev-A | T14 | http |
| T17 | tester-C | T13,T16 | runs |
| T18 | tester-D | T10 | authz |
| T19 | tester-C | T17,T18 | runs |

## Task IDs

<!-- Generated by /plan. Used by /implement to resume tasks on session restart. -->
host: grok-todos
- T1: T1 — auth
- T2: T2 — auth
- T3: T3 — d1
- T4: T4 — http
- T5: T5 — auth
- T6: T6 — auth
- T7: T7 — plans
- T8: T8 — grant
- T9: T9 — d1
- T10: T10 — http
- T11: T11 — plans
- T12: T12 — plans
- T13: T13 — runs
- T14: T14 — workflow
- T15: T15 — d1
- T16: T16 — http
- T17: T17 — runs
- T18: T18 — authz
- T19: T19 — runs
