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

Ship one opaque-by-convention cursor list contract through `@kit/types` and `@kit/core`, then dogfood it in admin audit and admin users. Migrate users from offset to keyset pagination, preserve staff visibility inside the SQL predicate, and update example-web with `useInfiniteQuery` plus localized Load more copy.

One F-lite PR, TDD waves, no generic Drizzle pager, no new pagination package, no `@kit/ui` Load more component. Notes remain a documented demo-size exception.

## Architecture links

- **ADR:** [`docs/kit/architecture/adr/0010-list-page-cursor-envelope.md`](../../docs/kit/architecture/adr/0010-list-page-cursor-envelope.md)
- **Data flow:** [104 data flow](../visuals/104-lists-cursor-page-envelope-data-flow.html)
- **File map:** [104 file map](../visuals/104-lists-cursor-page-envelope-file-map.html)
- **Analysis:** [104 analysis](../analyses/104-lists-cursor-page-envelope-analysis.md)
- **Spec:** [104 spec](../specs/104-lists-cursor-page-envelope-spec.md)

```text
query validation
  → generic cursor decode
  → endpoint-specific strict keyset validation
  → staff + q + keyset in one WHERE
  → stable ORDER BY + limit+1
  → takeListPage(raw rows)
  → role enrichment + DTO mapping
  → { items, nextCursor, requestId }
  → useInfiniteQuery / Load more
```

Shared packages own only query/envelope types and cursor/page mechanics. Routes own query refinement and wire request IDs. Services and repositories own authorization scope, endpoint keyset schemas, SQL predicates, temporal conversion, and DTO mapping.

## Bootstrap Context

- Frame: `artifacts/frames/104-lists-cursor-page-envelope-frame.md` — approved, F-lite.
- Spec: `artifacts/specs/104-lists-cursor-page-envelope-spec.md` — **draft pending re-approval**; this plan applies the newer analysis where implementation details differ.
- Analysis: `artifacts/analyses/104-lists-cursor-page-envelope-analysis.md`.
- `packages/types/src/index.test.ts` is the existing package test home; add a separate list-schema suite.
- `packages/core` owns `AppError` and the new Worker-compatible cursor/page helpers.
- `apps/example-api/src/services/audit.ts` currently emits public `createdAt:id` cursors.
- `apps/example-api/src/repos/users.ts` currently applies `offset` and orders only by `createdAt`.
- `apps/example-api/src/services/admin-users-list.ts` scopes staff before the existing page, then loads roles and maps DTOs.
- `apps/example-web/src/routes/admin/users.tsx` currently uses `useQuery` and consumes `{ users }`.
- Localized copy is app-owned in `apps/example-web/src/messages/fr.ts` and `en.ts`.
- Temporal cursor values are finite epoch milliseconds. Better Auth user rows expose `Date`; audit rows already use milliseconds.
- Generic cursor decoding validates the transport payload. Each endpoint must additionally validate the exact `{ createdAt, id }` keyset before SQL.
- The cursor is not an authorization or integrity boundary. Client seek, unbound `q` plus cursor, and concurrent-write skip/duplicate behavior are accepted and recorded in ADR-0010.

## Agents

| Agent instance | Tasks | Files |
|----------------|-------|-------|
| tester-A | T1, RG-V1 | `packages/types/src/list.test.ts`, `packages/core/src/list-page.test.ts` |
| tester-B | T5, T6, RG-V3 | `apps/example-api/src/audit.test.ts`, `apps/example-api/src/admin-users.test.ts` |
| backend-dev-A | T2, T3 | `packages/types/**`, `packages/core/**` |
| backend-dev-B | T7 | `routes/admin-audit.ts`, `services/audit.ts` |
| backend-dev-C | T8 | `repos/users.ts`, `services/admin-users-list.ts`, `routes/admin-users.ts` |
| frontend-dev-A | T9 | admin users route and FR/EN catalogs |
| doc-writer-A | T4, T10 | ADR-0010, `docs/ui-kit.md`, `AGENTS.md` |

## Wave Structure

Six waves, at most three parallel agents, one session and one PR.

