---
title: "feat(flows): admin API P1 — plans/runs, enable, org_id, admin gate"
issue: 31
status: approved
normative: false
tier: F-full
date: 2026-08-19
---

## Problem

`@kit/flows` can check a plan, seal a `RunnerView`, and persist org-scoped `flow_plans` / `flow_runs` (#28–#29). `driveFlowRun` interprets a sealed snapshot on CF Workflows and writes typed receipts (#30). Nothing **exposes** that lifecycle over HTTP: `app.ts` has no flows routes; dogfood is in-process (`flows-dogfood.ts`); tests insert `queued` and call `driveFlowRun` directly. `canCreateFlowRun` exists and already fail-closes `api_key` / omitted `authMethod`, but no route calls it.

Without an admin API, D3 (governed plan E2E) cannot start: no YAML ingest, no server-side grant mint, no org-scoped list/get, no enable/disable that blocks **new** runs only. The silent-ok class #30 closed would come back if Hono walked `sealedPlan.tasks` or treated `Workflow.complete` / HTTP 200 as success.

Why now: #30 is closed; #31 is the sole critical-path open child of #16 that blocks HITL (#32) and the console (#33).

Observable impact today: freeze + Workflows adapter + D1 tables; zero `/api/…/flows` (or equivalent) routes; GET cannot use `readRunRollup` because nothing lists runs for an org.

## Who

- **Primary:** kit maintainers wiring example-api admin HTTP so a session org-admin can publish a plan and start a durable run.
- **Secondary:** later #32/#33 authors (must consume this API + `readRunRollup`; must not invent a second sequencer). Product forks composing the same routes pattern.

## Constraints

- ADR-0005 D4/D5: grants minted **server-side** from session / org module policy — never from plan body, client allowlist, or agent self-description. Persist **`runnerView` JSON only**; rehydrate with `parseRunnerView` (fail-closed). Grant audit is a separate object — do not collocate on the runner blob.
- V0 create-run: `canCreateFlowRun` — explicit **session** + org admin (or `super_admin`). `sk_` / omitted `authMethod` → deny. Read may allow `sk_` later; do not silently enable write.
- Multi-tenant: every query/mutation filters `org_id` (membership + module `flows`). Run.org_id must match plan.org_id (service CHECK if schema residual from #29). IDOR matrix required (cross-org 404/403, no existence leak on private ids if that is the example-api convention).
- Start Workflow with params `{ runId, orgId }` only — do **not** embed `runnerView` in the create payload (1 MiB). Insert run `status='queued'`; Workflow claims `running` and writes terminal rollup. GET/list use `readRunRollup(row)` — never `instance.status()`.
- `enabled=false` blocks **new** runs only; in-flight snapshots keep executing (#30 invariant).
- Layers: routes → services → repos. No D1 in routes; no second `runPlanLocally()` loop in Hono. Follow `tasks.ts` org middleware pattern (`requireAuth` + `requireOrgContext` + `requireModule`).
- Auth: human review required. Landing PR closing keyword references issue **31 only** — do not write `close #16` / `fix #16` (or 72).
- 0 product métier strings. Dogfood YAML stays kit echo (existing `DEMO_ECHO_PLAN_YAML`).

## Out of Scope

- HITL `waitForEvent` / principal-bound approve (#32).
- Console `/admin/flows` (#33).
- Authoring UI / agent-draft (#34).
- Runtime token meter / agent verb (#35).
- `permits.net` / `r2` enforced wrappers (#36).
- Closing epic #16 or platform tracker #72.
- Promoting `@kit/flows` out of incubating (ADR-0005 D6 still needs second compose).
- Dual-write of grant allowlists from the client. Ambient tool registries.
- New `@kit/flows-ui` package (P2).

## Premise Validity

**Success in 6 months:** an org admin session can POST a YAML plan (`check` → store JSON + digest), POST a run (server mint → snapshot → Workflow start), GET list/detail scoped by `org_id` via `readRunRollup`, and PATCH enable/disable so disabled plans reject new runs only. `sk_` create-run stays off. IDOR tests green. #32/#33 have an HTTP contract to compose.

**Failure in 6 months:** a route walks `sealedPlan.tasks` (or treats CF `complete` / HTTP 200 as `succeeded` with null receipts); or grants are accepted from the client; or GET uses `instance.status()`; or a member/`sk_` creates a run; or cross-org list/get leaks a row; or the PR closes #16/#72.

**Simplest alternative:** wrap `dogfoodPlanToSnapshot` in one POST that returns the snapshot JSON, no D1 write, no Workflow create, no org gate.
**Why not simplest:** that reopens the silent-ok class #30 existed to close, skips IDOR, and leaves D3 (durable governed run) unmet — #32/#33 would have nothing honest to call.

## Complexity

**Tier: F-full** — HTTP + auth/IDOR + grant mint + D1 lifecycle + Workflow start; several domains even though one epic slice. Patterns exist (`tasks.ts` org middleware, `canCreateFlowRun`, `driveFlowRun`, `readRunRollup`); this is the first writer of the public flows surface.

Signals: multi-layer example-api (routes/services/repos) + `@kit/flows` compose; parent #16 open; blocks #32/#33/#36; auth human review; no product UI.
