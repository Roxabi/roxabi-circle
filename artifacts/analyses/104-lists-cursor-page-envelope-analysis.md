---
title: "feat(lists): kit cursor page envelope + example dogfood"
description: "Shapes for opaque keyset list contract in @kit/types + @kit/core; dogfood admin users/audit."
type: analysis
status: approved
issue: 104
tier: F-lite
---

## Source

GitHub [#104](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/104): “Promote a **single kit list-page contract** (cursor + envelope) so products stop inventing `limit`/`offset`, dump-all routes, or a third pagination flavour.”

## Problem

`example-api` already exposes three list shapes:

- admin users: `limit` + `offset`, response `{ users, requestId }`;
- audit events: `limit` + public `createdAt:id` cursor, response `{ items, nextCursor, requestId }`;
- notes: unpaged demo dump.

The divergence is now copyable kit behavior. Admin users also silently stops at the default 50 rows because example-web sends only `q` and has no continuation control. Product catalogue evidence makes promotion timely, but product routes remain outside this issue.

## Outcome

Admin users and audit expose the same observable contract: bounded pages, opaque keyset continuation, `{ items, nextCursor, requestId }`, and `VALIDATION_ERROR` for malformed cursors. Admin users no longer accepts offset, staff visibility remains applied before pagination, and example-web can load every matching page without silently truncating at 50.

The reusable query/page shapes live in `@kit/types`; encoding, limit, and page extraction behavior lives in `@kit/core`. SQL ordering, filtering, DTO mapping, and endpoint-specific cursor validation remain app-owned.

## Appetite

One PR, approximately one day: shared contract and tests, two example-api call sites, one example-web screen, ADR-0010, and concise documentation. No LGU implementation and no generic Drizzle pagination layer.

## Shapes

**Diagram:** [List envelope shapes](../visuals/104-lists-cursor-page-envelope-shapes.html)

### Shape 1: Promote `@kit/types` + `@kit/core` helpers (recommended)

Define `listQuerySchema` and `ListPage<T>` in `@kit/types`; add Worker-compatible cursor encoding/decoding, limit clamping, and `limit+1` page extraction in `@kit/core`. Dogfood the contract in admin users and audit, then consume users with TanStack Query pagination.

**Trade-offs:**

- Pro: one contract across two existing call sites satisfies the package promotion bar.
- Pro: keeps SQL and resource authorization in app repos.
- Pro: removes offset and the public audit cursor without introducing a package.
- Con: adds Zod as a runtime dependency of `@kit/types`.
- Con: both example API contracts break intentionally.
- Con: opacity is conventional, not authenticated; clients can construct valid seek cursors.

**Rough scope:** M — packages, two backend paths, one frontend route, tests, ADR, docs.

### Shape 2: Docs-only / leave example-local

Document cursor preference and keep separate users/audit implementations in `example-api`.

**Trade-offs:**

- Pro: smallest immediate diff.
- Pro: no shared runtime dependency or API migration.
- Con: leaves offset, named envelopes, and duplicated cursor behavior as kit examples.
- Con: prose cannot enforce malformed-cursor behavior or `limit+1` semantics.
- Con: the web users page remains silently truncated unless fixed independently.

**Rough scope:** S — ADR/docs plus an optional local UI patch.

### Shape 3: Thin `@kit/lists` package (killed)

Create a package containing the schema, types, cursor helpers, and potentially query adapters.

**Trade-offs:**

- Pro: discoverable namespace if list behavior later becomes a larger subsystem.
- Con: too little independent responsibility today; it would wrap code naturally owned by existing types/core packages.
- Con: invites generic SQL paging despite keyset predicates being schema- and authorization-specific.
- Con: adds workspace, release, and dependency surface without a distinct lifecycle.

**Rough scope:** M, with unjustified permanent package cost. Killed by the existing package axis and the issue’s explicit no-new-pagination-package constraint.

## Fit Check

**Diagram:** [Recommended data flow](../visuals/104-lists-cursor-page-envelope-data-flow.html)

Shape 1 best fits the one-PR appetite and ADR-0001: shared mechanics are promoted after two concrete call sites, while routes, authorization, keyset predicates, and UI stay in their owning apps.

Accepted trade-offs:

- A cursor is not a security boundary. A well-formed client-minted keyset may seek within the already authorized result set.
- `q` is not bound into the cursor this cycle. Changing `q` in the UI resets pagination; the API still accepts an old cursor with a new query.
- Concurrent writes can produce skip/duplicate behavior between requests. No snapshot or `total` is promised.
- `GET /api/admin/users` breaks from offset and `{ users }` to cursor and `{ items, nextCursor }`.
- Existing audit `createdAt:id` cursors break and must be rejected rather than ambiguously supported.
- Notes remain a documented demo-size dump; this issue standardizes unbounded catalogues, not every small lookup.

## Risks

| Risk | Required handling |
|------|-------------------|
| Staff authorization after paging | Preserve staff scope in the repository query before keyset predicates and `limit+1`; continuation tests must never return out-of-scope IDs. |
| `Date` versus epoch milliseconds | Better Auth users expose `createdAt` as `Date`, while audit stores milliseconds. Normalize cursor temporal values to finite epoch-ms numbers at the boundary. |
| ADR number collision | ADR-0009 already exists (kit namespace polarity). Use `docs/kit/architecture/adr/0010-list-page-cursor-envelope.md` and refresh every stale 0009 reference. |
| Zod in `@kit/types` | Add and lock the runtime dependency deliberately; test coercion and exported schema behavior. |
| Node-only base64 | Workers do not provide `Buffer`. Implement base64url with Web APIs (`TextEncoder`/`TextDecoder`, `btoa`/`atob`) and test Unicode-safe round trips. |
| Generic decode accepted as endpoint keyset | After decoding, each endpoint must validate exact key names and value types: finite numeric `createdAt`, non-empty string `id`, and no unusable payload reaching SQL. |
| Legacy audit cursor accidentally accepted | Explicitly test `createdAt:id` rejection as `VALIDATION_ERROR` with a generic message and no decoded keyset leak. |
| Page computed after DTO mapping | Apply `takeListPage` to raw repository rows, derive the cursor from the last retained raw row, then map to DTOs; users currently stringify `createdAt`. |
| Frontend page accumulation | Use `useInfiniteQuery` with `nextCursor` as `pageParam`, flatten pages, and include `q` in the query key so search resets continuation. |
| UI copy bypasses i18n | Add Load-more copy to the app-owned FR/EN catalog; French remains the default. Do not promote a one-call-site `@kit/ui` component. |

## Files impacted

| File | Change |
|------|--------|
| `packages/types/package.json` | Add Zod runtime dependency. |
| `packages/types/src/index.ts` and list contract module | Export `listQuerySchema` and `ListPage<T>`. |
| `packages/core/src/index.ts` and list-page module/tests | Export and verify clamp, Worker base64url cursor, decode, and `limit+1` page helpers. |
| `apps/example-api/src/routes/admin-users.ts` | Replace offset query/`{ users }` response with cursor envelope; preserve `q` max 120. |
| `apps/example-api/src/services/admin-users-list.ts` | Keep staff scope before page, page raw rows, then map DTOs. |
| `apps/example-api/src/repos/users.ts` | Add stable `createdAt DESC, id DESC` keyset predicate and fetch `limit+1`. |
| `apps/example-api/src/routes/admin-audit.ts` and `services/audit.ts` | Adopt the shared contract and retire public `createdAt:id`. |
| `apps/example-web/src/routes/admin/users.tsx` | Consume pages with `useInfiniteQuery`; reset on `q`; render app-owned Load more. |
| `apps/example-web/src/messages/fr.ts` and `en.ts` | Add localized continuation copy. |
| `apps/example-api/src/admin-users.test.ts` and audit tests | Cover page round trips, malformed/legacy cursors, `limit+1`, and staff × cursor isolation. |
| `docs/kit/architecture/adr/0010-list-page-cursor-envelope.md` | Record the contract, data-shape rule, and accepted pagination trade-offs. |
| `docs/ui-kit.md` and `AGENTS.md` | Point catalogue guidance to ADR-0010; retain Virtual as P1 and notes as a demo exception. |

## Spec deltas (for next /spec refresh)

- Rename every proposed ADR-0009 reference to **ADR-0010** at `docs/kit/architecture/adr/0010-list-page-cursor-envelope.md`.
- Require Worker-compatible, Unicode-safe base64url using Web APIs; forbid reliance on Node `Buffer`.
- Require endpoint-specific validation after generic cursor decode, including exact `createdAt`/`id` keyset shape.
- Preserve admin-users `q` maximum 120 by extending/refining the shared query schema.
- State that pages are cut from raw repository rows before DTO conversion, especially before `Date` becomes an ISO string.
- Freeze temporal cursor values as finite epoch milliseconds.
- Require users ordering and predicate symmetry: `createdAt DESC, id DESC` with matching lexicographic keyset conditions.
- Require both users and audit repositories/services to fetch `limit+1`; helper-only tests are insufficient.
- Replace the frontend’s `useQuery` plan with `useInfiniteQuery`, `nextCursor` page parameters, flattened pages, and `q`-keyed reset.
- Add app-owned FR/EN Load-more copy; do not create `@kit/ui` `LoadMore` for one call site.
- Explicitly reject legacy audit `createdAt:id` cursors.
- Record accepted client seek, unbound `q`+cursor, and concurrent skip/duplicate behavior.
- Defer flows admin pagination unconditionally (no “if cheap” carve-out).
- Wire responses consistently include `requestId` (route/middleware); `ListPage<T>` remains `{ items, nextCursor }` only.
