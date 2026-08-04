# B8 — Park decisions (live SSoT pointer)

**Status:** accepted · **Date:** 2026-08-04 · **Epic:** [GH #20](https://github.com/go-silex/silex-boilerplate/issues/20) · Spark **#121**

Full decision records: [`artifacts/specs/20-epic-b8-decisions-park-spec.md`](../artifacts/specs/20-epic-b8-decisions-park-spec.md)

## Live park surface (do not implement without unpark)

| ID | Topic | Posture | Unpark |
|---|---|---|---|
| **DR-B8-01** | Paraglide monorepo | **Park** — TS catalogs + `@gosilex/i18n` live | ≥2 products hit key-drift / path locales / hub mandate |
| **DR-B8-03** | Patchlog UI (Spark #100) | **Park · later** — recipe only, not kit package | ≥2 products need in-app changelog + MD insufficient |
| **DR-B8-05** | Plausible SPA multi-site | **Deferred-closed** — opt-in hub, no phone-home default | Public SPA needs hub entry; env-gated snippet only |
| — | TanStack Start as default backend | **No** — Vite SPA + Hono Worker | Marketing/SSR-only exception, not kit spine |

## Already unparked (not park anymore)

| ID | Topic | Shipped via |
|---|---|---|
| **DR-B8-02** | RBAC Phase B | GH #22 · ADR-0003 |
| **DR-B8-04** | Email CF prod | GH #21 · ADR-0004 |

## Agent rule

Do **not** add Paraglide, patchlog package, default Plausible, or TanStack Start-as-API without meeting unpark criteria **and** a new ADR/goal. Unpark = intentional, not FOMO.