| Wave | Trigger | Agents | Tasks |
|------|---------|--------|-------|
| 1 | Start | 2 ∥ | tester-A: T1 · tester-B: T5 |
| 2 | Wave 1 RED | 2 ∥ | tester-A: RG-V1 · tester-B: T6 |
| 3 | RG-V1 + T5 complete | 2 ∥ | backend-dev-A: T2 → T3 · tester-B: RG-V3 |
| 4 | T3 + RG-V3 complete | 3 ∥ | backend-dev-B: T7 · backend-dev-C: T8 · doc-writer-A: T4 |
| 5 | T8 complete | 1 | frontend-dev-A: T9 |
| 6 | T4 + T7 + T8 + T9 complete | 1 | doc-writer-A: T10 |

### Budget — per task

| Task | Items | Class | Est. ops | Split? |
|------|-------|-------|----------|--------|
| T1 RED schemas + helpers | 2 distinct test files | judgmental | 7 | Split by package |
| RG-V1 | RED sentinel | trivial | 2 | — |
| T2 types + Zod | 3 files | bounded | 4 | — |
| T3 Worker cursor + page helpers | 2–3 files | judgmental | 7 | — |
| T4 ADR-0010 | 1 file | bounded | 3 | — |
| T5 RED audit endpoint | 1 file | judgmental | 6 | — |
| T6 RED users endpoint | 1 file | judgmental | 7 | — |
| RG-V3 | RED sentinel | trivial | 2 | — |
| T7 audit composition | 2 files | judgmental | 5 | — |
| T8 users keyset composition | 3 files | judgmental | 8 | — |
| T9 infinite query + i18n | 3 files | judgmental | 7 | — |
| T10 docs + final gates | 2 files + gates | bounded | 5 | — |

**Total estimated ops: ~63**

### Budget — per agent instance

| Instance | Tasks | Σ ops | Subjects | Split? |
|----------|-------|-------|----------|--------|
| tester-A | T1, RG-V1 | 9 | types, core | Two independent RED suites |
| tester-B | T5, T6, RG-V3 | 15 | audit, users | — |
| backend-dev-A | T2, T3 | 11 | shared list contract | — |
| backend-dev-B | T7 | 5 | audit | — |
| backend-dev-C | T8 | 8 | users | — |
| frontend-dev-A | T9 | 7 | admin UI, i18n | — |
| doc-writer-A | T4, T10 | 8 | ADR, docs, gates | — |

## Consistency Report

- Tier: **F-lite**, one PR, no schema migration.
- Criteria covered: **17/17**.
- Uncovered criteria: none.
- Affordances covered: A1–A8, U1–U4, D1–D3.
- New-analysis corrections applied:
  - ADR path is `docs/kit/architecture/adr/0010-list-page-cursor-envelope.md`.
  - Types schema tests and core helper tests are separate RED suites.
  - Cursor codec uses Worker Web APIs, not Node `Buffer`.
  - Generic decoded payloads and endpoint keysets are validated independently.
  - Users compose staff, search, and keyset predicates in one `WHERE`.
  - Users convert `Date ↔ epoch-ms` at repository/service boundaries.
  - Raw pages are cut before roles are fetched or DTOs are produced.
  - Frontend uses `useInfiniteQuery` and app-owned FR/EN copy.
- Negative constraints preserved:
  - No generic Drizzle pagination layer.
  - No new pagination package.
  - No `@kit/ui` Load more component.
  - No product business strings in `packages/*`.
  - Notes remain a documented demo-size exception.
  - Flows pagination remains deferred.
- Final machine gate: focused suites during implementation, then `bun run validate:full` and `bun run zero-edit`.

## Micro-Tasks

### Slice V1: Types + core helpers

#### Task 1: RED list schema and core helper tests [P] → tester-A

- **Files:**
  - `packages/types/src/list.test.ts`
  - `packages/core/src/list-page.test.ts`
- **Types RED suite:**
  - `listQuerySchema` coerces valid numeric limits.
  - Rejects `limit` below 1, above 100, fractional, or non-numeric.
  - Rejects cursor strings longer than 512.
  - Accepts optional `cursor` and `q`.
  - `ListPage<T>` is exported with only `items` and `nextCursor`.
