---
title: "Plan: Epic B6 · Patterns kit productifs — V1 API client"
issue: 18
spec: artifacts/specs/18-epic-b6-kit-patterns-spec.md
complexity: 4/10
tier: F-full
generated: 2026-08-03
status: approved
slice: V1
deferred_slices: V2,V3,V4,V5
children:
  P1: 81
  P2: 82
  P3: 83
  P4: 84
pr_model: one-pr-per-child
epic_stays_open: true
---

## Summary

**Planning slice V1 (next unimplemented)** — promote `example-web` HTTP client into `@gosilex/api-client`, migrate the app to consume it (A8), document the package map. Epic slices **V2–V5** (MasterData, presign, jobs, epic close) are ordered after V1; re-run `/plan --issue 18` when V1 is done.

### Delivery model (Shape A) — 1 PR = 1 child

| Pattern | Child issue | Slice | PR footer |
|---------|-------------|-------|-----------|
| P1 API client | **#81** | V1 | `Closes #81` · mention epic `Related: #18` (do **not** `Closes #18`) |
| P2 MasterData | **#82** | V2 | `Closes #82` · `Related: #18` |
| P3 Presign | **#83** | V3 | `Closes #83` · `Related: #18` |
| P4 Jobs | **#84** | V4 | `Closes #84` · `Related: #18` |

**#18 stays open** until all children closed + V5 epic DoD (README map + validate:full + evidence comment). Epic close is manual after V5.

## Architecture

**Data flow:** [V1 API client data flow](../visuals/18-epic-b6-kit-patterns-data-flow.html)  
**File map:** [V1 file × function map](../visuals/18-epic-b6-kit-patterns-file-map.html)

Epic topology (for later slices, not implemented in V1): browser → api-client → Hono; items D1; uploads → storage presign; jobs → queue/cron.

## Bootstrap Context

- Worktree: `~/.grok/worktrees/gosilex-silex-boilerplate/18-epic-b6-kit-patterns`
- Branch: `feat/18-epic-b6-kit-patterns` (principal stays on `main`)
- Frame + analysis (Shape A) + spec approved; pins locked (`@gosilex/api-client`, `demo_items`, PUT-only, jobs unit-mock, fresh children)
- **Source pattern:** `apps/example-web/src/lib/api.ts` + `api.test.ts` (ApiError, credentials include, envelope parse)
- **Package template:** `packages/email` / `packages/storage` (workspace exports, vitest, typecheck scripts)
- **Types SSoT:** `@gosilex/types` `ApiErrorBody` + `ErrorCodeName`
- **A8:** package lands only with example-web import in same PR
- **Non-goals V1:** React Query hooks, FR hardcode, route constants, MasterData/presign/jobs

### Epic backlog (do not implement in this plan)

| Slice | Pattern | Child | Re-plan after |
|---|---|---|---|
| V2 | MasterData `demo_items` | #82 | V1 green |
| V3 | Storage PUT presign + mock | #83 | V1 or parallel post-V1 |
| V4 | Jobs queue/cron unit-mock | #84 | V1 or parallel post-V1 |
| V5 | README map honesty + epic evidence | — | V2–V4 children closed |

Children **created** 2026-08-03: #81–#84 · parent #18 · comment on epic.

## Agents

| Agent | Instance | Tasks | Files |
|-------|----------|-------|-------|
| backend-dev | backend-dev-A | T1–T2 | `packages/api-client/*` |
| frontend-dev | frontend-dev-A | T3 | `apps/example-web/src/lib/api.ts`, package.json |
| tester | tester-A | T4–T5 | package + web tests |
| doc-writer | doc-writer-A | T6 | README, package README |
| tester | tester-B | T7 | RED-GATE |

## Wave Structure

5 waves, max 1 parallel agent (linear package → migrate → test → docs → gate). Elapsed ~1 focused session.

| Wave | Trigger | Agents | Tasks |
|------|---------|--------|-------|
| 1 | start | backend-dev-A | T1 → T2 |
| 2 | Wave 1 done | frontend-dev-A | T3 |
| 3 | Wave 2 done | tester-A | T4 → T5 |
| 4 | Wave 3 done | doc-writer-A | T6 |
| 5 | Wave 4 done | tester-B | T7 (RED-GATE) |

### Budget — per task

| Task | Items | Class | Est. ops | Split? |
|------|-------|-------|----------|--------|
| T1 | scaffold package | bounded | 5 | — |
| T2 | implement client surface | judgmental | 10 | — |
| T3 | migrate example-web | bounded | 6 | — |
| T4 | package unit tests | judgmental | 8 | — |
| T5 | web api tests / call sites | bounded | 6 | — |
| T6 | README map + package README | bounded | 4 | — |
| T7 | RED-GATE typecheck/test | bounded | 4 | — |

