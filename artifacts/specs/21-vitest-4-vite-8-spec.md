---
title: "chore(deps): wave 3 — vitest 4 + vite 8 + plugin-react"
description: "Bump Vitest 3→4 + coverage-v8, Vite 6→8 + plugin-react major; green test/coverage/build:kit."
type: spec
status: approved
normative: false
issue: 21
tier: F-lite
---

## Context

**Promoted from:** [frame #21 vitest 4 + vite 8](../frames/21-vitest-4-vite-8-frame.md) (F-lite — analyze skipped)
**GitHub issue:** #21
**Related:** Dependabot PR #4 (`@vitejs/plugin-react` 4.7→6.0.4, open); wave 2 lucide #20 closed; blocks wave 4

## Intent

Keep the kit test/build toolchain on supported majors. We are stuck on **Vitest 3.2.x** + **`@vitest/coverage-v8` 3.2.7** and **Vite 6.3.x** + **`@vitejs/plugin-react` 4.x** while upstream ships Vitest **4**, Vite **8**, and plugin-react **6** (Vite 8 peers). Partial Dependabot bumps (plugin-react only) leave an incomplete peer graph; the wave must coordinate all three axes so gates stay green before wave 4.

## Goal

Every workspace that pins Vitest runs **Vitest 4.x** with matching **`@vitest/coverage-v8` 4.x**; `example-web` and `packages/ui` run **Vite 8.x** with a **plugin-react major compatible with Vite 8**; and after a clean install, `bun run test`, `bun run test:coverage` (existing floors), and `bun run build:kit` all exit 0.

## Users

- **Kit maintainers** landing dependency waves and running local/CI gates
- **Product consumers** that share or re-lock the kit’s vitest/vite majors via monorepo pull

## Expected Behavior

1. Inventory all workspace manifests that declare `vitest`, `@vitest/coverage-v8`, `vite`, or `@vitejs/plugin-react` (root + apps/* + packages/*).
2. Bump **all** `vitest` ranges to the **same** concrete Vitest **4.x** range (pin at implement, e.g. `^4.x.y` — not informal `^4`).
3. Bump root `@vitest/coverage-v8` from **3.2.7** to a **4.x** version aligned with Vitest 4 (same major family).
4. Bump `vite` to **^8.x** (concrete range at implement) in **both** `apps/example-web` and `packages/ui`.
5. Bump `@vitejs/plugin-react` to a major that **peers Vite 8** (Dependabot #4 targets **6.0.4**) in the same two packages — **identical** ranges across both.
6. Clean install (`bun install`) so lockfile resolves a single coherent graph (no dual Vitest 3/4 or Vite 6/8 for kit consumers).
7. Adjust vitest/vite configs **only if** required for green gates (API renames, pool options, coverage provider). Today configs use `environment: node | happy-dom` and shared `makeCoverage` — **no** `@cloudflare/vitest-pool-workers` in-tree; if a pool package appears later, treat as χ only if green fails.
8. **One ship unit:** all axes (Vitest 4 + coverage-v8 + Vite 8 + plugin-react) land in **one** dedicated PR merge — slices are commit/logic gates, not separately mergeable partial waves. Prefer **all package.json edits → one `bun install`** (atomic lock regenerate) over sequential install truth.
9. Gates after clean install (DoD): `bun run typecheck`, `bun run test:coverage` (floors via `scripts/test-coverage.sh` + per-package thresholds — **floor numbers frozen** unless a documented before/after exception in the PR), `bun run build:kit`. Prefer also `bun run validate:full` before push (local primary gate); subset S1 is for a faster local loop only, not ship DoD.
10. **Machine dual-major assert** after clean install (e.g. lockfile / `bun pm ls` / grep): no kit consumer resolves Vitest **3** or Vite **6** alongside the new majors.
11. Dedicated PR against base (`main`) closes #21. Title shape: `chore(deps): wave3 vitest4 + vite8…`. Dependabot **#4 closed/superseded before merge** of the dedicated PR (no parallel merge-on-green race; close early once wave PR supersedes).

## Data Model & Consumers

### Data Structure

No application data model. Dependency graph only:

| Package / root | Field | Today | Target |
|----------------|-------|-------|--------|
| root | `devDependencies.@vitest/coverage-v8` | `3.2.7` | 4.x aligned with vitest |
| apps: example-api, example-web, mcp-example | `devDependencies.vitest` | `^3.2.0` | same concrete `^4.N.M` |
| packages: api-client, auth, core, db, email, i18n, mcp, storage, types, ui | `devDependencies.vitest` | `^3.2.0` | same concrete `^4.N.M` |
| `@kit/example-web`, `@kit/ui` | `devDependencies.vite` | `^6.3.0` | same concrete `^8.N.M` |
| `@kit/example-web`, `@kit/ui` | `devDependencies.@vitejs/plugin-react` | `^4.5.0` | same concrete major for Vite 8 (e.g. `^6.0.4`) |
| lockfile | vitest / vite / plugin-react / coverage-v8 | 3.x / 6.x / 4.x / 3.2.7 | single major family each |

**Config surface (consumers of vitest/vite APIs):**

| Path | Role |
|------|------|
| `packages/config/vitest-coverage.mjs` | `makeCoverage` → provider `v8`, thresholds, reports under `coverage/<name>/` |
| `scripts/test-coverage.sh` | Orchestrates per-package `bunx vitest run --coverage` |
| `*/vitest.config.ts` (13 files) | `defineConfig` from `vitest/config`; env node or happy-dom |
| `apps/example-web/vite.config.ts`, `packages/ui/vite.config.ts` | Vite + `plugin-react` + `@tailwindcss/vite` |

### Consumers

| Consumer | Fields consumed | When | Status |
|----------|-----------------|------|--------|
| All kit packages with tests | vitest CLI + config API | `bun run test` / coverage | This issue |
| root validate:full | test + test:coverage + build:kit | local pre-push + CI | This issue |
| example-web / packages/ui | vite + plugin-react | dev + build:kit | This issue |
| Product forks | transitive majors via kit pull | after merge | Future (PR note if peers break) |

## Breadboard

### Vitest axis

| ID | Element | Handler | Data |
|----|---------|---------|------|
| T1 | All workspace `vitest` package.json ranges | edit + `bun install` | lockfile Vitest 4 |
| T2 | Root `@vitest/coverage-v8` | edit + `bun install` | lockfile coverage 4 |
| T3 | `packages/config/vitest-coverage.mjs` | edit only if API break | coverage options |
| T4 | `*/vitest.config.ts` (13) | edit only if defineConfig/env break | vitest 4 config |

### Vite axis

| ID | Element | Handler | Data |
|----|---------|---------|------|
| V1 | `example-web` + `ui` `vite` ranges | edit + `bun install` | lockfile Vite 8 |
| V2 | `example-web` + `ui` `@vitejs/plugin-react` | edit + `bun install` | plugin-react 6.x |
| V3 | `apps/example-web/vite.config.ts`, `packages/ui/vite.config.ts` | edit only if plugin API break | Vite 8 config |

### Ship axis

| ID | Element | Handler | Data |
|----|---------|---------|------|
| S0 | Dual-major assert | lockfile / `bun pm ls` / grep | no vitest@3 or vite@6 for kit |
| S1 | `bun run typecheck` | monorepo typecheck after clean install | process exit |
| S2 | `bun run test:coverage` | floors frozen + per-pkg thresholds | process exit |
| S3 | `bun run build:kit` | example-api + example-web build | process exit |
| S4 | Dependabot PR #4 | close/supersede before merge | GH |
| S5 | Dedicated PR for #21 | open against base; **one** ship unit | GH |
| S6 | Optional local loop | `bun run test` | process exit (not ship DoD alone) |

### Wiring

```
T1+T2+V1+V2 (one edit pass) → one bun install → T3/T4/V3 only if break
  → S0+S1+S2+S3 green → dedicated PR (S5) → S4 close #4 before merge
```

## Slices

| # | Name | Scope (IDs) | Demo criteria |
|---|------|-------------|---------------|
| 1 | Manifests + atomic lock | T1, T2, V1, V2 | All vitest pins same `^4.N.M`; coverage-v8 4.x; vite 8 + plugin-react identical on example-web + ui; **one** `bun install`; S0 dual-major assert passes |
| 2 | Config (if needed) + green gates | T3?, T4?, V3?, S1, S2, S3 | Config edits only if required; typecheck + test:coverage (floors frozen) + build:kit green after clean install |
| 3 | Ship unit | S4, S5 | Dedicated PR open for #21 with **all** axes; #4 closed/superseded **before** merge; not mergeable as vitest-only or vite-only |

Slices 1–2 may land in one commit if config edits are empty (bump-only greens). Slices are **not** separately mergeable PRs.

## Success Criteria

- [ ] Every workspace that had `vitest` pins the **same** concrete Vitest **4.x** range (e.g. `^4.N.M`) — no leftover `^3` in package.json
- [ ] Root `@vitest/coverage-v8` is **4.x** and aligned with the Vitest 4 line
- [ ] `example-web` and `packages/ui` pin the **same** concrete Vite **8.x** range
- [ ] `example-web` and `packages/ui` pin the **same** concrete `@vitejs/plugin-react` range (Vite 8 peer line, e.g. `^6.0.4` pinned at implement)
- [ ] After clean install: **machine dual-major assert** — no kit consumer resolves Vitest 3 or Vite 6 alongside the new majors (lockfile / `bun pm ls` evidence in PR or CI note)
- [ ] After clean install: `bun run typecheck` exits 0
- [ ] After clean install: `bun run test:coverage` exits 0 with **floor numbers unchanged** vs pre-bump configs (any floor change requires before/after evidence in PR body — default is freeze)
- [ ] After clean install: `bun run build:kit` exits 0
- [ ] Dedicated PR is **one ship unit** (all axes + lock), targets base, references #21, title matches wave3 vitest4 + vite8 shape
- [ ] Dependabot PR #4 closed or superseded **before** the dedicated PR merges (no parallel merge race)

## Open Questions

none

## Edge Cases

| Case | Handling |
|------|----------|
| Bump-only greens with zero config edits | Ship manifests + lockfile only; still run S1–S3 |
| Vitest 4 config/API rename | Minimal edit to `vitest.config.ts` / `vitest-coverage.mjs`; document in PR |
| Coverage floor regression after identical thresholds | Prefer fix tests/config over lowering floors; floors **frozen by default**; any change needs before/after evidence in PR body |
| Partial axis merge (vitest-only or vite-only PR) | Forbidden — one ship unit; close incomplete Dependabot PRs rather than merge them |
| plugin-react 6 removes Babel options we use | Kit configs only call `react()` with no babel option today — no action unless green fails |
| `@tailwindcss/vite` peer conflict with Vite 8 | Bump tailwind vite plugin only if required for install/build green; stay minimal |
| Dual versions in monorepo | Force **identical** ranges per axis across workspaces; assert single lock resolution |
| Dependabot #4 conflicts / stale | Implement on `feat/21-vitest-4-vite-8`; close #4 before dedicated merge; do not merge #4 alone |
| Stale node_modules after bump | Always clean install before gates; CI uses lockfile |
| Workers pool | Not present in current configs; if introduced mid-wave, only touch if tests fail |
| Product apps pin vitest/vite independently | Out of scope; PR body notes consumers should align majors when they pull kit |

## Non-goals

- TypeScript major, Zod, FastMCP, lucide, lefthook
- Switching away from Vitest or Vite
- Introducing `@cloudflare/vitest-pool-workers` (unless already required by green)
- Wave 4 and later Dependabot noise
- Product-only apps outside this kit tree