- **Core RED suite:**
  - `clampListLimit(undefined) === 50`, minimum 1, maximum 100.
  - Unicode-containing keysets survive encode/decode round trips.
  - Encoded cursors use base64url characters and require no padding.
  - Bad alphabet, malformed UTF-8/JSON, null, arrays, empty objects, nested values, booleans, null values, and non-finite numeric values fail with generic `VALIDATION_ERROR`.
  - Error output does not expose decoded payloads or expected key names.
  - Exactly `limit` rows produce `nextCursor: null`.
  - `limit+1` rows retain `limit` items and derive a cursor from the last retained row.
- **Verify:**
  - `bun run --filter @kit/types test -- src/list.test.ts`
  - `bun run --filter @kit/core test -- src/list-page.test.ts`
- **Expected:** Both suites are RED only because their public APIs are not implemented; no syntax, fixture, or runner failure.
- **Time:** 12 min
- **Difficulty:** 4
- **Traces:** A1, A2, A5, SC-types, SC-clamp, SC-cursor, SC-takePage
- **Phase:** RED
- **Subject:** lists

#### RED-GATE: RED complete V1 → tester-A

- **Verify:** Run both T1 commands independently and record an expected assertion/import failure from each package.
- **Reject gate if:** A suite passes before implementation, fails to start, or fails for unrelated configuration.
- **Phase:** RED-GATE

#### Task 2: Export `listQuerySchema` and `ListPage<T>` → backend-dev-A

- **Files:**
  - `packages/types/package.json`
  - `packages/types/src/list.ts`
  - `packages/types/src/index.ts`
- **Implementation:**
  - Add Zod as a runtime dependency using the repository’s resolved Zod 4 range.
  - Export `listQuerySchema` with optional coerced integer `limit` in `1..100`, cursor maximum 512, and optional conventional `q`.
  - Export `ListPage<T> = { items: T[]; nextCursor: string | null }`.
  - Keep `requestId` outside `ListPage<T>`.
  - Do not add endpoint-specific keyset schemas to `@kit/types`.
- **Verify:**
  - `bun install`
  - `bun run --filter @kit/types test -- src/list.test.ts`
  - `bun run --filter @kit/types typecheck`
- **Expected:** Types RED suite turns GREEN; lockfile records the deliberate runtime dependency.
- **Time:** 8 min
- **Difficulty:** 2
- **Traces:** A1, SC-types
- **Phase:** GREEN
- **Subject:** lists

#### Task 3: Implement Worker cursor codec and list-page helpers → backend-dev-A

- **Files:**
  - `packages/core/src/list-page.ts`
  - `packages/core/src/index.ts`
- **Implementation:**
  - Implement `clampListLimit`.
  - Implement Unicode-safe base64url encode/decode with `TextEncoder`, `TextDecoder`, `btoa`, and `atob`; do not use `Buffer`.
  - Strictly reject malformed base64url before decoding.
  - Parse JSON and accept only a non-null, non-array, non-empty plain record whose values are strings or finite numbers.
  - Reject nested objects, arrays, booleans, nulls, and unusable numeric payloads.
  - Convert every decode failure to a generic `AppError.validation` without payload or schema leakage.
  - Implement `takeListPage(rows, limit, keysetOf)` over already fetched `limit+1` raw rows.
  - Encode the cursor from the final retained row only when an additional row exists.
- **Verify:**
  - `bun run --filter @kit/core test -- src/list-page.test.ts`
  - `bun run --filter @kit/core typecheck`
  - `rg '\\bBuffer\\b' packages/core/src/list-page.ts` returns no match.
- **Expected:** Core RED suite turns GREEN, including Unicode and strict-payload cases.
- **Time:** 15 min
- **Difficulty:** 4
- **Traces:** A2, A5, SC-helpers, SC-worker-runtime
- **Phase:** GREEN
- **Subject:** lists

### Slice V2: ADR-0010

#### Task 4: Write ADR-0010 [P] → doc-writer-A

- **File:** `docs/kit/architecture/adr/0010-list-page-cursor-envelope.md`
- **Decision:**
  - Status Accepted; non-axial.
  - Standard list page is opaque-by-convention cursor plus `{ items, nextCursor }`.
  - Wire routes append `requestId`.
  - SQL ordering, authorization filters, endpoint keyset validation, and DTO mapping remain app-owned.
  - Cursor opacity is not integrity; well-formed client seek remains allowed.
  - `q` is not bound to the cursor in this cycle.
  - Concurrent changes can cause skips or duplicates; no snapshot or default `total`.
  - Unbounded catalogues use cursor pages; small capped lookups may dump; aggregates remain server-side.
  - Temporal cursor values are finite epoch milliseconds.