**Total estimated ops: ~43**

### Budget — per agent instance

| Instance | Tasks | Σ ops | Subjects | Split? |
|----------|-------|-------|----------|--------|
| backend-dev-A | T1–T2 | 15 | scaffold, http | — |
| frontend-dev-A | T3 | 6 | migrate | — |
| tester-A | T4–T5 | 14 | package-test, web-test | — |
| doc-writer-A | T6 | 4 | docs | — |
| tester-B | T7 | 4 | verify | — |

## Consistency Report

| | |
|--|--|
| Covered (V1) | P1 AC + epic C5/C6 partial (envelope + map row) · N1 · S1 · U7 |
| Deferred | P2–P4 AC · V2–V5 · C7 full (four demos) |
| Untraced tasks | none in V1 set |
| Exemptions | V2–V5 re-plan; child issue creation optional ops |

## Micro-Tasks

### Slice V1 — P1 `@gosilex/api-client`

#### T1 — Scaffold workspace package

| Field | Value |
|-------|-------|
| Description | Create `packages/api-client` mirroring kit packages: `package.json` name `@gosilex/api-client`, `private`, `type:module`, exports `.` → `src/index.ts`, scripts typecheck/test/test:coverage/build, deps `@gosilex/types` workspace + vitest/typescript. `tsconfig.json` extends `@gosilex/config` / base like storage. `vitest.config.ts` like `packages/storage`. Ensure monorepo workspaces pick it up (root already `packages/*`). |
| File path | `packages/api-client/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts` (stub export) |
| Code snippet | `"name": "@gosilex/api-client"` · `export {}` stub until T2 |
| Verify | `bun install && bun run --filter @gosilex/api-client typecheck` |
| Expected | exit 0; package listed in bun workspace |
| Time | 10 min |
| `[P]` | N |
| Agent | backend-dev |
| Agent instance | backend-dev-A |
| Subject | scaffold |
| Spec trace | P1 files · S1 · V1 |
| Slice | V1 |
| Phase | GREEN |
| Difficulty | 2 |

#### T2 — Implement ApiError + apiFetch + apiErrorToMessage

| Field | Value |
|-------|-------|
| Description | Port logic from `apps/example-web/src/lib/api.ts` into package: `ApiError` class; `ApiClientOptions` (`baseUrl`, `credentials` default `'include'`, `fetch`, `defaultHeaders`, `onUnauthorized`); `createApiClient` + top-level `apiFetch`; parse kit `ApiErrorBody` on !ok; non-JSON → generic `Error` HTTP status; call `onUnauthorized` on 401 before throw. `apiErrorToMessage(err, { fallback, messages? })` — **no** FR hardcode, **no** app Messages type; catalog is `Partial<Record<ErrorCodeName, string>>`. Zero product path strings. Export from `src/index.ts`. |
| File path | `packages/api-client/src/index.ts` |
| Code snippet | `export class ApiError extends Error { … }` · `credentials: opts?.credentials ?? 'include'` |
| Verify | `bun run --filter @gosilex/api-client typecheck` |
| Expected | typecheck 0; public API matches spec P1 surface |
| Time | 20 min |
| `[P]` | N |
| Agent | backend-dev |
| Agent instance | backend-dev-A |
| Subject | http |
| Spec trace | P1 AC · N1 · C5 |
| Slice | V1 |
| Phase | GREEN |
| Difficulty | 3 |

#### T3 — Migrate example-web to package

| Field | Value |
|-------|-------|
| Description | Add `"@gosilex/api-client": "workspace:*"` to example-web deps. Rewrite `src/lib/api.ts` as thin wrapper: import `ApiError`, `createApiClient` / `apiFetch` from package; inject `baseUrl` from `import.meta.env.VITE_API_URL`; keep `apiErrorToMessage` bridge that maps ErrorCode → `Messages` keys then calls package helper (or re-export package + local CODE_TO_MSG wrapper so call sites unchanged). Re-export `ApiError` and `apiFetch` so existing imports from `./lib/api` keep working. Run bun install in worktree. |
| File path | `apps/example-web/package.json`, `apps/example-web/src/lib/api.ts` |
| Code snippet | `import { ApiError, apiFetch as kitFetch, apiErrorToMessage as kitMap } from '@gosilex/api-client'` |
| Verify | `bun run --filter @gosilex/example-web typecheck` |
| Expected | typecheck 0; no residual full client impl in web (package owns fetch/envelope) |
| Time | 15 min |
| `[P]` | N |
| Agent | frontend-dev |
| Agent instance | frontend-dev-A |
| Subject | migrate |
| Spec trace | P1 A8 · U7 · V1 |
| Slice | V1 |
| Phase | GREEN |
| Difficulty | 3 |

