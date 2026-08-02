---
title: "Plan: B-auth-harden — Rate limit durable + audit BO"
issue: 61
spec: artifacts/specs/61-b-auth-harden-rate-limit-audit-spec.md
complexity: 6/10
tier: F-lite
generated: "2026-08-02T16:00:00Z"
status: approved
slices: "V1 V2 V3 V4"
---

## Summary

Replace in-memory `assertRateLimit` with **async D1 atomic fixed-window** counters; add **`audit_events`** + emit hooks (incl. BA session `first_login`); expose **super_admin-only** `GET /api/admin/audit-events`; ship **`docs/auth-abuse-response.md`**. App-first in `example-api` — no new packages.

## Architecture

**Data flow:** [Data flow](../visuals/61-b-auth-harden-rate-limit-audit-data-flow.html)  
**File map:** [File map](../visuals/61-b-auth-harden-rate-limit-audit-file-map.html)

Request → `await assertRateLimit(db,…)` (atomic UPSERT) → domain → best-effort `audit.append` → response; list API reads audit newest-first.

## Bootstrap Context

- Spec approved (χ=0); frame F-lite; analysis skipped.
- Today: `apps/example-api/src/lib/rate-limit.ts` Map + sync API; call sites auth/invite/admin/mint/email/feedback.
- BA: `createBetterAuth` in `lib/better-auth.ts` — add `databaseHooks.session.create.after` for `first_login`.
- Patterns: migrations `0009_*`, Drizzle `schema.ts`, admin-users / invitations services, `AppError.rateLimited` / `.internal`.
- Next migration number: **0010** (verify at implement time).

## Agents

| Agent | Task count | Files |
|-------|-----------|-------|
| backend-dev-A | 4 | migration, schema, rate-limit.ts, call-site awaits |
| backend-dev-B | 4 | audit repo/service, emit hooks, admin-audit route, session hook |
| tester-A | 3 | RL tests, audit emit/list tests, fail-closed + secrets |
| doc-writer-A | 1 | auth-abuse-response.md + optional AGENTS one-liner |

## Wave Structure

4 waves, max 2 parallel. Elapsed ~1–1.5 day vs sequential ~2 days.

| Wave | Trigger | Agents | Tasks |
|------|---------|--------|-------|
| 1 | start | backend-dev-A | T1→T2 migration+schema → D1 rate-limit lib |
| 2 | Wave 1 | backend-dev-A ∥ backend-dev-B | T3 call sites · T4 audit core |
| 3 | Wave 2 | backend-dev-B ∥ tester-A | T5→T6 emits+route · T7 RL tests |
| 4 | Wave 3 | tester-A · doc-writer-A | T8 audit tests · T9 runbook · T10 validate:full gate |

### Budget — per task

| Task | Items | Class | Est. ops | Split? |
|------|-------|-------|----------|--------|
| T1 migration+schema | 2 | bounded | 4 | — |
| T2 D1 assertRateLimit | 1 | judgmental | 6 | — |
| T3 migrate call sites | 6 | judgmental | 8 | — |
| T4 audit repo+service | 2 | judgmental | 6 | — |
| T5 emit hooks + first_login | 4 | exploratory | 12 | — |
| T6 admin-audit route | 2 | bounded | 4 | — |
| T7 RL unit/integration | 3 | judgmental | 8 | — |
| T8 audit+gate tests | 4 | judgmental | 10 | — |
| T9 runbook | 1 | bounded | 3 | — |
| T10 validate:full | 1 | bounded | 3 | — |

**Total estimated ops: ~64** (within multi-agent budget; no single task >50)

### Budget — per agent instance

| Instance | Tasks | Σ ops | Subjects | Split? |
|----------|-------|-------|----------|--------|
| backend-dev-A | T1–T3 | 18 | schema, rate-limit, routes | — |
| backend-dev-B | T4–T6 | 22 | audit, hooks, http | — |
| tester-A | T7, T8, T10 | 21 | tests | — |
| doc-writer-A | T9 | 3 | docs | — |

## Consistency Report

