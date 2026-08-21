---
title: "feat(lists): kit cursor page envelope + example dogfood"
description: "Opaque keyset cursor list contract in @kit/types + @kit/core; dogfood admin users + audit; ADR-0009."
type: spec
status: approved
issue: 104
tier: F-lite
---

## Context

**Promoted from:** [lists cursor page envelope frame](../frames/104-lists-cursor-page-envelope-frame.md) (approved, F-lite)
**GitHub issue:** [#104](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/104)
**Refs:** ADR-0001 (≥2 call sites) · `admin-users` offset · `admin-audit` `createdAt:id` cursor · AGENTS TanStack Table / Virtual P1

## Intent

`example-api` already ships two divergent list contracts (`limit`+`offset`+`{ users }` vs `limit`+`cursor`+`{ items, nextCursor }`) plus a notes dump. Products (LGU catalogues) are about to invent a third flavour. The kit must own one opaque-cursor envelope before consumers freeze on offset or dump-all.

Why now: LGU already windows dumps client-side; promote in kit HEAD, products pull via `upstream`.

## Goal

Migrated admin users/audit list routes (and any **new** kit list routes) use `{ items, nextCursor, requestId }` with opaque cursors; helpers live in `@kit/types` + `@kit/core`; short ADR + `docs/ui-kit.md` data-shape rule; example-web admin users pages via `nextCursor` (no silent 50-truncation).

## Users

- **Primary:** kit maintainer shipping extractible list helpers + `example-*` dogfood.
- **Secondary:** product engineers who `git fetch upstream` and apply the envelope on catalogue routes only.

## Expected Behavior

### Kit contract (normative)

| Piece | Behavior |
|-------|----------|
| Query | `limit` (1–100, default **50** via helper) + optional `cursor` (max **512**) + optional conventional `q` |
| Envelope (wire) | `{ items, nextCursor, requestId }` — `nextCursor === null` ⇒ last page. `requestId` stays route/middleware-owned — **not** part of `ListPage<T>` |
| Cursor | Opaque-by-convention string (base64url JSON keyset). **Not** a security boundary: well-formed client-minted keysets seek to that position (same class as today’s public `ts:id`). Public `createdAt:id` concat **retired** on audit (rejected as invalid) |
| Malformed cursor | Wrong encoding / non-object payload → `AppError.validation` → `VALIDATION_ERROR`; message generic; **no** keyset / schema leak. ≠ “client seek” (seek is allowed) |
| Offset | **Not** the kit default; drop from admin-users query schema |
| `total` | Not default (D1 table scan) |
| Resource keys | `{ users }` forbidden on **new** kit lists; admin-users migrates to `items` |
| SQL | Repo owns `ORDER BY` + keyset `WHERE` + fetch `limit+1`; helpers do **not** build SQL |
| Package | No new `@kit/pagination` — schemas in `@kit/types` (add `zod` dep if missing), helpers in `@kit/core` |
| Premise narrow | This ticket hardens **admin catalogues** (users + audit). Notes dump remains a documented demo exception (not a third pagination API) |

### Data-shape rule (ADR + docs)

| Shape | Contract |
|-------|----------|
| Unbounded catalogue (users, audit, notes-if-grown, product catalogues) | cursor + `items` |
| Small lookup (roles, a dozen creators) | hard cap + optional `q`; dump OK under the cap |
| Aggregate / insights | **not a list** — server aggregates; do not page rows for the browser to reduce |

### Helpers

```ts
// @kit/types
listQuerySchema  // { limit?: number, cursor?: string, q?: string }
// limit: coerce int 1..=100 optional; cursor: string max 512 optional; q optional
type ListPage<T> = { items: T[]; nextCursor: string | null }  // wire adds requestId separately

// @kit/core
clampListLimit(n: number | undefined): number  // default 50, max 100, min 1
encodeListCursor(keyset: Record<string, string | number>): string
decodeListCursor(cursor: string): Record<string, string | number>  // throws AppError.validation
takeListPage<T>(
  rows: T[],
  limit: number,
  keysetOf: (row: T) => Record<string, string | number>,
): ListPage<T>
```

`takeListPage`: rows must already be fetched with `limit+1`. Returns `items = rows[0..limit)` and `nextCursor` from last kept row via `keysetOf` (or `null` if `rows.length ≤ limit`). Call sites (audit + users services/repos) **must** fetch `limit+1` — helper math alone does not prove no silent EOF.

**Keyset value encoding (frozen):** temporal fields in the keyset are **epoch milliseconds** (`number`). BA `Date` / ISO strings convert at the boundary before `encodeListCursor` / SQL compare. Do not mix ISO strings and ms in the same keyset.

**`q` + cursor:** UI resets cursor when `q` changes. API does **not** bind `q` into the cursor this ticket — unbound `q`+stale cursor is accepted (same class as seek). Document in ADR.

### Dogfood

1. **admin-audit** — switch to helpers + shared `listQuerySchema` (or `.extend`); stop exporting `createdAt:id` (old format → `VALIDATION_ERROR`). Round-trip `nextCursor` tested; fixture with `limit+1` rows ⇒ non-null cursor.
2. **admin-users** — migrate offset → cursor; response `{ items, nextCursor, requestId }`. Repo: drop `offset`; `ORDER BY createdAt DESC, id DESC` + keyset `WHERE` matching that order; fetch `limit+1`. Staff scope applied **before** keyset page (not page-then-filter). Drop `offset` from query schema. Tests: staff-before-page rewritten; **staff + cursor continuation never returns out-of-scope ids**; users `nextCursor` page-2 round-trip; `limit+1` fixture ⇒ non-null cursor.
3. **example-web `/admin/users`** — consume `items` + `nextCursor`; Load more button in the **app** (one call site → no `@kit/ui` `LoadMore` this ticket). Changing `q` resets cursor / refetch from start. Stop silent default-50 truncation.
4. **notes** — stay dump under implicit demo size; document in `docs/ui-kit.md` as **demo exception** under the lookup/demo-size rule (premise = admin catalogues, not “every example list”). No kit `LoadMore`.
5. **ADR-0009** — short, non-axial: list pages = opaque-by-convention cursor envelope; client seek allowed; concurrent-write skip/dup tradeoff; unbound `q`+cursor; consumer note for catalogues vs insights.
6. **Docs pointers (with V5):** `docs/ui-kit.md` data-shape table; AGENTS TanStack Table row → ADR-0009; Virtual still P1.

### Breaking (acceptable)

| Surface | Break |
|---------|--------|
| `GET /api/admin/users` | `offset` removed; body `{ users }` → `{ items, nextCursor }` |
| `GET /api/admin/audit-events` | cursor encoding opaque (old `createdAt:id` rejected as invalid) |

## Out of Scope

- LGU `/api/base`, `/api/tournages`, BaseExplorer palier — product after upstream pull
- Numbered offset pages with `total`
- Infinite-scroll / IntersectionObserver in `@kit/ui`
- `@tanstack/react-virtual` package (still AGENTS P1; recipe “virtualize in the app”)
- Changing tiny lookups (`GET /api/orgs`, roles) unless they already page
- Flows admin pagination (#31) unless already in tree and cheap
- Generic Drizzle pager / shared `WHERE` builder

## Data Model & Consumers

### Data structure

| Type | Fields | Frozen / mutable |
|------|--------|------------------|
| `ListPage<T>` | `items: T[]`, `nextCursor: string \| null` | kit contract frozen this issue |
| List query | `limit?`, `cursor?`, `q?` | `q` name conventional; filter SQL app-owned |
| Cursor payload | `Record<string, string \| number>` | kit-private; never in public docs as wire format |
| Audit keyset | `createdAt` (epoch ms) + `id` | same columns; wire encoding opaque |
| Users keyset | `createdAt` (epoch ms) + `id` | **required** `ORDER BY createdAt DESC, id DESC` + matching keyset `WHERE`; drop `offset` |

No new D1 tables.

### Consumers

| Consumer | Fields | Status |
|----------|--------|--------|
| `admin-audit` service/route | `limit`, `cursor`, `items`, `nextCursor` | **this issue** |
| `admin-users` service/route + repo | cursor page; staff scope before page | **this issue** |
| `example-web` `/admin/users` | `items`, `nextCursor`, Load more | **this issue** |
| `GET /api/notes` | dump | **document only** |
| Product catalogues (LGU…) | same envelope | **after** upstream — not this ticket |
| `@kit/ui` `LoadMore` | — | **deferred** (need 2 example-web sites) |

## Breadboard

### API

| ID | Affordance | Handler | Data |
|----|------------|---------|------|
| A1 | `listQuerySchema` + `ListPage<T>` | `@kit/types` exports | Zod (cursor max 512) + type |
| A2 | `clampListLimit` / encode / decode / `takeListPage` | `@kit/core` | opaque-by-convention; malformed → validation |
| A3 | `GET /api/admin/audit-events?limit&cursor` | `admin-audit` → service (`limit+1` fetch) | `{ items, nextCursor, requestId }` |
| A4 | `GET /api/admin/users?limit&cursor&q` | repo keyset + staff scope → service → route | `{ items, nextCursor, requestId }` |
| A5 | Malformed cursor (incl. legacy `createdAt:id`) | `decodeListCursor` + wired routes | `VALIDATION_ERROR` |

### UI

| ID | Affordance | Handler | Data |
|----|------------|---------|------|
| U1 | Admin users table | `example-web` `/admin/users` | `items` from page 1 |
| U2 | Load more | app button + query append / page stack | `nextCursor` until `null` |
| U3 | Search `q` | existing search input | resets cursor / refetch from start |

### Docs / ADR

| ID | Affordance | Handler | Data |
|----|------------|---------|------|
| D1 | ADR-0009 | `docs/architecture/adr/0009-…` | cursor envelope + data-shape rule |
| D2 | `docs/ui-kit.md` | catalogue vs lookup vs aggregate; notes dump OK; virtualize in app | pointers |
| D3 | AGENTS.md TanStack Table row | list envelope → ADR-0009; Virtual still P1 | one-line |

## Slices

| # | Slice | Demo | Affordance IDs |
|---|-------|------|----------------|
| V1 | Types + core helpers + unit tests (`zod` on `@kit/types` if needed) | malformed decode fail-closed; clamp 50/100/1; `takeListPage` math | A1, A2, A5 (helper) |
| V2 | ADR-0009 file | ADR committed (seek / concurrent / `q`+cursor notes) | D1 |
| V3 | Wire audit + users API + rewrite tests | audit + users round-trip; staff×cursor; route `limit+1`; legacy cursor reject | A3, A4, A5 (wired) |
| V4 | example-web admin users | Load more; `q` resets cursor; no silent 50 cut | U1, U2, U3 |
| V5 | Docs polish | `ui-kit.md` data-shape + notes demo exception; AGENTS → ADR-0009 | D2, D3 |

## Success Criteria

- [ ] `listQuerySchema` + `ListPage<T>` exported from `@kit/types` (`cursor` max 512; `zod` dep if needed)
- [ ] `clampListLimit` / `encodeListCursor` / `decodeListCursor` / `takeListPage` exported from `@kit/core`
- [ ] Malformed cursor (bad base64url / non-object / legacy audit `createdAt:id`) → `VALIDATION_ERROR` (tested); message has no keyset / schema leak
- [ ] `clampListLimit` default 50 / max 100 / min 1 (tested)
- [ ] `takeListPage`: exactly `limit` rows ⇒ `nextCursor === null`; `limit+1` ⇒ cursor set (tested)
- [ ] Audit **and** users services fetch `limit+1`; with `limit+1` fixtures, `nextCursor` is non-null (tested — not helper-only)
- [ ] `GET /api/admin/audit-events` uses helpers; `nextCursor` round-trip tested
- [ ] `GET /api/admin/users` is cursor, not offset; repo uses `ORDER BY createdAt DESC, id DESC` + keyset `WHERE`; staff scope before page (existing test rewritten)
- [ ] Staff + cursor continuation never returns out-of-scope user ids; empty shared-org set → `{ items: [], nextCursor: null }` under cursor too (tested)
- [ ] Users `nextCursor` page-2 round-trip tested
- [ ] Wire responses are `{ items, nextCursor, requestId }` — no `{ users }` / `offset` on these routes (`ListPage` type omits `requestId` by design)
- [ ] example-web `/admin/users` lists via `nextCursor` (Load more); changing `q` resets cursor; no silent default-50 truncation
- [ ] Notes remain dump; `docs/ui-kit.md` documents demo-size dump exception + catalogue vs lookup vs aggregate
- [ ] ADR-0009 shipped (opaque-by-convention, client seek allowed, concurrent skip/dup, unbound `q`+cursor); AGENTS TanStack Table row points at it (Virtual still P1)
- [ ] No `@kit/ui` `LoadMore` this ticket (only one example-web call site)
- [ ] 0 product business strings in `packages/*`
- [ ] lint, typecheck, and package / example-api tests green for touched surfaces

## Edge Cases

| Case | Handling |
|------|----------|
| Empty page | `{ items: [], nextCursor: null }` |
| Exactly `limit` rows at DB | after `limit+1` fetch → `nextCursor === null` |
| `limit+1` rows fetched | keep `limit`; set opaque cursor from last kept |
| Malformed / legacy `createdAt:id` cursor | `VALIDATION_ERROR`, generic message |
| Well-formed client-minted keyset | **allowed seek** — not a validation error; ADR states not a security boundary |
| Staff with empty shared-org set | empty `items`, `nextCursor: null` (scope before page, with or without cursor) |
| `q` change mid-scroll | UI resets cursor; fetch from start. API unbound `q`+stale cursor accepted (ADR) |
| Concurrent inserts mid-scroll | keyset may skip/dup — accept; ADR documents tradeoff (no `total`) |
