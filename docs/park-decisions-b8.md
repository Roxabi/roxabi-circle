# B8 — Park decisions (live SSoT pointer)

**Status:** accepted · **Date:** 2026-08-04 · **Epic:** [GH #20](https://example.com/kit/issues/20)

Decision records: operator tracker.

## Live park surface (do not implement without unpark)

| ID | Topic | Posture | Unpark |
|---|---|---|---|
| **DR-B8-01** | Paraglide monorepo | **Park** — TS catalogs + `@kit/i18n` live | ≥2 products hit key-drift / path locales / hub mandate |
| **DR-B8-03** | Patchlog UI () | **L1 shipping** (GH #107 · recipe + `example-web`) · **L2 package still park** | L2: ≥2 products need same in-app CRUD + MD/static insufficient |
| **DR-B8-05** | Plausible SPA multi-site | **Deferred-closed** — opt-in hub, no phone-home default | Public SPA needs hub entry; env-gated snippet only |
| — | TanStack Start as default backend | **No** — Vite SPA + Hono Worker | Marketing/SSR-only exception, not kit spine |

## Already unparked (not park anymore)

| ID | Topic | Shipped via |
|---|---|---|
| **DR-B8-02** | RBAC Phase B | GH #22 · ADR-0003 |
| **DR-B8-04** | Email CF prod | GH #21 · ADR-0004 |

## Agent rule

Do **not** add Paraglide, **L2** patchlog package, default Plausible, or TanStack Start-as-API without meeting unpark criteria **and** a new ADR/goal. **L1** in-app changelog recipe (`docs/recipes/changelog-l1.md`, `example-web`) is allowed. Unpark L2 = intentional, not FOMO.