| Spec SC | Covered by |
|---------|------------|
| SC1–SC4, SC6, SC14 | T1–T3, T7 |
| SC5 multi-isolate doc | T2 comment + T9 |
| SC7–SC10, SC13 | T4–T5, T8 |
| SC11–SC12 | T6, T8 |
| SC15 | T9 |
| SC16 | T10 |
| SC17 | no OTP task (absent) |
| Uncovered | none |
| Untraced tasks | none |

## Micro-Tasks

### T1 — Migration + Drizzle schema  
- **Files:** `apps/example-api/migrations/0010_rate_limit_audit.sql`, `apps/example-api/src/db/schema.ts`  
- **Agent:** backend-dev-A · subject: schema · slice: V1 · phase: GREEN  
- **Spec:** SC1 · N1, N5  
- **Snippet:**  
  - `rate_limit_buckets(bucket_key TEXT, window_start_ms INTEGER, count INTEGER, PRIMARY KEY(bucket_key, window_start_ms))`  
  - `audit_events(id, created_at, actor_user_id, action, target_type, target_id, org_id, ip, meta_json)`  
  - UNIQUE on `(action, target_id)` where action is first_login — SQLite: unique index `audit_events_first_login` on `(target_id)` WHERE `action = 'first_login'` **or** app conflict-ignore on composite unique `(action, target_id)` if SQLite partial OK  
  - Index `(created_at DESC, id)` for list  
- **Verify:** migration applies in vitest pool / `db:migrate` local  
- **Est:** 8 min · difficulty 2 · [P]

### T2 — Async D1 `assertRateLimit`  
- **File:** `apps/example-api/src/lib/rate-limit.ts`  
- **Agent:** backend-dev-A · subject: rate-limit · slice: V1 · phase: GREEN  
- **Spec:** SC1–SC3, SC6, SC14 · N1  
- **Snippet:** remove Map; `export async function assertRateLimit(db, key, limit, windowMs)`; floor window; atomic ON CONFLICT increment RETURNING count; if count > limit → `AppError.rateLimited` with formula `retryAfterSeconds`; D1 throw → `AppError.internal`; lazy GC optional DELETE stale; comment multi-isolate + 2× burst; `resetRateLimits(db)` DELETE FROM buckets  
- **Verify:** unit tests in T7  
- **Est:** 12 min · difficulty 3 · blockedBy: T1

### T3 — Await call sites + pass `db`  
- **Files:** `routes/auth.ts`, `services/admin-users.ts`, `services/invitations.ts`, `routes/me.ts`, `routes/demo.ts`, `routes/feedback.ts` (+ any other grep hits)  
- **Agent:** backend-dev-A · subject: routes · slice: V1 · phase: GREEN  
- **Spec:** SC4 · N2–N4  
- **Snippet:** `await assertRateLimit(c.get('db') || drizzle(c.env.DB), …)` — use existing db access pattern from each file; keep keys/limits; ensure BA_SENSITIVE paths still covered  
- **Verify:** typecheck; existing tests compile  
- **Est:** 15 min · difficulty 3 · blockedBy: T2

### T4 — Audit repo + service (allowlist meta)  
- **Files:** `apps/example-api/src/repos/audit.ts`, `services/audit.ts` (new)  
- **Agent:** backend-dev-B · subject: audit · slice: V2 · phase: GREEN  
- **Spec:** SC7, SC10, SC13 · N5  
- **Snippet:** `append(db, { action, actorUserId, targetType, targetId, orgId, ip, meta })` — strip denylist keys; allowlist per action; on insert fail log structured + rethrow only if caller wants (service catches for best-effort); `listRecent(db, { limit, cursor })`; `tryFirstLogin(db, userId, …)` INSERT OR IGNORE  
- **Verify:** unit tests T8  
- **Est:** 12 min · difficulty 3 · blockedBy: T1 · [P with T2 after T1]

### T5 — Emit hooks + BA first_login  
- **Files:** `services/admin-users.ts`, `services/invitations.ts`, `lib/better-auth.ts`  
- **Agent:** backend-dev-B · subject: hooks · slice: V2 · phase: GREEN  
- **Spec:** SC7–SC9 · N6–N10  
- **Snippet:** after create user → `user.created` (+ role/membership); invite accept → `invite.accept` + membership; `databaseHooks: { session: { create: { after: async (session) => tryFirstLogin(...) } } }` — confirm BA 1.6 API; if hooks unavailable, post-handler fallback documented in code comment  
- **Verify:** T8 integration  
- **Est:** 20 min · difficulty 4 · blockedBy: T4