- **Verify:**
  - `test -f docs/kit/architecture/adr/0010-list-page-cursor-envelope.md`
  - `rg 'client seek|concurrent|epoch milliseconds|items|nextCursor|aggregate' docs/kit/architecture/adr/0010-list-page-cursor-envelope.md`
- **Expected:** ADR records the reusable boundary and accepted trade-offs without claiming cursor security.
- **Time:** 8 min
- **Difficulty:** 2
- **Traces:** D1, SC-ADR
- **Phase:** GREEN
- **Subject:** adr

### Slice V3: Wire audit + users

#### Task 5: RED audit continuation and endpoint keyset validation [P] → tester-B

- **File:** `apps/example-api/src/audit.test.ts`
- **Tests:**
  - Seed at least `limit+1` ordered audit rows.
  - First page returns `{ items, nextCursor, requestId }` with non-null cursor.
  - Following `nextCursor` returns the correct second page without duplicate IDs.
  - Exactly `limit` rows return `nextCursor: null`.
  - Reject the legacy `createdAt:id` cursor with 400 `VALIDATION_ERROR`.
  - Encode transport-valid payloads with missing, extra, or mistyped keys and assert rejection.
  - Reject non-finite/unusable `createdAt` and empty `id`.
  - Assert validation messages do not expose payload contents or endpoint key names.
- **Verify:** `bun run --filter @kit/example-api test -- src/audit.test.ts`
- **Expected:** New assertions are RED until T7; unrelated audit tests remain green.
- **Time:** 12 min
- **Difficulty:** 4
- **Traces:** A3, A5, SC-audit, SC-limit+1, SC-endpoint-keyset
- **Phase:** RED
- **Subject:** audit

#### Task 6: RED users cursor, composed scope, and raw-page ordering → tester-B

- **File:** `apps/example-api/src/admin-users.test.ts`
- **Tests:**
  - Replace offset-oriented expectations with `{ items, nextCursor, requestId }`.
  - `?offset=` is not accepted by the list endpoint.
  - A `limit+1` fixture produces a non-null cursor and page two returns the next stable IDs.
  - Equal `createdAt` rows continue deterministically by descending `id`.
  - Staff plus `q` plus cursor never returns an out-of-scope ID.
  - Empty staff shared-org scope returns `{ items: [], nextCursor: null }`, including with a cursor.
  - Transport-valid keysets with missing, extra, or mistyped `createdAt`/`id` are rejected.
  - Cursor milliseconds round-trip against Better Auth `Date` rows.
  - Role lookup and DTO conversion apply only to retained page rows, not the `limit+1` sentinel.
- **Verify:** `bun run --filter @kit/example-api test -- src/admin-users.test.ts`
- **Expected:** New assertions are RED until T8; authorization fixtures remain valid.
- **Time:** 15 min
- **Difficulty:** 5
- **Traces:** A4, A5, SC-users, SC-staff×cursor, SC-page2, SC-date-ms
- **Phase:** RED
- **Subject:** users

#### RED-GATE: RED complete V3 → tester-B

- **Verify:** Run T5 and T6 commands independently.
- **Required evidence:** Failures identify the retired audit cursor, users offset/envelope behavior, strict endpoint keysets, and continuation behavior.
- **Reject gate if:** Failures arise from test setup, authentication, migrations, or unrelated fixtures.
- **Phase:** RED-GATE

#### Task 7: Wire audit through shared helpers and strict keyset validation → backend-dev-B

- **Files:**
  - `apps/example-api/src/services/audit.ts`
  - `apps/example-api/src/routes/admin-audit.ts`
- **Implementation:**
  - Parse list query input through the shared schema or an endpoint refinement.
  - Clamp the effective limit through `@kit/core`.
  - Decode the opaque cursor generically, then validate it with an app-owned strict schema containing exactly finite numeric `createdAt` and non-empty string `id`.
  - Reject legacy and shape-invalid cursors as generic `VALIDATION_ERROR`.
  - Continue fetching `limit+1` from the audit repository.
  - Call `takeListPage` on raw audit rows before parsing metadata or mapping DTOs.
  - Build cursor keysets as `{ createdAt: epochMs, id }`.
  - Return `{ items, nextCursor }` from the service and append `requestId` in the route.
