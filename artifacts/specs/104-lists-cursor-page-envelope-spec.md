---
title: "feat(lists): kit cursor page envelope + example dogfood"
description: "Opaque keyset cursor list contract in @kit/types + @kit/core; dogfood admin users + audit; ADR-0010."
type: spec
status: approved
issue: 104
tier: F-lite
---

## Context

**Promoted from:** [lists cursor page envelope frame](../frames/104-lists-cursor-page-envelope-frame.md) (approved, F-lite)  
**GitHub issue:** [#104](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/104)  
**Refs:** [ADR-0001](../../docs/kit/architecture/adr/0001-primary-axis-packages-compose-apps.md) (≥2 call sites) · [ADR-0010](../../docs/kit/architecture/adr/0010-list-page-cursor-envelope.md) · `admin-users` offset · `admin-audit` `createdAt:id` cursor · AGENTS TanStack Table / Virtual P1

This refresh incorporates the approved design deltas but returns the specification to **draft** until human re-approval.

## Intent

`example-api` already ships two divergent list contracts (`limit` + `offset` + `{ users }` versus `limit` + `cursor` + `{ items, nextCursor }`) plus a notes dump. These are copyable kit behaviors. The kit must own one opaque-cursor envelope before consumers freeze on offset, dump-all, or another pagination flavor.

Why now: LGU already windows dumps client-side. The contract must first be promoted and dogfooded in kit HEAD; product implementation remains outside this issue and pulls later through `upstream`.

Product-lead disposition is accepted:

- well-formed client-minted seek cursors are acceptable because cursors are not authorization boundaries;
- the notes dump may remain a documented demo-size exception;
- LGU implementation remains out of scope.

## Goal

Migrated admin users and audit list routes—and any **new** kit catalogue list routes—use the wire envelope `{ items, nextCursor, requestId }` with opaque keyset cursors.

Reusable schemas and types live in `@kit/types`; Worker-safe cursor, limit, and page extraction helpers live in `@kit/core`. SQL, authorization, endpoint-specific keyset validation, and DTO mapping remain app-owned. `example-web` admin users uses `useInfiniteQuery` and an app-owned, localized Load more control so the list is no longer silently truncated at 50 rows.

## Users

- **Primary:** kit maintainers shipping extractible list helpers and `example-*` dogfood.
- **Secondary:** product engineers who pull the kit through `upstream` and later apply the envelope to product catalogue routes.

## Expected Behavior

### Kit contract (normative)

| Piece | Behavior |
|-------|----------|
| Query | `limit` (1–100, default **50** via helper), optional `cursor` (max **512**), and optional conventional `q` |
| Envelope (wire) | `{ items, nextCursor, requestId }`; `nextCursor === null` means the last page |
| `ListPage<T>` | `{ items, nextCursor }` only; `requestId` remains route/middleware-owned |
| Cursor | Opaque-by-convention base64url JSON keyset; not an authorization or security boundary |
| Encoding | Unicode-safe and Worker-compatible through Web APIs (`TextEncoder`, `TextDecoder`, `btoa`, `atob`); no Node `Buffer` |
| Generic decode | Verifies base64url/JSON and returns a generic keyset record or throws `AppError.validation` |
| Endpoint validation | Runs after generic decode and validates the exact endpoint keyset shape before SQL |
| Malformed cursor | Wrong encoding, non-object payload, wrong endpoint keys/types, or legacy audit `createdAt:id` → `VALIDATION_ERROR`; generic message with no keyset/schema leak |
| Offset | Not the kit default; removed from the admin-users query schema |
| `total` | Not included by default because it implies a D1 scan |
| Resource keys | `{ users }` is forbidden on new kit lists; admin users migrates to `items` |
| SQL | Repository owns stable ordering, keyset predicate, authorization scope, and `limit+1` fetch |
| Package | No new `@kit/pagination`; schemas/types live in `@kit/types`, mechanics in `@kit/core` |
| Premise | This issue hardens admin users and audit. Notes remains a documented demo-size exception |

### Data-shape rule (ADR + docs)

| Shape | Contract |
|-------|----------|
| Unbounded catalogue (users, audit, notes if it grows, future product catalogues) | Cursor + `items` |
| Small lookup or documented demo-size data | Hard cap or known-small dump; optional `q` |
| Aggregate or insights | Not a list; aggregate on the server instead of paging rows for browser reduction |

### Helpers

```ts
// @kit/types
listQuerySchema
// { limit?: number, cursor?: string, q?: string }
// limit: coerced integer 1..100; cursor: string max 512; q: optional

type ListPage<T> = {
  items: T[]
  nextCursor: string | null
}

// @kit/core
clampListLimit(n: number | undefined): number
encodeListCursor(keyset: Record<string, string | number>): string
decodeListCursor(cursor: string): Record<string, string | number>
takeListPage<T>(
  rows: T[],
  limit: number,
  keysetOf: (row: T) => Record<string, string | number>,
): ListPage<T>
```

`encodeListCursor` and `decodeListCursor` use Web APIs only. UTF-8 bytes are converted safely around `btoa`/`atob`; implementations must not depend on `Buffer`.

`decodeListCursor` performs only generic decoding. Each endpoint then validates its exact keyset before constructing SQL:

- payload has exactly `createdAt` and `id`;
- `createdAt` is a finite epoch-millisecond number;
- `id` is a non-empty string;
- unusable or unexpected values never reach repository predicates.

`takeListPage` receives raw repository rows already fetched with `limit+1`. It retains `rows.slice(0, limit)` and derives `nextCursor` from the final retained raw row when another row exists. DTO mapping happens only afterward.

Temporal cursor values are frozen as finite epoch milliseconds. Better Auth `Date` values convert to epoch milliseconds for cursor creation and SQL comparison; response DTOs continue to expose `createdAt` as ISO strings.

The UI resets pagination when `q` changes. The API does not bind `q` into the cursor in this issue, so a valid cursor may be reused with another query as a permitted seek.

### Dogfood

1. **admin-audit**
   - Adopt the shared query schema and helpers.
   - Fetch `limit+1`.
   - Validate the decoded endpoint keyset before SQL.
   - Retire and explicitly reject public `createdAt:id` cursors.
   - Return `{ items, nextCursor, requestId }`.
   - Test continuation round trips and non-null cursors from `limit+1` fixtures.

2. **admin-users**
   - Extend `listQuerySchema` to preserve `q: z.string().max(120).optional()`.
   - Remove `offset`.
   - Order by `createdAt DESC, id DESC`.
   - Apply the matching lexicographic keyset predicate.
   - Apply staff visibility before keyset pagination.
   - Fetch `limit+1`.
   - Cut the page and create the cursor from raw rows before mapping `Date` values to ISO response DTOs.
   - Return `{ items, nextCursor, requestId }`.
   - Test page-two round trips and staff isolation across continuation pages.

3. **example-web `/admin/users`**
   - Use `useInfiniteQuery`.
   - Pass `nextCursor` as the next `pageParam`.
   - Flatten returned pages for rendering.
   - Include `q` in the query key so search changes restart pagination.
   - Render an app-owned Load more button while `nextCursor` is non-null.
   - Add FR and EN Load more copy to the app-owned catalogues.
   - Do not add an `@kit/ui` `LoadMore` component.

4. **notes**
   - Keep the dump as a documented demo-size exception.
   - Document that growth into an unbounded catalogue requires the cursor envelope.

5. **ADR-0010**
   - Use `docs/kit/architecture/adr/0010-list-page-cursor-envelope.md`.
   - Record the opaque keyset envelope, Worker-safe encoding, raw-row paging rule, endpoint validation boundary, accepted client seek, unbound `q`, and concurrent-write trade-offs.

6. **Docs pointers**
   - Add the data-shape rule to `docs/ui-kit.md`.
   - Point the AGENTS TanStack Table guidance to ADR-0010.
   - Keep TanStack Virtual at P1.

### Breaking changes (acceptable)

| Surface | Break |
|---------|-------|
| `GET /api/admin/users` | `offset` removed; `{ users, requestId }` becomes `{ items, nextCursor, requestId }` |
| `GET /api/admin/audit-events` | Existing public `createdAt:id` cursors are rejected; wire remains `{ items, nextCursor, requestId }` |

## Out of Scope

- LGU `/api/base`, `/api/tournages`, BaseExplorer palier, or any other product implementation
- Numbered offset pages with `total`
- Infinite scroll or `IntersectionObserver` in `@kit/ui`
- `@tanstack/react-virtual` adoption
- Changing tiny lookups such as `GET /api/orgs` or roles unless they already page
- Flows admin pagination; defer it unconditionally
- Generic Drizzle pager or shared `WHERE` builder
- Authenticated or encrypted cursors
- Snapshot pagination or guarantees against concurrent-write skips/duplicates

## Data Model & Consumers

### Data structure

| Type | Fields | Frozen / mutable |
|------|--------|------------------|
| `ListPage<T>` | `items: T[]`, `nextCursor: string \| null` | Kit contract frozen by this issue; intentionally omits `requestId` |
| Wire envelope | `items`, `nextCursor`, `requestId` | Consistent across migrated routes |
| List query | `limit?`, `cursor?`, `q?` | `q` conventional; admin users extends it with max 120 |
| Generic cursor payload | `Record<string, string \| number>` | Internal decoded form |
| Audit keyset | exact `createdAt` finite epoch ms + non-empty `id` | Endpoint-validated after generic decode |
| Users keyset | exact `createdAt` finite epoch ms + non-empty `id` | Matches `createdAt DESC, id DESC` |
| Response timestamps | ISO strings | DTO representation only; never cursor temporal representation |

No new D1 tables.

### Consumers

| Consumer | Fields | Status |
|----------|--------|--------|
| `admin-audit` service/route | `limit`, `cursor`, `items`, `nextCursor`, `requestId` | This issue |
| `admin-users` route/service/repository | Cursor page; `q` max 120; staff scope before page | This issue |
| `example-web` `/admin/users` | Flattened infinite-query pages and Load more | This issue |
| `GET /api/notes` | Demo-size dump | Document only |
| Product catalogues, including LGU | Same envelope after upstream adoption | Outside this issue |
| `@kit/ui` `LoadMore` | None | Deferred until justified by another call site |

## Breadboard

### API

| ID | Affordance | Handler | Data |
|----|------------|---------|------|
| A1 | `listQuerySchema` + `ListPage<T>` | `@kit/types` exports | Zod query schema and page type without `requestId` |
| A2 | Clamp, encode, decode, page extraction | `@kit/core` | Worker-safe base64url; malformed input fails closed |
| A3 | Audit keyset validation | Audit route/service after generic decode | Exact finite `createdAt` + non-empty `id` |
| A4 | `GET /api/admin/audit-events?limit&cursor` | Audit route → service/repository | `{ items, nextCursor, requestId }` |
| A5 | Admin-users schema extension | Admin-users route | Shared schema extended with `q` max 120 |
| A6 | Users keyset validation and query | Staff scope → keyset predicate → `limit+1` | Raw rows ordered by `createdAt DESC, id DESC` |
| A7 | `GET /api/admin/users?limit&cursor&q` | Repository → service → route | `{ items, nextCursor, requestId }` |
| A8 | Malformed or legacy cursor | Generic decode then endpoint schema | `VALIDATION_ERROR` without decoded details |

### UI

| ID | Affordance | Handler | Data |
|----|------------|---------|------|
| U1 | Admin users table | `useInfiniteQuery` | Flattened `items` from all loaded pages |
| U2 | Load more | App-owned button | `fetchNextPage()` using `nextCursor` as `pageParam` |
| U3 | Search `q` | Existing search input and query key | New query starts from the first page |
| U4 | Localized continuation copy | App FR/EN catalogues | French and English Load more labels |

### Docs / ADR

| ID | Affordance | Handler | Data |
|----|------------|---------|------|
| D1 | ADR-0010 | `docs/kit/architecture/adr/0010-list-page-cursor-envelope.md` | Contract, validation boundary, raw-row paging, trade-offs |
| D2 | `docs/ui-kit.md` | Catalogue versus lookup/demo versus aggregate | Notes exception and app virtualization guidance |
| D3 | AGENTS TanStack Table guidance | Link to ADR-0010 | Virtual remains P1 |

## Slices

| # | Slice | Demo | Affordance IDs |
|---|-------|------|----------------|
| V1 | Types + Worker-safe core helpers + unit tests | Unicode base64url round trip without `Buffer`; malformed decode fails closed; clamp and page math verified | A1, A2, A8 |
| V2 | ADR-0010 | Decision records client seek, endpoint validation, raw-row paging, concurrent writes, and unbound `q` | D1 |
| V3 | Wire audit + users API and rewrite tests | Exact keyset validation; `limit+1`; route round trips; staff × cursor isolation; legacy cursor rejection | A3–A8 |
| V4 | `example-web` admin users | `useInfiniteQuery`; flattened pages; localized Load more; `q` resets pagination | U1–U4 |
| V5 | Docs polish | Data-shape rule, notes exception, AGENTS pointer to ADR-0010 | D2, D3 |

## Success Criteria

- [ ] `listQuerySchema` and `ListPage<T>` are exported from `@kit/types`; `ListPage<T>` contains only `items` and `nextCursor`
- [ ] `listQuerySchema` supports a coerced integer limit from 1 to 100, cursor max 512, and optional conventional `q`
- [ ] Admin users extends the shared schema to enforce `q` max 120
- [ ] `clampListLimit`, `encodeListCursor`, `decodeListCursor`, and `takeListPage` are exported from `@kit/core`
- [ ] Cursor encoding is Unicode-safe and Worker-compatible through Web APIs; implementation and tests do not rely on `Buffer`
- [ ] Generic decode rejects bad base64url, invalid JSON, and non-object payloads with `VALIDATION_ERROR`
- [ ] Audit and users validate their exact `createdAt`/`id` keyset after generic decode and before SQL
- [ ] Endpoint keysets require a finite epoch-millisecond `createdAt`, a non-empty string `id`, and no unexpected fields
- [ ] Cursor validation errors use a generic message with no decoded keyset or schema leak
- [ ] Legacy audit `createdAt:id` cursors are rejected with `VALIDATION_ERROR`
- [ ] `clampListLimit` defaults to 50 and clamps to the 1–100 range
- [ ] Exactly `limit` fetched rows produce `nextCursor === null`; `limit+1` rows produce a cursor
- [ ] Audit and users repositories/services both fetch `limit+1`; call-site tests prove a non-null cursor from `limit+1` fixtures
- [ ] Pages and cursors are derived from raw repository rows before DTO mapping
- [ ] Cursor `createdAt` values use finite epoch milliseconds; response DTO `createdAt` values remain ISO strings
- [ ] `GET /api/admin/audit-events` returns `{ items, nextCursor, requestId }` and continuation round trips
- [ ] `GET /api/admin/users` removes offset and returns `{ items, nextCursor, requestId }`
- [ ] Users ordering is `createdAt DESC, id DESC` with a symmetric lexicographic keyset predicate
- [ ] Staff authorization scope is applied before keyset pagination
- [ ] Staff continuation pages never return out-of-scope user IDs
- [ ] Empty staff scope returns `{ items: [], nextCursor: null, requestId }`
- [ ] `example-web` admin users uses `useInfiniteQuery`, `nextCursor` as `pageParam`, and flattened pages
- [ ] Changing `q` restarts pagination because `q` is included in the query key
- [ ] FR and EN Load more copy exists in the app-owned catalogues
- [ ] No `@kit/ui` `LoadMore` component is introduced
- [ ] Notes remains a documented demo-size dump exception
- [ ] ADR-0010 exists at `docs/kit/architecture/adr/0010-list-page-cursor-envelope.md`
- [ ] ADR-0010 records accepted client seek, unbound `q`, and concurrent skip/duplicate behavior
- [ ] `docs/ui-kit.md` documents catalogue, lookup/demo-size, and aggregate shapes
- [ ] AGENTS list guidance points to ADR-0010 while TanStack Virtual remains P1
- [ ] Flows pagination receives no implementation in this issue
- [ ] LGU receives no implementation or product-domain code in this issue
- [ ] No product business strings are added under `packages/*`
- [ ] Lint, typecheck, and touched package/example tests are green

## Edge Cases

| Case | Handling |
|------|----------|
| Empty page | Wire returns `{ items: [], nextCursor: null, requestId }` |
| Exactly `limit` rows fetched | `nextCursor === null` |
| `limit+1` rows fetched | Keep `limit`; derive cursor from the last retained raw row |
| Unicode keyset value | Worker-safe Web API encoding round-trips correctly |
| Malformed base64url or JSON | `VALIDATION_ERROR` with generic message |
| Generic object with wrong endpoint keys/types | Endpoint validation rejects it before SQL |
| Non-finite or non-numeric `createdAt` | Endpoint validation rejects it |
| Empty `id` | Endpoint validation rejects it |
| Legacy audit `createdAt:id` cursor | Rejected as `VALIDATION_ERROR` |
| Well-formed client-minted keyset | Allowed seek inside the already-authorized result set |
| Better Auth `Date` | Convert to epoch milliseconds for cursor/SQL; map to ISO only in response DTO |
| Staff with no shared organizations | Empty page before pagination, with or without a cursor |
| `q` change after pages loaded | New `useInfiniteQuery` key starts from the first page |
| Stale cursor reused with another `q` | Accepted as client seek; cursor is not query-bound |
| Concurrent inserts or deletes | Pages may skip or duplicate rows; no snapshot or `total` guarantee |
| Notes remains a dump | Accepted while it remains explicitly demo-sized; migrate if it becomes an unbounded catalogue |