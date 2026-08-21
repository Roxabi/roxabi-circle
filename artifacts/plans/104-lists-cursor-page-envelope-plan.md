---
title: "Plan: feat(lists): kit cursor page envelope + example dogfood"
issue: 104
spec: artifacts/specs/104-lists-cursor-page-envelope-spec.md
complexity: 5/10
tier: F-lite
generated: 2026-08-21
normative: false
---

## Summary

Ship opaque-by-convention cursor list helpers in `@kit/types` + `@kit/core`, dogfood admin-audit + admin-users (offset→keyset), example-web Load more, ADR-0009 + docs. One PR. Notes dump stays a documented demo exception.

## Architecture

**Data flow:** [104 data flow](../visuals/104-lists-cursor-page-envelope-data-flow.html)  
**File map:** [104 file map](../visuals/104-lists-cursor-page-envelope-file-map.html)

Query → decode/clamp → staff scope → repo keyset `limit+1` → `takeListPage` → `{ items, nextCursor, requestId }` → web Load more.

## Bootstrap Context

- Frame: `artifacts/frames/104-lists-cursor-page-envelope-frame.md` (approved, F-lite)
- Spec: `artifacts/specs/104-lists-cursor-page-envelope-spec.md` (approved)
- Offset users: `apps/example-api/src/repos/users.ts` `listBaUsers` (`orderBy createdAt` + `offset`)
- Staff-before-page: `services/admin-users-list.ts` + test `admin-users.test.ts` L383
- Audit keyset (steal): `services/audit.ts` `listRecentAuditEvents` — public `createdAt:id` today
- Web: `apps/example-web/src/routes/admin/users.tsx` — fetches `?q=` only, body `{ users }`
- `@kit/types` has no `zod` yet — add dep (peer packages use `^4.4.3`)
- Pattern: audit `limit+1` + slice; opaque-ify via core helpers

## Agents

| Agent instance | Tasks | Files |
|----------------|-------|-------|
| tester-A | T1, RG-V1 | `packages/core/src/list-page.test.ts` (or similar) |
| tester-B | T5, T6, RG-V3 | `audit.test.ts`, `admin-users.test.ts` |
| backend-dev-A | T2→T3 | `packages/types/**`, `packages/core/**` |
| backend-dev-B | T7 | `admin-audit.ts`, `services/audit.ts` |
| backend-dev-C | T8 | `repos/users.ts`, `admin-users-list.ts`, `routes/admin-users.ts` |
| frontend-dev-A | T9 | `apps/example-web/src/routes/admin/users.tsx` (+ i18n if needed) |
| doc-writer-A | T4, T10 | ADR-0009, `docs/ui-kit.md`, `AGENTS.md` |

## Wave Structure

6 waves, max 3 parallel agents. One session / one PR.

| Wave | Trigger | Agents | Tasks |
|------|---------|--------|-------|
| 1 | start | 2 ∥ | tester-A: T1 · tester-B: T5 |
| 2 | Wave 1 RED | 2 ∥ | tester-A: RG-V1 · tester-B: T6 |
| 3 | RG-V1 + T5 done | 2 ∥ | backend-dev-A: T2→T3 · tester-B: RG-V3 |
| 4 | T3 + RG-V3 | 3 ∥ | backend-dev-B: T7 · backend-dev-C: T8 · doc-writer-A: T4 |
| 5 | T8 | 1 | frontend-dev-A: T9 |
| 6 | T4 + T9 | 1 | doc-writer-A: T10 |

### Budget — per task

| Task | Items | Class | Est. ops | Split? |
|------|-------|-------|----------|--------|
| T1 RED helpers | 1 file | judgmental | 5 | — |
| RG-V1 | sentinel | trivial | 1 | — |
| T2 types + zod | 2 files | bounded | 3 | — |
| T3 core helpers | 2–3 files | judgmental | 5 | — |
| T4 ADR-0009 | 1 file | bounded | 3 | — |
| T5 RED audit | 1 file | judgmental | 5 | — |
| T6 RED users | 1 file | judgmental | 6 | — |
| RG-V3 | sentinel | trivial | 1 | — |
| T7 wire audit | 2 files | bounded | 3 | — |
| T8 users keyset | 3 files | judgmental | 6 | — |
| T9 web Load more | 1–2 files | judgmental | 5 | — |
| T10 docs polish | 2 files | bounded | 3 | — |

**Total estimated ops: ~46**

### Budget — per agent instance

| Instance | Tasks | Σ ops | Subjects | Split? |
|----------|-------|-------|----------|--------|
| tester-A | T1, RG-V1 | 6 | lists | — |
| tester-B | T5, T6, RG-V3 | 12 | audit, users | — |
| backend-dev-A | T2, T3 | 8 | lists | — |
| backend-dev-B | T7 | 3 | audit | — |
| backend-dev-C | T8 | 6 | users | — |
| frontend-dev-A | T9 | 5 | admin-ui | — |
| doc-writer-A | T4, T10 | 6 | adr, docs | — |

## Consistency Report