- **Verify:**
  - `bun run --filter @kit/example-api test -- src/audit.test.ts`
  - `bun run --filter @kit/example-api typecheck`
  - `rg 'split\\(.?:.?' apps/example-api/src/services/audit.ts` returns no legacy cursor parser.
- **Expected:** T5 turns GREEN; old public cursor strings are rejected.
- **Time:** 12 min
- **Difficulty:** 4
- **Traces:** A3, A5, SC-audit
- **Phase:** GREEN
- **Subject:** audit

#### Task 8: Compose users staff, search, and keyset page correctly → backend-dev-C

- **Files:**
  - `apps/example-api/src/repos/users.ts`
  - `apps/example-api/src/services/admin-users-list.ts`
  - `apps/example-api/src/routes/admin-users.ts`
- **Repository implementation:**
  - Remove `offset`.
  - Accept an optional validated `{ createdAt: number; id: string }` keyset.
  - Convert cursor milliseconds to `Date` for comparison with Better Auth `createdAt`.
  - Compose staff `userIds`, trimmed `q`, and the keyset predicate into one `WHERE`.
  - For descending order, use the symmetric predicate:
    - `createdAt < cursorDate`, or
    - `createdAt = cursorDate AND id < cursor.id`.
  - Order by `createdAt DESC, id DESC`.
  - Fetch `limit+1`.
- **Service implementation:**
  - Preserve staff shared-org calculation before repository paging.
  - Decode the cursor and validate exactly finite numeric `createdAt` plus non-empty string `id`.
  - Run `takeListPage` on raw user rows.
  - Convert retained raw-row `Date` values to epoch milliseconds for cursor generation.
  - Fetch platform roles only for retained page item IDs.
  - Map retained rows to DTOs only after page extraction; convert `Date` to ISO for the DTO.
  - Preserve the page’s `nextCursor` while replacing raw items with DTO items.
- **Route implementation:**
  - Extend/refine the shared query schema so `q` remains capped at 120.
  - Remove `offset` from accepted input.
  - Return `{ ...page, requestId }`.
- **Verify:**
  - `bun run --filter @kit/example-api test -- src/admin-users.test.ts`
  - `bun run --filter @kit/example-api typecheck`
  - `rg '\\boffset\\b' apps/example-api/src/repos/users.ts apps/example-api/src/services/admin-users-list.ts apps/example-api/src/routes/admin-users.ts` returns no list-path match.
- **Expected:** T6 turns GREEN; staff visibility cannot be bypassed by pagination and role work excludes the sentinel row.
- **Time:** 18 min
- **Difficulty:** 5
- **Traces:** A4, A5, SC-users, SC-staff×cursor, SC-date-ms
- **Phase:** GREEN
- **Subject:** users

### Slice V4: example-web admin users

#### Task 9: Consume pages with `useInfiniteQuery` and localized Load more → frontend-dev-A

- **Files:**
  - `apps/example-web/src/routes/admin/users.tsx`
  - `apps/example-web/src/messages/fr.ts`
  - `apps/example-web/src/messages/en.ts`
- **Implementation:**
  - Replace the users `useQuery` with `useInfiniteQuery`.
  - Type each page as `{ items: AdminUser[]; nextCursor: string | null; requestId: string }`.
  - Include normalized `q` in the query key.
  - Use `pageParam` as the cursor and `getNextPageParam` from `nextCursor`.
  - Flatten `data.pages.flatMap(page => page.items)` for rendering.
  - Changing `q` starts a distinct query from the first page.
  - Render an app-owned button only when `hasNextPage`.
  - Disable or show pending state while `isFetchingNextPage`.
  - Add matching FR and EN message keys for Load more/loading continuation copy.
  - Keep French as the default and do not add a shared UI primitive.
- **Verify:**
  - `bun run --filter @kit/example-web typecheck`
  - `bun run --filter @kit/example-web test`
  - `bun run i18n:check`
  - `rg 'useInfiniteQuery|getNextPageParam|fetchNextPage' apps/example-web/src/routes/admin/users.tsx`
