---
title: "feat(flows): CF Workflows adapter — interpret snapshot → step.do"
issue: 30
status: approved
normative: false
tier: F-full
date: 2026-08-13
---

## Problem

`@kit/flows` can seal a `RunnerView` and example-api has org-scoped `flow_plans` / `flow_runs` (#28–#29). Nothing **interprets** a sealed snapshot on Cloudflare Workflows. `workflow_instance_id` and `receipt_json` stay null; `flow_runs.status` is an opaque string. Without a sequencer that writes typed receipts, the next HTTP slice (#31) will infer “success” from `Workflow.complete` / HTTP 200 — the same silent-ok class silex-engine already paid for (`rc=0` on skip, dry-run writing prod sinks).

Why now: #30 is the sole critical-path open child of #16; #31 is blocked by it. A markdown steal/refuse note is **not** a gate (advisory 2026-08-13). Transfer lessons belong in this issue’s AC.

Observable impact today: dogfood freeze only (`flows-dogfood.ts`); no `WorkflowEntrypoint`; wrangler has no `[[workflows]]`; runner-view comment already requires `parseRunnerView` on every read.

## Who

- **Primary:** kit maintainers wiring the durable runner before admin API.
- **Secondary:** later #31/#32 authors (must not invent a second sequencer or treat CF status as a receipt).

## Constraints

- ADR-0005 D2/D4: execute **snapshot only**; `parseRunnerView(unknown)` on every rehydrate; dispatch **only** `executionTools`; persist `runnerView` never `grantAudit`.
- ADR-0001: interpret / receipt types live in `@kit/flows` (pure). CF binding + tool/LLM ports live in `apps/example-api`. Second app must not copy the DAG walker.
- Three vocabularies: app rollup `status` ≠ CF `InstanceStatus` ≠ per-task `receipt_json`.
- Skip V0 = cascade when any `after` dep is `fail` **or** `skip` (transitive). Type `waiting`, produce **zero** waiting receipts (HITL = #32). V0 `succeeded` = every task `ok` (a `skip` never succeeds the run).
- `enabled=false` blocks **new** runs only; in-flight snapshots keep executing.
- Workflow params = `{ runId, orgId }` + load D1 (`id` + `org_id`). Do not embed `runnerView` in the create payload (1 MiB event / step-result limit).
- `driveFlowRun` writes `receipt_json` + rollup + `workflow_instance_id` inside `step.do`. `run()` does not return success without a parseable bundle; persist failure → instance `errored`, not CF `complete`.
- Landing PR closing keyword references issue **30 only**. Do not write `close #16` / `fix #16` (or 72) in the PR body — the closer regex is unanchored. Epic 16 and tracker 72 stay open.
- No public HTTP create-run (that is #31). Tests insert `queued` and call `driveFlowRun` (immediate `step` + memory D1).
- Steal from silex-engine (transfer only): silent skip≠ok forbidden; degraded ≠ empty-ok; rehydrate fail-closed. Refuse: Flint/Nika/rclone, digest plans in `packages/*`, blocked-by engine #2.

## Out of Scope

- Admin HTTP / 202 Accepted / grant mint (#31).
- HITL `waitForEvent` / principal approve (#32).
- Console `/admin/flows` (#33).
- Agent verb / AI Gateway product meter (#35).
- `permits.net` / `r2` (#36).
- Closing epic #16 or platform tracker #72.
- silex-engine XOR digest (#2) as predecessor.
- Product-domain plans or a second `runPlanLocally()` loop in Hono.

## Premise Validity

**Success in 6 months:** a sealed dogfood snapshot runs to typed receipts on CF Workflows; `skip` cannot be read as `ok`; a second product can import `interpretRun` + `parseReceipts` without copying D1 tables’ walker; #31 can expose GET without inventing rollup from `instance.status()`.

**Failure in 6 months:** `example-api` walks `sealedPlan.tasks` in a route and returns 200; or CF `complete` is stored as `succeeded` with null `receipt_json`; or #16/#72 are closed on the adapter PR.

**Simplest alternative:** one `WorkflowEntrypoint` that `for (const task of plan.tasks) step.do(...)` with no receipt types.
**Why not simplest:** that is the dual-path / silent-success failure mode the engine already demonstrated, and it leaves #31 nothing honest to return.

## Complexity

**Tier: F-full** — new CF adapter + new receipt contract + three vocabularies + axial split (pure kit vs app binding). Patterns exist (`parseRunnerView`, D1 columns, dogfood snapshot); this is the first writer of those columns.

Signals: multi-package (flows types + example-api workflow + wrangler + tests); parent #16 open; blocks #31; no product UI.