### T6 — `GET /api/admin/audit-events`  
- **Files:** `routes/admin-audit.ts` (new), `app.ts` mount  
- **Agent:** backend-dev-B · subject: http · slice: V3 · phase: GREEN  
- **Spec:** SC11–SC12 · N11  
- **Snippet:** requireAuth + platformRole === super_admin; 401/403; query limit (default 50, max 100) + cursor; return `{ items, nextCursor, requestId }`  
- **Verify:** T8 gate tests  
- **Est:** 10 min · difficulty 2 · blockedBy: T4

### T7 — Rate-limit tests  
- **Files:** `apps/example-api/src/rate-limit.test.ts` (new) and/or extend `app.test.ts`  
- **Agent:** tester-A · subject: tests · slice: V1 · phase: GREEN  
- **Spec:** SC2–SC4, SC14 · N12  
- **Snippet:** sequential hits → 429; atomic multi-await same key; D1 mock/throw → 500 not pass-through; reset helper; BA auth IP path still 429  
- **Verify:** `bun run --filter @gosilex/example-api test`  
- **Est:** 15 min · difficulty 3 · blockedBy: T3

### T8 — Audit emit + list + secrets tests  
- **Files:** `apps/example-api/src/audit.test.ts` (new); touch admin-users/invitations tests if needed  
- **Agent:** tester-A · subject: tests · slice: V2+V3 · phase: GREEN  
- **Spec:** SC7–SC13 · N5–N11  
- **Snippet:** create user → events; first_login once (password or magic path available in test); second login no dup; list super ok; staff 403; anon 401; sk_ super if seed supports; meta denylist fixture; force append fail → domain ok + log marker (spy)  
- **Verify:** example-api test  
- **Est:** 20 min · difficulty 4 · blockedBy: T5, T6

### T9 — Abuse-response runbook  
- **File:** `docs/auth-abuse-response.md`  
- **Agent:** doc-writer-A · subject: docs · slice: V4 · phase: GREEN  
- **Spec:** SC5, SC6, SC15 · D1  
- **Snippet:** how limits work (D1, fixed window, 2× burst); multi-isolate share; how to query audit list; audit write residual; rotate passwords/keys; tighten constants; product fork async note  
- **Verify:** file exists, links from AGENTS optional one line  
- **Est:** 10 min · difficulty 1 · [P after T2]

### T10 — validate:full gate  
- **Files:** —  
- **Agent:** tester-A · subject: tests · slice: V4 · phase: GREEN  
- **Spec:** SC16  
- **Snippet:** run full suite; fix residuals only  
- **Verify:** `bun run validate:full` exit 0  
- **Est:** 15+ min · difficulty 2 · blockedBy: T7, T8, T9

## Task Seeding Blueprint

<!-- Used by /implement to seed tasks. blockedBy = T-numbers. -->

### Wave 1 — no deps, 1 agent

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T1 | backend-dev-A | — | schema |
| T2 | backend-dev-A | T1 | rate-limit |

### Wave 2 — after Wave 1, 2 agents ∥

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T3 | backend-dev-A | T2 | routes |
| T4 | backend-dev-B | T1 | audit |

### Wave 3 — after Wave 2, 2 agents ∥

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T5 | backend-dev-B | T4 | hooks |
| T6 | backend-dev-B | T4 | http |
| T7 | tester-A | T3 | tests |

### Wave 4 — after Wave 3

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T8 | tester-A | T5,T6 | tests |
| T9 | doc-writer-A | T2 | docs |
| T10 | tester-A | T7,T8,T9 | tests |

## Task IDs

<!-- Generated by /plan. Used by /implement to resume tasks on session restart. -->
- T1: T1 — schema
- T2: T2 — rate-limit
- T3: T3 — routes
- T4: T4 — audit
- T5: T5 — hooks
- T6: T6 — http
- T7: T7 — tests
- T8: T8 — tests
- T9: T9 — docs
- T10: T10 — tests