- **Expected:** All loaded pages remain visible, search resets continuation, and catalogs retain key parity.
- **Time:** 15 min
- **Difficulty:** 4
- **Traces:** U1, U2, U3, SC-web, CP-I18N
- **Phase:** GREEN
- **Subject:** admin-ui

### Slice V5: Docs polish and final verification

#### Task 10: Document the data-shape rule and run final gates → doc-writer-A

- **Files:**
  - `docs/ui-kit.md`
  - `AGENTS.md`
- **Documentation:**
  - Add the catalogue versus capped lookup versus aggregate data-shape rule.
  - Record notes as a demo-size exception that must migrate if it becomes unbounded.
  - Point list guidance to `docs/kit/architecture/adr/0010-list-page-cursor-envelope.md`.
  - Keep TanStack Virtual as P1 and recommend app-owned virtualization when needed.
  - Do not claim snapshot consistency, authenticated cursors, totals, or generic SQL paging.
- **Verify:**
  - `rg '0010-list-page-cursor-envelope|catalogue|aggregate|demo' docs/ui-kit.md AGENTS.md`
  - `bun run --filter @kit/types test`
  - `bun run --filter @kit/core test`
  - `bun run --filter @kit/example-api test`
  - `bun run --filter @kit/example-web test`
  - `bun run i18n:check`
  - `bun run validate:full`
  - `bun run zero-edit`
- **Expected:** Focused suites and full local kit gate are green; docs reference ADR-0010 consistently; no product strings or zero-edit violations.
- **Time:** 15 min
- **Difficulty:** 3
- **Traces:** D2, D3, SC-docs, CP-BAN, CP-EXTRACT, CP-ZERO-EDIT
- **Phase:** GREEN
- **Subject:** docs

## Task Seeding Blueprint

<!-- Used by /implement to seed TaskCreate calls on session start.
     Format: T{n} | agent-instance | blockedBy | subject -->

### Wave 1 — no dependencies, 2 agents ∥

| Task | Agent instance | blockedBy | Subject |
|------|----------------|-----------|---------|
| T1 | tester-A | — | lists |
| T5 | tester-B | — | audit |

### Wave 2 — after Wave 1 RED, 2 agents ∥

| Task | Agent instance | blockedBy | Subject |
|------|----------------|-----------|---------|
| RG-V1 | tester-A | T1 | lists |
| T6 | tester-B | T5 | users |

### Wave 3 — after shared and endpoint RED gates, 2 agents ∥

| Task | Agent instance | blockedBy | Subject |
|------|----------------|-----------|---------|
| T2 | backend-dev-A | RG-V1 | lists |
| T3 | backend-dev-A | T2 | lists |
| RG-V3 | tester-B | T6 | users |

### Wave 4 — shared helpers and endpoint RED complete, 3 agents ∥

| Task | Agent instance | blockedBy | Subject |
|------|----------------|-----------|---------|
| T7 | backend-dev-B | T3, RG-V3 | audit |
| T8 | backend-dev-C | T3, RG-V3 | users |
| T4 | doc-writer-A | T3 | adr |

### Wave 5 — users API contract complete

| Task | Agent instance | blockedBy | Subject |
|------|----------------|-----------|---------|
| T9 | frontend-dev-A | T8 | admin-ui |

### Wave 6 — implementation and ADR complete

| Task | Agent instance | blockedBy | Subject |
|------|----------------|-----------|---------|
| T10 | doc-writer-A | T4, T7, T8, T9 | docs |

## Task IDs

- T1: Add separate RED schema and core list-page test suites
- RG-V1: Confirm both shared-package suites fail for expected missing behavior
- T2: Export the typed list query and page envelope contract
- T3: Implement strict Worker-compatible cursor and page helpers
- T4: Record the list-page decision in ADR-0010
- T5: Add RED audit continuation and endpoint keyset tests
- T6: Add RED users scope, keyset, temporal, and page-order tests
- RG-V3: Confirm both endpoint suites fail for expected contract gaps
- T7: Migrate audit to shared helpers and strict endpoint keysets
- T8: Migrate users to composed staff/search/keyset pagination
- T9: Add infinite-query pagination and localized continuation UI
- T10: Update list guidance and run focused plus full gates
