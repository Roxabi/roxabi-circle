---
title: "feat(flows): CF Workflows adapter — interpret snapshot → step.do"
description: "Interpret a sealed RunnerView on Cloudflare Workflows via one pure interpretRun; persist typed receipts ≠ CF instance status."
type: spec
status: approved
normative: false
issue: 30
tier: F-full
---

## Context

**Promoted from:** [frame #30](../frames/30-flows-cf-workflows-adapter-frame.md) (F-full; analysis skipped — advisory 2026-08-13 after silex-engine lessons + adversarial kill of the “note before #30” gate). Expert pass 2026-08-13 folded into this draft (architect · product-lead · doc-writer · devops · axial · adversarial).
**GitHub issue:** [#30](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/30)
**Parent:** epic 16 · **Blocked by:** #28 ✓ · #29 ✓ · **Blocks:** #31 (full) · #32 (partial) · #35
**Refs:** ADR-0005 D2/D4 · ADR-0001 · `packages/flows` (`parseRunnerView`, `createRunSnapshot`, `check.ts` DAG, `budget.ts`) · `apps/example-api` migration `0012_flows_plans_runs.sql` · CF Workflows: event/step result **1 MiB**, Rules of Workflows (side effects inside `step.do`), default step retries 5×

## Intent

Sealed snapshots and D1 run rows exist; nothing durable **executes** them. If #31 ships first, Hono will become a second sequencer and CF `complete` will be misread as application success — the silent-ok class already seen in silex-engine. Why now: #30 is the only critical-path open child; transfer lessons (receipts, one interpreter, close-ban) must be AC on this ticket, not a prior docs gate.

## Goal

A dogfood `RunnerView` stored in `flow_runs.snapshot_json` is executed only by `driveFlowRun` (Workflow + tests) calling `@kit/flows` `interpretRun`; every plan task ends as typed `ok`, `skip`, or `fail`; V0 `succeeded` means **all tasks `ok`**; a `skip` never makes the row `succeeded`; `run()` does not return success without a parseable persisted bundle; the landing PR’s closing keyword references issue **30 only**.

## Users

- **Primary:** kit maintainer running example-api tests / local wrangler — insert run (`status=queued`) + `FLOW_RUN.create`, inspect D1 receipts.
- **Secondary:** #31 author — must read rollup via `readRunRollup(row)`, never from `instance.status()`.

## Expected Behavior

1. Test (or later #31) inserts `flow_plans` + `flow_runs` with `status='queued'` and `snapshot_json = JSON.stringify(runnerView)` from `createRunSnapshot`. Grant audit is **not** in that blob. Use an **invoke-only** fixture for V1 — do **not** insert raw `DEMO_ECHO_PLAN_YAML` (it includes `summarize` infer).
2. Caller invokes `env.FLOW_RUN.create({ id: runId, params: { runId, orgId } })` (`runId` length 1..100, Workflow instance-id charset). Params schema is `z.object({ runId, orgId }).strict()` — extra keys (including a snapshot) rejected. `run()` reads **`event.payload`** and **`event.instanceId`**. Snapshot is **not** in params.
3. First durable step **claims** the row: `UPDATE flow_runs SET status='running', workflow_instance_id=?, updated_at=? WHERE id=? AND org_id=? AND status='queued'`. `changes=0` → `NonRetryableError` (no dispatch). Load always `id + org_id`. Missing row → fail-closed, no tool call, no existence leak.
4. Every read of `snapshot_json` / `receipt_json` goes through `parseRunnerView` / `parseReceipts`. **Dispatch and interpret use only the parsed objects** — drop the raw strings. Tamper / schema fail → persist `{ receiptVersion: 1, tokensUsed: 0, tasks: {} }`, `status=failed`, `error_code=RUNNER_VIEW_INVALID` (snapshot) or `RECEIPTS_INVALID` (bundle), **zero** invoke/infer `step.do`. After parse ok, require `view.orgId === params.orgId === row.org_id` else same fail-closed (`ORG_MISMATCH`).
5. Workflow never `SELECT`s `flow_plans.plan_json` / `yaml_source` for execution. Live plan edits and `enabled=false` do not change this instance.
6. **`interpretRun(view, receipts)`** (pure, `@kit/flows`) is a **reducer**, not “ready or terminal”:

   ```text
   interpretRun(view, receipts) → {
     receipts,          // input + newly computed skips (never echoes waiting)
     readyTaskIds,      // only these may be dispatched
     rollup,            // 'running' | 'succeeded' | 'failed'
     stuck?             // CYCLE | UNKNOWN_TASK_EDGE | DAG_STUCK | WAITING_NOT_SUPPORTED
   }
   ```

   Rules:
   - **skip** iff some `after` dep has outcome `fail` or `skip` (transitive cascade).
   - **ready** iff every `after` dep is `ok` **and** self has no receipt yet.
   - **pending** otherwise (do not emit `waiting` in #30).
   - Input `waiting` → `rollup=failed`, `readyTaskIds=[]`, `stuck=WAITING_NOT_SUPPORTED`.
   - Cyclic / unknown `after` → fail-closed (`CYCLE` / `UNKNOWN_TASK_EDGE`), not an infinite `running` loop.
   - `readyTaskIds=[]` and not all tasks terminal and no `fail` → `DAG_STUCK` / `failed`.
   - **V0 rollup:** `succeeded` ⇔ every `sealedPlan.tasks` id present **and** every outcome is `ok`. `failed` ⇔ any `fail` **or** `stuck`. Else `running`.

   `driveFlowRun` (app, next to the Workflow class) is the **only** loop: rehydrate from D1 → `interpretRun` → `step.do` for **each** `readyTaskIds` entry **sequentially** → persist. Hono / services / jobs must not walk the DAG to execute.

7. `invoke` only if `tool ∈ view.executionTools` and the app registry still has that name; else task `fail` (`TOOL_NOT_IN_EXECUTION_TOOLS` / `UNKNOWN_TOOL`). Catch **inside** `step.do`; return `{ outcome:'fail', errorCode:'INVOKE_FAILED' }` — do **not** rethrow (CF default retries would re-invoke). V0 invoke/infer steps use `retries: { limit: 0 }`. Step names are deterministic: `invoke:${taskId}`, `infer:${taskId}`.
8. `infer` only if `view.allowsInfer` (a snapshot that fails this is already rejected by `parseRunnerView` — belt-and-suspenders, not a second grant path). Meter **actual** tokens from InferPort. Declared size for remaining budget = `task.infer.max_tokens ?? DEFAULT_INFER_MAX_TOKENS`. Before the call, if `tokensUsed + declared > hardMaxTokens`, task `fail` `TOKEN_CEILING`, **no** InferPort call. After the mock, if `tokensUsed + actual > hardMaxTokens`, same `fail` (do not keep the overflow in `tokensUsed`). V0 InferPort is a test/local mock. Missing port + infer task → `INFER_FAILED`. Sequential only (no `Promise.all` of infers).
9. Skip V0: only the cascade in §6. No other skip source. `waiting` is in the enum; **no producer**.
10. **Persist is a `step.do`.** Every D1 write (claim, receipts, rollup) lives inside a named step. Each wave **rehydrates** the bundle from D1 before `interpretRun` (no in-memory-only accumulator across replays). Before `run()` returns, a parseable bundle is persisted and rollup is `succeeded` or `failed`. If persist cannot be completed, persist `failed` when possible and throw `NonRetryableError` so the CF instance is **`errored`**, not `complete`. `readRunRollup(row)` returns app status + parsed receipts and **never** reads `InstanceStatus`.
11. Step return values are small (`{ outcome, errorCode?, tokens? }`). Tool/LLM text lives in D1 receipts under a **4 KiB** cap, not in Workflow step state.
12. Landing PR: closing keyword (`Fixes` / `Closes` / `Resolves`) may reference **issue 30 only**. Do **not** put the substrings `close #16`, `closes #16`, `fix #16`, or the same for 72, in title or body — `.github/workflows/close-linked-issues.yml` matches `close #N` **without** a word boundary and would close the epic. Prefer “epic 16 and tracker 72 stay open.”

## Data Model & Consumers

### Three vocabularies (normative)

| Vocabulary | Where | Allowed values (V0) | Who writes |
|------------|--------|---------------------|------------|
| **App rollup** | `flow_runs.status` | `queued` \| `running` \| `succeeded` \| `failed` \| `cancelled` | **Insert / #31** writes `queued`. **Workflow** writes `running` (claim) and terminal `succeeded`/`failed`. `cancelled` unused until terminate (#31). |
| **CF instance** | `workflow_instance_id` + `instance.status()` | CF `InstanceStatus` (`queued`, `running`, `complete`, `errored`, `terminated`, `waiting`, …) | Cloudflare. **Never copied** into `flow_runs.status`. `complete` ≠ `succeeded`. |
| **Task receipts** | `flow_runs.receipt_json` | per-task `ok` \| `skip` \| `fail` \| `waiting` | Workflow via `interpretRun` + dispatch |

`waiting` on a **task** ≠ CF instance `waiting`. #30 types the former and does not produce it.

Row `error_code` = **run-level** only (`RUNNER_VIEW_INVALID`, `RECEIPTS_INVALID`, `ORG_MISMATCH`, stuck codes). Task failures stay in `receipt_json`.

### Receipt bundle (`receipt_json`)

```text
receiptVersion: 1
tokensUsed: number ≥ 0
tasks: { [taskId]: { taskId, outcome, errorCode?, output? } }
```

`parseReceipts(input, taskIds?: readonly string[])` — `.strict()`, version literal `1`.

| Field | Rules |
|-------|--------|
| `outcome` | `ok` \| `skip` \| `fail` \| `waiting` |
| `errorCode` | required when `fail` |
| `output` | optional, redacted, **≤ 4 KiB** (truncate) |
| unknown keys | reject |
| `taskIds` passed | reject ids not in the set; missing ids allowed while `running` |
| `taskIds` omitted | structural only (error-bundle path uses `{ tasks: {} }`) |

V0 **`succeeded`** requires every plan task id present and every outcome `ok`. A `skip` in the bundle ⇒ rollup is **`failed`** (a fail exists, or defensive if not).

### Workflow params

```text
z.object({ runId: z.string().min(1).max(100), orgId: z.string().min(1).max(256) }).strict()
```

Load: `flow_runs` where `id = runId AND org_id = orgId`.

### Kit additions (`@kit/flows`, still no Worker bindings)

| Export | Role |
|--------|------|
| `interpretRun(view, receipts)` | Pure reducer (§6). **Same function** Workflow and unit tests call. |
| `parseReceipts` / `receiptBundleSchema` | Fail-closed rehydrate |
| `FLOW_RUN_STATUSES` | rollup union |
| `TASK_RECEIPT_OUTCOMES` | including `waiting` |
| `readRunRollup(row)` | Parse status + receipts; **no** CF status. #31 uses this. |

No `runPlanLocally`, no `step.do`, no `cloudflare:workers` inside the package.

### App additions (`apps/example-api`)

| Artifact | Role |
|----------|------|
| `driveFlowRun(ports)` | Sole execution loop. Ports: `step`, D1 load/claim/persist, invoke, infer. Lives next to the Workflow class (split files — `tools/check_file_length.sh` max 300). |
| `FlowRunWorkflow` | `run` = `driveFlowRun({ step: step.do, … })`. Exported from `src/index.ts`. |
| `[[workflows]]` | See wrangler table below |
| Invoke port | dogfood `echo` only |
| Infer port | **mock in tests / local V0** |
| Test harness | insert `queued` + `driveFlowRun` with immediate `step` + memory D1. **No new public HTTP route.** `createMemoryEnv` stubs `FLOW_RUN` so existing Hono tests keep typechecking. |

`driveFlowRun` is **not** a second DAG walker: it only dispatches `interpretRun.readyTaskIds`. Tests use the same function with an immediate `step` port (callback runs now). This is **not** a `#30` ship gate for `@cloudflare/vitest-pool-workers` (parked, spec 21). Honest residual: V0 does **not** prove `env.FLOW_RUN.create` under workerd.

### Wrangler (required fields)

`workflows` is **non-inheritable**. Distinct **`name`** per env (account-scoped, ≤64):

```toml
[[workflows]]
binding = "FLOW_RUN"
name = "example-api-flow-run"
class_name = "FlowRunWorkflow"

[[env.production.workflows]]
binding = "FLOW_RUN"
name = "boilerplate-api-flow-run"
class_name = "FlowRunWorkflow"
```

`WORKER_BINDINGS` includes `FLOW_RUN`. `Env` includes `FLOW_RUN: Workflow<{ runId: string; orgId: string }>`.

### Consumers

| Consumer | Fields | Status |
|----------|--------|--------|
| `driveFlowRun` / `FlowRunWorkflow` | snapshot, receipts, status, instance id | **this issue** |
| `interpretRun` / `parseReceipts` / `readRunRollup` tests | view + bundle | **this issue** |
| Admin GET/list | via `readRunRollup` | **#31** |
| HITL | `waiting` producer + `waitForEvent` | **#32** |
| Platform proof D3 | publish → run → HITL | tracker 72 (still Not met) |

## Steal / refuse (constraints, not a ticket)

| Transfer (AC here) | Refuse (OOS) |
|--------------------|--------------|
| Silent miss forbidden — skip is an explicit receipt; V0 `succeeded` = all `ok` | Flint / Nika / rclone / VPS health |
| CF `complete` is not app success — persist bundle then `succeeded\|failed`; else instance `errored` | Digest/Lucy plans under `packages/*` |
| Rehydrate fail-closed; **execute parsed objects only** | Engine issue 2 as predecessor |
| One interpreter — `readyTaskIds` is the only dispatch set | Dual `*_impl.main()` / a Node `runPlan*` that walks tasks |

## Breadboard

### Affordance table

| ID | Element | Handler | Data |
|----|---------|---------|------|
| N1 | `parseRunnerView` then **drop raw**; execute parsed view only | `driveFlowRun` rehydrate | `snapshot_json` |
| N2 | `interpretRun` reducer (§6) | `@kit/flows` | sealed DAG + bundle |
| N3 | `parseReceipts(input, taskIds?)` | `@kit/flows` | `receipt_json` |
| N4 | `FLOW_RUN_STATUSES` / outcomes / `readRunRollup` | `@kit/flows` | rollup + task enums |
| S1 | `FlowRunWorkflow.run` → `driveFlowRun` | `event.payload` + `event.instanceId` | params `{runId,orgId}` |
| S2 | `step.do('invoke:'+id)` | invoke port ∩ `executionTools`; catch inside; retries 0 | echo dogfood |
| S3 | `step.do('infer:'+id)` + actual-token meter | InferPort mock; sequential | `tokensUsed` vs `hardMaxTokens` |
| S4 | Claim + persist **inside** `step.do` | `UPDATE … AND status='queued'`; then receipts + rollup | D1 |
| S5 | `[[workflows]]` names + export class | wrangler default **and** production | binding `FLOW_RUN` |
| N5 | Limits note (1 MiB, persist-in-step, retries 0, Free 10 ms CPU, WfP, Paid showcase) | comment beside workflow module + one deploy-runbook line | — |
| T1 | Unit tests `interpretRun` | vitest `@kit/flows` | see slice demos |
| T2 | `driveFlowRun` + immediate step + memory D1 | Node vitest (existing `environment: 'node'`) | assert D1 receipts |
| T3 | Dual-path **behavioral** | stub `interpretRun` → `readyTaskIds=[]` ⇒ invoke/infer **not** called; independent parallel still ready | app src except display |
| T4 | Close-ban | PR title+body: closing keyword → issue 30 only; no `close #16` / `fix #16` / same for 72 | human + PR checklist |
| N6 | `WORKER_BINDINGS` + `Env.FLOW_RUN` + memory-env stub | `env.schema.ts` / `env.ts` / `memory-env.ts` | inventory |

### Wiring

```text
insert status=queued + snapshot_json
        │
        ▼
FLOW_RUN.create({ id: runId, params: { runId, orgId } })     ── S5
        │
        ▼
S1 run → driveFlowRun
        │
        ▼
S4 claim (CAS queued→running + instance id)
        │
        ▼
N1 parse view (drop raw) ── fail ──► S4 failed + empty bundle + NonRetryableError
        │ ok + org match
        ▼
loop: N3 parse receipts from D1 → N2 interpretRun
        │ readyTaskIds[]
        ▼
   S2 / S3 sequential step.do (small return, catch inside)
        │
        ▼
   S4 persist bundle + rollup
        │
        └── terminal succeeded|failed; if persist fails → failed + errored (not complete)

Hono/services/jobs ─✗─► execute DAG
display (#31) may list task ids without calling tools
```

## Slices

| # | Name | Scope (IDs) | Demo criteria |
|---|------|-------------|---------------|
| V1 | Rehydrate + invoke + interpret contract | N1–N4, S1, S2, S4, S5, N5, N6, T1, T2, T3 | Invoke-only fixture → `receipt_json.tasks.echo_hello.outcome=ok`, **all** plan tasks `ok`, `status=succeeded`, `workflow_instance_id` set. Tampered snapshot → `failed` + empty bundle + **zero** invoke. `interpretRun` ready=[] ⇒ ports idle. Dep fail → dependents `skip`; independent sibling stays ready. A→B→C after A=`ok` ⇒ B ready, C pending. Two `create` ⇒ one dispatch. |
| V2 | Infer + actual-token abort | S3, T1/T2 | Legal **two-infer** snapshot (`static ≤ plan.max`). First mock `actual` leaves remaining `<` second declared → second `fail` `TOKEN_CEILING`, InferPort call count **=== 1**. |
| V3 | Persist XOR + close-ban | S4, T2, T4 | Persist step throws → row is `failed` or still not `succeeded`, instance not treated as app success (`readRunRollup` ignores CF). PR closing keyword = issue 30 only. |

One PR is allowed if all three demo; order is dependency, not three merges. Cascade/stuck live in **V1** (not deferred to V3).

## Success Criteria

- [ ] `@kit/flows` exports `interpretRun`, `parseReceipts`, `readRunRollup`, receipt/status consts; package has **no** `cloudflare:workers` import
- [ ] `interpretRun` matches the §6 reducer (skip / ready / pending / stuck / V0 rollup); Workflow and tests call **that** function; `driveFlowRun` dispatches **only** `readyTaskIds`
- [ ] Snapshot/receipt reads: parse → **drop raw** → interpret/dispatch the parsed value; `view.orgId === params.orgId === row.org_id`; params `.strict()`
- [ ] Tamper / invalid snapshot → `status=failed`, `error_code=RUNNER_VIEW_INVALID`, empty valid bundle, **zero** invoke/infer steps
- [ ] Corrupt receipts → `status=failed`, `error_code=RECEIPTS_INVALID`, stop
- [ ] Load by **`id` + `org_id`**; claim is `UPDATE … AND status='queued'` (`changes=0` → no dispatch); `create({ id: runId, params })`
- [ ] Workflow **never** reads live `flow_plans` for execution; `enabled=false` does not stop an in-flight snapshot
- [ ] Invoke: `executionTools` ∩ registry; catch inside `step.do`; `retries.limit=0`; deterministic step names
- [ ] Infer: mock InferPort; sequential; abort on `tokensUsed + declared > hard` **or** actual overflow; V2 fixture is a **legal** two-infer snapshot with mock overrun so the **second** infer is `TOKEN_CEILING` and InferPort was called **once**
- [ ] `receipt_json` via `parseReceipts`; V0 writes `ok|skip|fail` only; `waiting` typed and **never** produced; waiting **in** input → failed (`WAITING_NOT_SUPPORTED`)
- [ ] Skip V0 = cascade only; tests include (a) fail→skip, (b) parallel independent still ready, (c) A-ok ⇒ B ready C pending
- [ ] `flow_runs.status` ∈ `queued|running|succeeded|failed|cancelled`; **never** a copy of CF `InstanceStatus`; `readRunRollup` does not consult CF
- [ ] V0 `succeeded` ⇔ parseable bundle ∧ every plan task id present ∧ **every outcome is `ok`**. Any `fail` or `skip` ⇒ not `succeeded`
- [ ] Before successful `run()` return: parseable bundle persisted and rollup `succeeded|failed`. Persist failure → `failed` when possible + `NonRetryableError` (instance `errored`, not `complete`)
- [ ] `workflow_instance_id` = `event.instanceId` after claim
- [ ] Non-stream `step.do` returns stay small; 1 MiB + persist-in-step + retries 0 + Free 10 ms CPU + WfP + Paid showcase documented next to the module
- [ ] wrangler: `binding`, **`name` (per env)**, `class_name`; class exported from `src/index.ts`; `WORKER_BINDINGS` + `Env.FLOW_RUN`; memory-env stubs the binding
- [ ] No new **public** HTTP route for create-run / list / approve
- [ ] Vitest: `interpretRun` contract (`@kit/flows`) **and** `driveFlowRun` + memory D1 (Node). pool-workers is **not** a #30 gate
- [ ] Dual-path: stub `interpretRun` → empty `readyTaskIds` ⇒ invoke/infer ports **not** called (covers services/lib/jobs/workflow, not a `routes/**` grep)
- [ ] Zero product métier strings; V1 fixture is invoke-only `echo` (not raw `DEMO_ECHO_PLAN_YAML`)
- [ ] PR closing keyword references issue **30 only**; title/body omit `close #16` / `fix #16` / `close #72` / `fix #72` (closer regex is unanchored)

## Edge Cases

| Case | Handling |
|------|----------|
| Missing D1 row / org mismatch / `view.orgId` ≠ params | Fail-closed; no dispatch |
| `snapshot_json` has `grantAudit` or extra keys | `parseRunnerView` fails → failed + empty bundle |
| `receipt_json` corrupt mid-run | `RECEIPTS_INVALID` → failed |
| Plan `enabled=false` after create | Ignore for this instance |
| Live `plan_json` edited | Ignore; snapshot only |
| Infer task, mock port absent | Task `fail` `INFER_FAILED` |
| Ceiling: declared remaining or actual overflow | That infer `fail` `TOKEN_CEILING`; dependents cascade `skip`; rollup `failed` |
| Invoke throws | Catch in step → task `fail` `INVOKE_FAILED`; no CF retry |
| Worker crash after some receipts | Row `running` + partial bundle; CF `errored`. Do not mark `succeeded`. #31 may reconcile. |
| Second `create` same `id` | CF idempotent / claim CAS: `changes=0` → no second dispatch |
| Step result would exceed 1 MiB | Truncated `output` in D1 only |
| `waiting` in a hand-crafted bundle | Fail-closed; do not echo |
| Cyclic / broken `after` in a digested blob | `interpretRun` `CYCLE` / `UNKNOWN_TASK_EDGE` → failed (not hung `running`) |
| Ready empty but pending remain without fail | `DAG_STUCK` → failed |
| WfP / dispatch namespace | Unsupported — note only (ADR-0005 D2) |
| Showcase on Workers Free | 10 ms CPU / step — document; use **Paid** |
| #31 lists `sealedPlan.tasks` for display | Allowed; must not call invoke/infer |
| Product copy of interpreter | Forbidden; import `@kit/flows` |
| File length | Split entrypoint / drive / ports / persist (`apps/` max 300) |

## Out of Scope

- HTTP admin API, 202 Accepted, grant mint, `sk_` create-run (#31)
- HITL approve / `waitForEvent` / `waiting` producer (#32)
- `/admin/flows` UI (#33)
- Authoring UI (#34), agent verb + AI Gateway product meter (#35), net/r2 (#36)
- Closing epic 16 or tracker 72; flipping platform-proof D3
- silex-engine issue 2 as blocker
- Promoting `WorkflowEntrypoint` into `packages/*`
- `@cloudflare/vitest-pool-workers` as a ship gate (honest residual: no workerd `FLOW_RUN.create` proof)
- Tightening `close-linked-issues.yml` word boundaries (call out only; optional follow-up)
- Real production LLM binding as a ship gate

## Open Questions

none — T2 harness = Node `driveFlowRun` + immediate step (not pool-workers). Claim = CAS + `create({ id: runId })`. V0 succeeded = all `ok`.