#### T4 — Package unit tests

| Field | Value |
|-------|-------|
| Description | Add `packages/api-client/src/index.test.ts` covering: credentials include default; successful JSON parse; envelope → ApiError fields; non-JSON error path; 401 invokes `onUnauthorized` then throws; `apiErrorToMessage` uses catalog / fallback. Use mock `fetch`. Align with behaviors in `apps/example-web/src/lib/api.test.ts`. |
| File path | `packages/api-client/src/index.test.ts` |
| Code snippet | `const fetch = mock(() => …)` · `expect(err).toBeInstanceOf(ApiError)` |
| Verify | `bun run --filter @gosilex/api-client test` |
| Expected | all tests pass |
| Time | 20 min |
| `[P]` | N |
| Agent | tester |
| Agent instance | tester-A |
| Subject | package-test |
| Spec trace | P1 AC tests · C5 |
| Slice | V1 |
| Phase | GREEN |
| Difficulty | 3 |

#### T5 — Web contract tests still green

| Field | Value |
|-------|-------|
| Description | Update `apps/example-web/src/lib/api.test.ts` if needed after thin wrap; ensure credentials, envelope, fallback still covered. Grep that app call sites still import from `@/lib/api` or relative `lib/api` (not broken paths). |
| File path | `apps/example-web/src/lib/api.test.ts` |
| Code snippet | existing tests adjusted for re-export |
| Verify | `bun run --filter @gosilex/example-web test -- src/lib/api.test.ts` |
| Expected | pass |
| Time | 10 min |
| `[P]` | N |
| Agent | tester |
| Agent instance | tester-A |
| Subject | web-test |
| Spec trace | P1 AC · U7 |
| Slice | V1 |
| Phase | GREEN |
| Difficulty | 2 |

#### T6 — README package map + package README

| Field | Value |
|-------|-------|
| Description | Add `@gosilex/api-client` row to root `README.md` package map (honest one-liner: browser fetch + ApiError). Write short `packages/api-client/README.md` (1 screen: install/workspace, createApiClient, credentials, no i18n). Optional AGENTS.md §H one-line if cheap. |
| File path | `README.md`, `packages/api-client/README.md` |
| Code snippet | `\| @gosilex/api-client \| fetch + ApiError envelope \|` |
| Verify | `grep -n api-client README.md packages/api-client/README.md` |
| Expected | both mention package |
| Time | 10 min |
| `[P]` | N |
| Agent | doc-writer |
| Agent instance | doc-writer-A |
| Subject | docs |
| Spec trace | P1 DoD · C6 · V1 |
| Slice | V1 |
| Phase | GREEN |
| Difficulty | 1 |

#### T7 — RED-GATE V1

| Field | Value |
|-------|-------|
| Description | Run package + web typecheck/test for api-client path. Prefer filtered gates; if time allows `bun run validate:full` (long). Confirm banlist still clean (no product paths in package). Mark V1 ready for PR or continue epic re-plan. |
| File path | — |
| Code snippet | — |
| Verify | `bun run --filter @gosilex/api-client test && bun run --filter @gosilex/example-web typecheck && bun run --filter @gosilex/example-web test -- src/lib/api.test.ts` |
| Expected | all exit 0 |
| Time | 15 min |
| `[P]` | N |
| Agent | tester |
| Agent instance | tester-B |
| Subject | verify |
| Spec trace | C1 partial · V1 DoD |
| Slice | V1 |
| Phase | RED-GATE |
| Difficulty | 2 |

## Task Seeding Blueprint

<!-- Used by /implement to seed TaskCreate / todo_write on session start. -->

### Wave 1 — no deps, 1 agent

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T1 | backend-dev-A | — | scaffold |
| T2 | backend-dev-A | T1 | http |

### Wave 2 — after Wave 1

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T3 | frontend-dev-A | T2 | migrate |

### Wave 3 — after Wave 2

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T4 | tester-A | T3 | package-test |
| T5 | tester-A | T4 | web-test |

### Wave 4 — after Wave 3

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T6 | doc-writer-A | T5 | docs |

### Wave 5 — after Wave 4

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T7 | tester-B | T6 | verify |

## Task IDs

<!-- Generated by /plan. Used by /implement to resume tasks on session restart. -->
- T1: T1 — scaffold
- T2: T2 — http
- T3: T3 — migrate
- T4: T4 — package-test
- T5: T5 — web-test
- T6: T6 — docs
- T7: T7 — verify
