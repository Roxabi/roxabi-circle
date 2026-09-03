---
title: "feat(lists): kit cursor page envelope + example dogfood"
issue: 104
status: approved
tier: F-lite
date: 2026-08-21
---

## Problem

Kit list endpoints already disagree inside `example-api`: `GET /api/admin/users` pages with `limit`+`offset` and returns `{ users }`; `GET /api/admin/audit-events` pages with `limit`+`cursor` and returns `{ items, nextCursor }`; `GET /api/notes` dumps the full set. Products (LGU catalogues) are about to copy dump-or-offset patterns. Without a single opaque-cursor envelope in `@kit/types` / `@kit/core`, every fork invents a third flavour.

Why now: LGU already has client windows over dump routes (Base palier 120, import candidates `slice(0, 25)`). Promote the contract in the kit HEAD before consumers freeze on offset. P0 kit quality (AppError / Zod class) — not platform JTBD, not product domain.

## Who

- **Primary:** kit maintainer shipping extractible list helpers + example-* dogfood.
- **Secondary:** product engineers (LGU and later forks) who pull `upstream` and apply the envelope on catalogue routes only.

## Constraints

- Default pagination = opaque keyset cursor. Offset is not the kit default. No new `@kit/pagination` package.
- Envelope: `{ items, nextCursor, requestId }` — `nextCursor === null` ⇒ last page. Resource-named keys (`users`) forbidden on new kit lists. No default `total` / `COUNT(*)`.
- Cursor opaque (base64url JSON keyset internal); bad cursor → `VALIDATION_ERROR`, no keyset leak. `q` is a conventional query param name; `WHERE` stays in the app.
- Helpers in `@kit/core` (`clampListLimit`, encode/decode, `takeListPage`); schemas in `@kit/types`. Repo owns `ORDER BY` + keyset `WHERE` — helpers do not build SQL.
- Dogfood in `example-*` only. Launch from kit clone — never implement in a product consumer.
- `LoadMore` in `@kit/ui` only if two example-web call sites; otherwise button stays in the app.
- 0 product business strings in `packages/*`. Banlist / extract unchanged.

## Out of Scope

- LGU `/api/base`, `/api/tournages`, BaseExplorer palier — product after `git fetch upstream`.
- Numbered offset pages with `total`; infinite-scroll observer in `@kit/ui`; TanStack Virtual package.
- Changing tiny lookups (`GET /api/orgs`, roles) unless they already page.
- Flows admin pagination (#31 leftover) unless already in tree and cheap.
- Analytical bundles (`/api/insights`-class) — not lists; server aggregates.

## Premise Validity

**Success in 6 months:** new kit list routes and example admin users/audit use `{ items, nextCursor }` with opaque cursors; products pull the helpers instead of inventing offset/dump variants for catalogues.

**Failure in 6 months:** `example-api` still ships offset + named `{ users }` beside cursor audit, and a product catalogue freezes on dump or a third pagination flavour.

**Simplest alternative:** docs-only note in `docs/ui-kit.md` (“prefer cursor”) without shared helpers.
**Why not simplest:** two divergent helpers already live in the same example app; docs alone do not stop copy-paste of offset or dump. Shared clamp/encode/`takeListPage` + dogfood is the bar.

## Complexity

**Tier: F-lite** — single domain (list page contract), clear decision table in #104, known call sites. `/dev` chose F-lite.

Signals: types + core + ADR + two API routes + one web page + docs; no multi-domain unknowns; package rule satisfied by ≥2 example-api call sites (ADR-0001).
