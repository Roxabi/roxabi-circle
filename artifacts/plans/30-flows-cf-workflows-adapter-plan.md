---
title: "Plan: feat(flows): CF Workflows adapter — interpret snapshot → step.do"
issue: 30
spec: artifacts/specs/30-flows-cf-workflows-adapter-spec.md
complexity: 7/10
tier: F-full
generated: 2026-08-14
status: approved
normative: false
---

## Summary

Ship the #30 runner as one PR: pure `interpretRun` + `parseReceipts` + `readRunRollup` in `@kit/flows`; `driveFlowRun` + thin `FlowRunWorkflow` in `apps/example-api`; Node tests with memory D1 (no pool-workers gate). V0 `succeeded` = every task `ok`. Closing keyword = issue 30 only.

## Architecture

**Data flow:** [30 data flow](../visuals/30-flows-cf-workflows-adapter-data-flow.html)  
**File map:** [30 file map](../visuals/30-flows-cf-workflows-adapter-file-map.html)

Insert `queued` → `FLOW_RUN.create({ id, params })` → claim CAS → parse (drop raw) → `interpretRun` → sequential `step.do` → persist in step. Three vocabularies stay unmerged.

## Bootstrap Context

- Spec approved: `artifacts/specs/30-flows-cf-workflows-adapter-spec.md`
- Frame: `artifacts/frames/30-flows-cf-workflows-adapter-frame.md`
- Already shipped: `parseRunnerView`, `createRunSnapshot`, D1 `0012_flows_plans_runs.sql`, `flows-dogfood.ts` (freeze only)
- Pattern tests: `packages/flows/src/check.test.ts`, `apps/example-api/src/lib/flows-dogfood.test.ts`, `apps/example-api/src/test/memory-env.ts` (Node + better-sqlite3)
- No `@cloudflare/vitest-pool-workers` — do not add (spec 21 / #30 residual)
- File length: `apps/` + `packages/` max 300 — split `flows-run/*`
- CF: `create({ id, params })`; `run` reads `event.payload` + `event.instanceId`; side effects inside `step.do`; default retries 5× — set `limit: 0` on invoke/infer
- Closer: `.github/workflows/close-linked-issues.yml` unanchored — never write `close #16` / `fix #16` / same for 72 in the PR body

## Agents

| Agent instance | Tasks | Files |
|----------------|-------|-------|
| tester-A | T1, T2, T12, T14 | `packages/flows/src/interpret.test.ts`, `receipts.test.ts` |
| tester-B | T3, T13, T20, T22 | `apps/example-api/src/flows-run/drive.test.ts` |
| tester-C | T16, T18, T19 | infer meter tests (same drive.test or `infer.test.ts`) |
| backend-dev-A | T4, T6 | `packages/flows/src/receipts.ts`, `index.ts` |
| backend-dev-B | T5 | `packages/flows/src/interpret.ts` |
| backend-dev-C | T7, T8, T17 | `flows-run/persist.ts`, `drive.ts` |
| backend-dev-D | T9, T11 | `flows-run/workflow.ts`, `ports.ts`, `fixtures.ts`, `src/index.ts` |
| devops-A | T10 | `wrangler.toml`, `env.ts`, `env.schema.ts`, `memory-env.ts` |
| doc-writer-A | T15, T21 | workflow module comment, `docs/deploy-cloudflare.md` |

## Wave Structure

9 waves, max 4 parallel agents. One PR; elapsed ~1–2 sessions vs longer if sliced as 3 PRs.

| Wave | Trigger | Agents | Tasks |
|------|---------|--------|-------|
| 1 | start | 3 ∥ | tester-A: T1 · tester-A: T2 · tester-B: T3 · devops-A: T10 |
| 2 | Wave 1 RED written | 2 ∥ | backend-dev-A: T4 · backend-dev-B: T5 |
| 3 | T4 done | 2 ∥ | backend-dev-A: T6 · backend-dev-C: T7 |
| 4 | T5+T7 | 1 | backend-dev-C: T8 |
| 5 | T8 | 2 ∥ | backend-dev-D: T9→T11 · doc-writer-A: T15 |
| 6 | T5+T6+T8+T11 | 2 ∥ | tester-A: T12 · tester-B: T13 → T14 RED-GATE V1 |
| 7 | V1 gate | 2 ∥ | tester-C: T16 · backend-dev-C: T17 |
| 8 | T17 | 2 ∥ | tester-C: T18→T19 · backend-dev-C: T20 · doc-writer-A: T21 |
| 9 | T20 | 1 | tester-B: T22 RED-GATE V3 |

### Budget — per task

| Task | Items | Class | Est. ops | Split? |
|------|-------|-------|----------|--------|
| T1 interpret RED | 1 file | judgmental | 6 | — |
| T2 receipts RED | 1 file | bounded | 3 | — |
| T3 drive RED | 1 file | judgmental | 6 | — |
| T4 parseReceipts | 1 file | bounded | 3 | — |
| T5 interpretRun | 1 file | judgmental | 6 | — |
| T6 readRunRollup + barrel | 2 files | bounded | 3 | — |
| T7 persist/claim | 1 file | judgmental | 5 | — |
| T8 driveFlowRun | 1 file | judgmental | 6 | — |
| T9 WorkflowEntrypoint | 2 files | bounded | 3 | — |
| T10 wrangler + Env | 4 files | bounded | 4 | — |
| T11 invoke + fixture | 2 files | bounded | 3 | — |
| T12 GREEN kit tests | 2 files | bounded | 3 | — |
| T13 GREEN drive tests | 1 file | judgmental | 5 | — |
| T14 RED-GATE V1 | cmds | bounded | 3 | — |
| T15 limits comment | 1 file | trivial | 2 | — |
| T16 infer RED | 1 file | judgmental | 5 | — |
| T17 InferPort + meter | 2 files | judgmental | 5 | — |
| T18 infer GREEN | 1 file | bounded | 3 | — |
| T19 RED-GATE V2 | cmds | bounded | 2 | — |
| T20 persist-fail | 1 file | judgmental | 5 | — |
| T21 deploy note | 1 file | trivial | 2 | — |
| T22 RED-GATE V3 | cmds | bounded | 3 | — |

**Total estimated ops: ~86**

### Budget — per agent instance

| Instance | Tasks | Σ ops | Subjects | Split? |
|----------|-------|-------|----------|--------|
| tester-A | T1, T2, T12, T14 | 15 | parser, receipts | — |
| tester-B | T3, T13, T20, T22 | 17 | driver | — |
| tester-C | T16, T18, T19 | 10 | meter | — |
| backend-dev-A | T4, T6 | 6 | receipts | — |
| backend-dev-B | T5 | 6 | interpret | — |
| backend-dev-C | T7, T8, T17 | 16 | persist, driver | — (infer via ports in T17, same drive file) |
| backend-dev-D | T9, T11 | 6 | workflow, ports | — |
| devops-A | T10 | 4 | config | — |
| doc-writer-A | T15, T21 | 4 | docs | — |

T17 stays on C (drive already owns the loop). InferPort implementation is `ports.ts` owned by D — C wires the meter check; D adds the mock function in T11 and extends it in a note for T17. If T17 needs `ports.ts` edits, D does the InferPort export and C only calls it (no third subject on C).

## Consistency Report

- Criteria covered: 22/22 (SC mapped below)
- Uncovered criteria: none
- Tasks without spec backing: none (T10/T15/T21 = infra/docs exemptions if counted as such: 0 untraced)
- Gold plating exemptions applied: 0
- Breadboard N1–N6, S1–S5, T1–T4: all mapped
- SC close-ban: T22 checklist (human PR body) — not a machine test of the yml regex (OOS)

| SC (abbrev) | Tasks |
|-------------|-------|
| kit exports, no cloudflare:workers | T4–T6 |
| interpretRun sole walker / readyTaskIds | T5, T8, T13 |
| parse drop raw + org match + strict params | T8, T13 |
| tamper → RUNNER_VIEW_INVALID | T3, T13 |
| corrupt receipts → RECEIPTS_INVALID | T2, T12 |
| claim CAS + create({ id }) | T7, T10, T13 |
| never live flow_plans / enabled=false | T8, T13 |
| invoke ∩ executionTools, catch, retries 0 | T11, T13 |
| infer meter actual + V2 two-infer | T16–T18 |
| receipts enum / no waiting producer | T4, T5, T12 |
| skip cascade a/b/c | T1, T12 |
| status vocab + readRunRollup | T6, T8 |
| succeeded = all ok | T5, T12 |
| persist before return / NonRetryableError | T8, T20 |
| workflow_instance_id | T7, T9 |
| 1 MiB + Free CPU + WfP + Paid docs | T15, T21 |
| wrangler name/export/Env/stub | T9, T10 |
| no public HTTP | T8 (no routes) |
| Node vitest not pool-workers | T3, T13 |
| dual-path behavioral | T13 |
| invoke-only fixture | T11 |
| closer issue 30 only | T22 |

## Micro-Tasks

### Slice V1: Rehydrate + invoke + interpret contract

#### Task 1: RED interpretRun contract tests [P] → tester-A
- **File:** `packages/flows/src/interpret.test.ts`
- **Snippet:** `interpretRun(view, receipts)` cases: A fail → B skip; parallel C still ready; A-ok ⇒ B ready C pending; waiting in input → failed + `WAITING_NOT_SUPPORTED`; cycle/`after` unknown → `CYCLE`/`UNKNOWN_TASK_EDGE`; empty ready + pending → `DAG_STUCK`; all ok → `succeeded`; any skip ⇒ not `succeeded`
- **Verify:** `bun --filter @kit/flows test` (`ready` — expect FAIL until T5)
- **Expected:** tests exist and fail on missing export / wrong rollup
- **Time:** 8 min | **Difficulty:** 4
- **Traces:** N2, T1, SC interpret/skip/succeeded | **Phase:** RED | **Subject:** parser

#### Task 2: RED parseReceipts + readRunRollup tests [P] → tester-A
- **File:** `packages/flows/src/receipts.test.ts`
- **Snippet:** `.strict()` reject extra keys; `parseReceipts(x, taskIds)` reject unknown task id; omit taskIds allows `tasks: {}`; `readRunRollup` never takes InstanceStatus; fail without `errorCode` rejected
- **Verify:** `bun --filter @kit/flows test` (`ready` — FAIL until T4/T6)
- **Expected:** failing tests compiled
- **Time:** 5 min | **Difficulty:** 2
- **Traces:** N3, N4 | **Phase:** RED | **Subject:** receipts

#### Task 3: RED driveFlowRun tests [P] → tester-B
- **File:** `apps/example-api/src/flows-run/drive.test.ts`
- **Snippet:** memory D1 insert plan+run `queued`; tampered snapshot → `failed` + `RUNNER_VIEW_INVALID` + invoke count 0; `view.orgId` mismatch → `ORG_MISMATCH`; stub interpret `readyTaskIds=[]` → ports idle; two drives same queued id → second claim `changes=0` no dispatch; invoke-only fixture → `tasks.<id>.outcome=ok` + `status=succeeded`
- **Verify:** `bun --filter @kit/example-api test src/flows-run/drive.test.ts` (`ready` — FAIL until T8)
- **Expected:** file exists, tests fail on missing `driveFlowRun`
- **Time:** 10 min | **Difficulty:** 4
- **Traces:** S1, S4, T2, T3, N1 | **Phase:** RED | **Subject:** driver

#### Task 4: Implement parseReceipts + consts [P] → backend-dev-A
- **File:** `packages/flows/src/receipts.ts`
- **Snippet:** `receiptBundleSchema` z.strict(); `parseReceipts(input, taskIds?)`; `FLOW_RUN_STATUSES`; `TASK_RECEIPT_OUTCOMES`; types `ReceiptBundle`, `TaskReceipt`
- **Verify:** `grep -q parseReceipts packages/flows/src/receipts.ts` (`ready`)
- **Expected:** module compiles; no `cloudflare:workers`
- **Time:** 5 min | **Difficulty:** 2
- **Traces:** N3, N4 | **Phase:** GREEN | **Subject:** receipts

#### Task 5: Implement interpretRun [P] → backend-dev-B
- **File:** `packages/flows/src/interpret.ts`
- **Snippet:** reducer per spec §6: skip iff dep fail\|skip; ready iff all deps ok and no self receipt; pending else; do not emit waiting; input waiting / cycle / unknown after / DAG_STUCK → failed; V0 succeeded ⇔ every task id present ∧ all `ok`
- **Verify:** `bun --filter @kit/flows test` (`deferred` until T12)
- **Expected:** T1 cases can pass
- **Time:** 10 min | **Difficulty:** 4
- **Traces:** N2 | **Phase:** GREEN | **Subject:** interpret

#### Task 6: readRunRollup + barrel → backend-dev-A
- **File:** `packages/flows/src/receipts.ts`, `packages/flows/src/index.ts`
- **Snippet:** `readRunRollup({ status, receiptJson, errorCode })` → parsed status + receipts; export interpret + receipts from index; still no `cloudflare:workers`
- **Verify:** `grep -q readRunRollup packages/flows/src/index.ts && ! grep -q cloudflare:workers packages/flows/src/*.ts` (`ready`)
- **Expected:** public API matches spec kit table
- **Time:** 4 min | **Difficulty:** 2
- **Traces:** N4 | **Phase:** GREEN | **Subject:** receipts

#### Task 7: D1 claim + persist helpers → backend-dev-C
- **File:** `apps/example-api/src/flows-run/persist.ts`
- **Snippet:** `loadRun(db, runId, orgId)`; `claimRun(...)` = `UPDATE … SET status='running', workflow_instance_id=? WHERE id=? AND org_id=? AND status='queued'` return changes; `persistBundle(...)` writes receipt_json + status + error_code + updated_at
- **Verify:** `grep -q status=.queued apps/example-api/src/flows-run/persist.ts` (`ready`)
- **Expected:** CAS predicate present; file &lt; 300 lines
- **Time:** 6 min | **Difficulty:** 3
- **Traces:** S4 | **Phase:** GREEN | **Subject:** persist

#### Task 8: driveFlowRun loop → backend-dev-C
- **File:** `apps/example-api/src/flows-run/drive.ts`
- **Snippet:** `driveFlowRun({ step, db, invoke, infer, interpret? })`: params via `z.object({runId,orgId}).strict()`; claim; parseRunnerView + parseReceipts — **drop raw**; org match; loop interpret → sequential step.do only for `readyTaskIds`; persist each wave inside `step.do`; persist failure → failed + throw NonRetryableError; never SELECT flow_plans
- **Verify:** `grep -q interpretRun apps/example-api/src/flows-run/drive.ts && ! grep -q flow_plans apps/example-api/src/flows-run/drive.ts` (`ready`)
- **Expected:** only readyTaskIds dispatched; &lt; 300 lines
- **Time:** 10 min | **Difficulty:** 5
- **Traces:** S1, N1, N2, SC dual-path | **Phase:** GREEN | **Subject:** driver

#### Task 9: FlowRunWorkflow + export [P] → backend-dev-D
- **File:** `apps/example-api/src/flows-run/workflow.ts`, `apps/example-api/src/index.ts`
- **Snippet:** `export class FlowRunWorkflow extends WorkflowEntrypoint { run(event, step) { return driveFlowRun({ step: step.do.bind(step), …, payload: event.payload, instanceId: event.instanceId }) } }`; export class from `src/index.ts`
- **Verify:** `grep -q FlowRunWorkflow apps/example-api/src/index.ts` (`ready`)
- **Expected:** wrangler `class_name` resolves
- **Time:** 5 min | **Difficulty:** 3
- **Traces:** S1, S5 | **Phase:** GREEN | **Subject:** workflow

#### Task 10: wrangler + Env inventory [P] → devops-A
- **File:** `apps/example-api/wrangler.toml`, `src/env.schema.ts`, `src/env.ts`, `src/test/memory-env.ts`
- **Snippet:** `[[workflows]]` + `[[env.production.workflows]]` with **distinct** `name` (`example-api-flow-run` / `boilerplate-api-flow-run`), `binding = "FLOW_RUN"`, `class_name = "FlowRunWorkflow"`; `WORKER_BINDINGS` += `FLOW_RUN`; `Env.FLOW_RUN: Workflow<{runId,orgId}>`; memory-env stubs `FLOW_RUN` so Hono tests typecheck
- **Verify:** `grep -n 'FLOW_RUN' apps/example-api/wrangler.toml apps/example-api/src/env.schema.ts` (`ready`)
- **Expected:** both env blocks have `name` + binding + class
- **Time:** 6 min | **Difficulty:** 3
- **Traces:** S5, N6 | **Phase:** GREEN | **Subject:** config

#### Task 11: echo invoke port + invoke-only fixture → backend-dev-D
- **File:** `apps/example-api/src/flows-run/ports.ts`, `apps/example-api/src/flows-run/fixtures.ts`
- **Snippet:** `invokeEcho(args)` returns short text; `retries: { limit: 0 }`; step name `invoke:${taskId}`; fixture YAML one `echo` task (not `DEMO_ECHO_PLAN_YAML`); catch inside step → `INVOKE_FAILED`
- **Verify:** `grep -q echo_hello apps/example-api/src/flows-run/fixtures.ts && ! grep -q summarize apps/example-api/src/flows-run/fixtures.ts` (`ready`)
- **Expected:** V1 fixture has no infer
- **Time:** 5 min | **Difficulty:** 2
- **Traces:** S2, T1 fixture SC | **Phase:** GREEN | **Subject:** ports

#### Task 12: GREEN kit tests → tester-A
- **File:** `packages/flows/src/interpret.test.ts`, `receipts.test.ts`
- **Snippet:** flip T1/T2 to pass; add any missing edge from spec §6
- **Verify:** `bun --filter @kit/flows test` (`ready`)
- **Expected:** exit 0
- **Time:** 5 min | **Difficulty:** 2
- **Traces:** T1, N2, N3 | **Phase:** GREEN | **Subject:** parser

#### Task 13: GREEN drive + dual-path behavioral → tester-B
- **File:** `apps/example-api/src/flows-run/drive.test.ts`
- **Snippet:** all T3 cases green; extra: enabled=false on plan row ignored; live plan_json edit ignored; inject interpret ready=[] ⇒ invoke/infer not called
- **Verify:** `bun --filter @kit/example-api test src/flows-run/drive.test.ts` (`ready`)
- **Expected:** exit 0
- **Time:** 8 min | **Difficulty:** 3
- **Traces:** T2, T3, S4 | **Phase:** GREEN | **Subject:** driver

#### RED-GATE V1: T14 → tester-A
- **Verify:** `bun --filter @kit/flows test && bun --filter @kit/example-api test src/flows-run/drive.test.ts` (`ready`)
- **Expected:** V1 demos: invoke-only succeeded all ok; tamper zero invoke; skip/parallel/pending; claim CAS
- **Phase:** RED-GATE
- **Traces:** slice V1 | **Subject:** parser

#### Task 15: Limits comment [P] → doc-writer-A
- **File:** `apps/example-api/src/flows-run/workflow.ts` (header)
- **Snippet:** 1 MiB step/event; persist-in-step; retries 0; Free 10 ms CPU; WfP unsupported; showcase = Workers Paid
- **Verify:** `grep -q '1 MiB' apps/example-api/src/flows-run/workflow.ts` (`ready`)
- **Expected:** N5 present next to class
- **Time:** 3 min | **Difficulty:** 1
- **Traces:** N5 | **Phase:** GREEN | **Subject:** docs

### Slice V2: Infer + actual-token abort

#### Task 16: RED two-infer meter tests [P] → tester-C
- **File:** `apps/example-api/src/flows-run/infer.test.ts`
- **Snippet:** legal two-infer snapshot (`static ≤ plan.max`); first mock actual leaves remaining &lt; second declared → second `TOKEN_CEILING`, InferPort call count === 1
- **Verify:** `bun --filter @kit/example-api test src/flows-run/infer.test.ts` (`ready` — FAIL until T17)
- **Expected:** failing test exists
- **Time:** 6 min | **Difficulty:** 3
- **Traces:** S3, V2 | **Phase:** RED | **Subject:** meter

#### Task 17: InferPort + sequential meter → backend-dev-C
- **File:** `apps/example-api/src/flows-run/drive.ts` (+ call site to `ports.ts` InferPort from D)
- **Snippet:** sequential infer; declared = `max_tokens ?? DEFAULT_INFER_MAX_TOKENS`; abort before call if `tokensUsed + declared > hard`; after mock if actual would overflow → `TOKEN_CEILING` (do not keep overflow in tokensUsed); missing port → `INFER_FAILED`; step name `infer:${taskId}`; retries 0
- **Verify:** `grep -q TOKEN_CEILING apps/example-api/src/flows-run/drive.ts` (`ready`)
- **Expected:** meter in drive, not a second walker
- **Time:** 8 min | **Difficulty:** 4
- **Traces:** S3 | **Phase:** GREEN | **Subject:** driver

#### Task 18: GREEN infer tests → tester-C
- **File:** `apps/example-api/src/flows-run/infer.test.ts`
- **Verify:** `bun --filter @kit/example-api test src/flows-run/infer.test.ts` (`ready`)
- **Expected:** exit 0, InferPort === 1 on overrun fixture
- **Time:** 4 min | **Difficulty:** 2
- **Traces:** S3 | **Phase:** GREEN | **Subject:** meter

#### RED-GATE V2: T19 → tester-C
- **Verify:** same as T18 + `@kit/flows test` still green (`ready`)
- **Expected:** V2 demo
- **Phase:** RED-GATE
- **Subject:** meter

### Slice V3: Persist XOR + close-ban

#### Task 20: Persist-failure path → tester-B
- **File:** `apps/example-api/src/flows-run/drive.test.ts`
- **Snippet:** inject persist throw after work → row `failed` or not `succeeded`; `readRunRollup` ignores CF; no `succeeded` without parseable bundle
- **Verify:** `bun --filter @kit/example-api test src/flows-run/drive.test.ts` (`ready`)
- **Expected:** persist-fail case green (may need tiny hook in persist port — not a SKIP_PERSIST production flag)
- **Time:** 6 min | **Difficulty:** 3
- **Traces:** S4, V3 | **Phase:** GREEN | **Subject:** driver

#### Task 21: Deploy runbook line [P] → doc-writer-A
- **File:** `docs/deploy-cloudflare.md`
- **Snippet:** one line: first production deploy creates Workflow `boilerplate-api-flow-run`; showcase must be Workers Paid; Workflows ≠ WfP
- **Verify:** `grep -q flow-run docs/deploy-cloudflare.md` (`ready`)
- **Expected:** runbook mentions Workflow name
- **Time:** 3 min | **Difficulty:** 1
- **Traces:** N5 | **Phase:** GREEN | **Subject:** docs

#### RED-GATE V3: T22 → tester-B
- **Verify:** `bun --filter @kit/flows test && bun --filter @kit/example-api test src/flows-run/` (`ready`)
- **Expected:** V1–V3 green. PR later: `Fixes #30` only; body says “epic 16 and tracker 72 stay open” — **do not** write `close #16`
- **Phase:** RED-GATE
- **Traces:** T4 close-ban | **Subject:** driver

## Task Seeding Blueprint

<!-- Used by /implement to seed TaskCreate calls on session start.
     Format: T{n} | agent-instance | blockedBy | subject
     Seed in wave order; within a wave all rows are parallel (∥). -->

### Wave 1 — no deps, 3 agents ∥

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T1 | tester-A | — | parser |
| T2 | tester-A | — | receipts |
| T3 | tester-B | — | driver |
| T10 | devops-A | — | config |

### Wave 2 — after Wave 1 RED files exist, 2 agents ∥

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T4 | backend-dev-A | T2 | receipts |
| T5 | backend-dev-B | T1 | interpret |

### Wave 3 — after T4, 2 agents ∥

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T6 | backend-dev-A | T4 | receipts |
| T7 | backend-dev-C | T3 | persist |

### Wave 4 — after T5+T7, 1 agent

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T8 | backend-dev-C | T5, T7 | driver |

### Wave 5 — after T8, 2 agents ∥

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T9 | backend-dev-D | T8 | workflow |
| T11 | backend-dev-D | T8 | ports |
| T15 | doc-writer-A | T9 | docs |

### Wave 6 — GREEN V1 + gate

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T12 | tester-A | T5, T6 | parser |
| T13 | tester-B | T8, T11 | driver |
| T14 | tester-A | T12, T13 | parser |

### Wave 7 — V2 RED + impl

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T16 | tester-C | T14 | meter |
| T17 | backend-dev-C | T8, T16 | driver |

### Wave 8 — V2 GREEN + V3

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T18 | tester-C | T17 | meter |
| T19 | tester-C | T18 | meter |
| T20 | tester-B | T13 | driver |
| T21 | doc-writer-A | T15 | docs |

### Wave 9 — V3 gate

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T22 | tester-B | T19, T20, T21 | driver |

## Task IDs

<!-- Generated by /plan. Used by /implement to resume tasks on session restart. -->
- T1: T1 — parser
- T2: T2 — receipts
- T3: T3 — driver
- T4: T4 — receipts
- T5: T5 — interpret
- T6: T6 — receipts
- T7: T7 — persist
- T8: T8 — driver
- T9: T9 — workflow
- T10: T10 — config
- T11: T11 — ports
- T12: T12 — parser
- T13: T13 — driver
- T14: T14 — parser
- T15: T15 — docs
- T16: T16 — meter
- T17: T17 — driver
- T18: T18 — meter
- T19: T19 — meter
- T20: T20 — driver
- T21: T21 — docs
- T22: T22 — driver