- Criteria covered: 17/17
- Uncovered criteria: none
- Affordances: A1–A5, U1–U3, D1–D3 mapped
- Untraced: none
- Exemptions: SC lint/typecheck/banlist = PR gate (not a micro-task); no kit `LoadMore` (negative AC)

## Micro-Tasks

### Slice V1: Types + core helpers

#### Task 1: RED clamp / decode / takeListPage unit tests [P] → tester-A
- **File:** `packages/core/src/list-page.test.ts` (create; or `packages/types` for schema tests if split)
- **Snippet:** `expect(clampListLimit(undefined)).toBe(50)`; `expect(clampListLimit(0)).toBe(1)`; `expect(clampListLimit(999)).toBe(100)`; malformed cursor → `AppError` / `VALIDATION_ERROR`; legacy `"123:abc"` → validation; `takeListPage` with `limit` rows ⇒ `nextCursor === null`; with `limit+1` ⇒ cursor set; round-trip encode/decode keyset `{ createdAt: number, id: string }`.
- **Verify:** `test -f packages/core/src/list-page.test.ts && grep -q takeListPage packages/core/src/list-page.test.ts`
- **Expected:** RED until T3 (and T2 for schema if tested here)
- **Time:** 8 min | **Difficulty:** 3
- **Traces:** A1, A2, A5, SC-malformed, SC-clamp, SC-takePage
- **Phase:** RED
- **Subject:** lists

#### RED-GATE: RED complete V1 → tester-A
- **Verify:** T1 file exists with clamp + takeListPage + malformed cases
- **Phase:** RED-GATE

#### Task 2: Export listQuerySchema + ListPage (+ zod) → backend-dev-A
- **File:** `packages/types/package.json`, `packages/types/src/index.ts`, `packages/types/src/list.ts` (optional split)
- **Snippet:** add `"zod": "^4.4.3"` dependency; `listQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).optional(), cursor: z.string().max(512).optional(), q: z.string().optional() })`; `export type ListPage<T> = { items: T[]; nextCursor: string | null }`.
- **Verify:** `grep -q listQuerySchema packages/types/src/index.ts && grep -q '"zod"' packages/types/package.json`
- **Expected:** exports resolve; typecheck `@kit/types` green
- **Time:** 5 min | **Difficulty:** 2
- **Traces:** A1, SC-types
- **Phase:** GREEN
- **Subject:** lists

#### Task 3: Implement clamp / encode / decode / takeListPage → backend-dev-A
- **File:** `packages/core/src/list-page.ts`, `packages/core/src/index.ts`
- **Snippet:** `clampListLimit`; `encodeListCursor` / `decodeListCursor` (base64url JSON; throw `AppError.validation` generic); `takeListPage(rows, limit, keysetOf)` — epoch-ms numbers in keyset; re-export from index. Temporal fields = number ms.
- **Verify:** `bun run --filter @kit/core test src/list-page.test.ts`
- **Expected:** T1 green; no keyset in error messages
- **Time:** 10 min | **Difficulty:** 3
- **Traces:** A2, A5, SC-helpers
- **Phase:** GREEN
- **Subject:** lists

### Slice V2: ADR-0009

#### Task 4: Write ADR-0009 [P] → doc-writer-A
- **File:** `docs/architecture/adr/0009-list-page-cursor-envelope.md`
- **Snippet:** Status Accepted; Decision = opaque-by-convention cursor + `{ items, nextCursor }`; Consequences: client seek allowed (not security boundary); concurrent skip/dup; unbound `q`+cursor; no default `total`; consumer catalogues vs insights vs demo dump; points at helpers.
- **Verify:** `test -f docs/architecture/adr/0009-list-page-cursor-envelope.md`
- **Expected:** ADR file present with seek / concurrent / data-shape
- **Time:** 8 min | **Difficulty:** 2
- **Traces:** D1, SC-ADR
- **Phase:** GREEN
- **Subject:** adr

### Slice V3: Wire audit + users

#### Task 5: RED audit cursor round-trip + legacy reject + limit+1 [P] → tester-B
- **File:** `apps/example-api/src/audit.test.ts`
- **Snippet:** seed ≥ `limit+1` audit rows; first page `nextCursor` non-null; second page with cursor returns continuation; `?cursor=123:oldid` → 400 `VALIDATION_ERROR`; body has `items` + `nextCursor` + `requestId`.
- **Verify:** `grep -q nextCursor apps/example-api/src/audit.test.ts`
- **Expected:** RED until T7
- **Time:** 10 min | **Difficulty:** 3
- **Traces:** A3, A5, SC-audit, SC-limit+1
- **Phase:** RED
- **Subject:** audit

#### Task 6: RED users cursor + staff×cursor + page-2 → tester-B
- **File:** `apps/example-api/src/admin-users.test.ts`
- **Snippet:** Rewrite staff-before-page (keep intent); add staff + cursor continuation never returns OOS ids; empty shared-org + cursor → `{ items: [], nextCursor: null }`; users page-2 round-trip; `limit+1` fixture ⇒ non-null cursor; assert **no** `offset` query; body `{ items, nextCursor }` not `{ users }`.
- **Verify:** `grep -q nextCursor apps/example-api/src/admin-users.test.ts`
- **Expected:** RED until T8
- **Time:** 12 min | **Difficulty:** 4
- **Traces:** A4, A5, SC-users, SC-staff×cursor, SC-page2
- **Phase:** RED
- **Subject:** users

#### RED-GATE: RED complete V3 → tester-B
- **Verify:** T5 + T6 assertions present in test files
- **Phase:** RED-GATE

#### Task 7: Wire audit to kit helpers → backend-dev-B
- **File:** `apps/example-api/src/services/audit.ts`, `apps/example-api/src/routes/admin-audit.ts`
- **Snippet:** parse via `listQuerySchema` (or extend); `clampListLimit`; `decodeListCursor` → keyset; keep repo `limit+1`; `takeListPage` + `encodeListCursor` for `{ createdAt, id }` epoch ms; drop `createdAt:id` string concat.
- **Verify:** `bun run --filter @kit/example-api test src/audit.test.ts`
- **Expected:** T5 green
- **Time:** 8 min | **Difficulty:** 3
- **Traces:** A3, A5
- **Phase:** GREEN
- **Subject:** audit

#### Task 8: Users repo keyset + service + route → backend-dev-C
- **File:** `apps/example-api/src/repos/users.ts`, `apps/example-api/src/services/admin-users-list.ts`, `apps/example-api/src/routes/admin-users.ts`
- **Snippet:** Drop `offset`; `ORDER BY createdAt DESC, id DESC` + keyset `WHERE` (same pattern as audit); fetch `limit+1`; staff `userIds` **before** keyset; service returns `ListPage`; route `c.json({ ...page, requestId })`.
- **Verify:** `bun run --filter @kit/example-api test src/admin-users.test.ts`
- **Expected:** T6 green; no offset in route schema
- **Time:** 15 min | **Difficulty:** 4
- **Traces:** A4, SC-users
- **Phase:** GREEN
- **Subject:** users

### Slice V4: example-web admin users

#### Task 9: Consume items + nextCursor Load more → frontend-dev-A
- **File:** `apps/example-web/src/routes/admin/users.tsx` (+ messages if new string)
- **Snippet:** `apiFetch<{ items: AdminUser[]; nextCursor: string | null }>`; accumulate pages or append on Load more; pass `cursor` when loading more; changing `q` clears cursor / resets list; hide Load more when `nextCursor === null`.
- **Verify:** `grep -q nextCursor apps/example-web/src/routes/admin/users.tsx`
- **Expected:** no silent 50-truncation; no `{ users }` type
- **Time:** 12 min | **Difficulty:** 3
- **Traces:** U1, U2, U3, SC-web
- **Phase:** GREEN
- **Subject:** admin-ui

### Slice V5: Docs polish

#### Task 10: ui-kit.md + AGENTS pointer → doc-writer-A
- **File:** `docs/ui-kit.md`, `AGENTS.md`
- **Snippet:** Data-shape table (catalogue / lookup / aggregate); notes dump = demo-size exception; virtualize in the app (Virtual still P1); AGENTS TanStack Table row → ADR-0009.
- **Verify:** `grep -q '0009\\|cursor' docs/ui-kit.md AGENTS.md`
- **Expected:** pointers live; no product strings in packages
- **Time:** 8 min | **Difficulty:** 2
- **Traces:** D2, D3, SC-docs
- **Phase:** GREEN
- **Subject:** docs

## Task Seeding Blueprint

<!-- Used by /implement to seed TaskCreate calls on session start.
     Format: T{n} | agent-instance | blockedBy | subject -->

### Wave 1 — no deps, 2 agents ∥

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T1 | tester-A | — | lists |
| T5 | tester-B | — | audit |

### Wave 2 — after Wave 1 RED, 2 agents ∥

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| RG-V1 | tester-A | T1 | lists |
| T6 | tester-B | T5 | users |

### Wave 3 — after RG-V1 + T5, 2 agents ∥

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T2 | backend-dev-A | RG-V1 | lists |
| T3 | backend-dev-A | T2 | lists |
| RG-V3 | tester-B | T6 | users |

### Wave 4 — after T3 + RG-V3, 3 agents ∥

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T7 | backend-dev-B | T3, RG-V3 | audit |
| T8 | backend-dev-C | T3, RG-V3 | users |
| T4 | doc-writer-A | T3 | adr |

### Wave 5 — after T8, 1 agent

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T9 | frontend-dev-A | T8 | admin-ui |

### Wave 6 — after T4 + T9, 1 agent

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T10 | doc-writer-A | T4, T9 | docs |

## Task IDs

<!-- Generated by /plan. Used by /implement to resume tasks on session restart. -->
- T1: T1 — lists
- RG-V1: RG-V1 — lists
- T2: T2 — lists
- T3: T3 — lists
- T4: T4 — adr
- T5: T5 — audit
- T6: T6 — users
- RG-V3: RG-V3 — users
- T7: T7 — audit
- T8: T8 — users
- T9: T9 — admin-ui
- T10: T10 — docs
