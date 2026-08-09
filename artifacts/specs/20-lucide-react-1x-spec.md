---
title: "chore(deps): wave 2 — lucide-react 1.x"
description: "Bump lucide-react 0.515 → 1.x in packages/ui + example-web; fix icon renames; green typecheck/build."
type: spec
status: approved
normative: false
issue: 20
tier: F-lite
---

## Context

**Promoted from:** [frame #20 lucide-react 1.x](../frames/20-lucide-react-1x-frame.md) (F-lite — analyze skipped)
**GitHub issue:** #20
**Related:** Dependabot PR #5 (`dependabot/npm_and_yarn/lucide-react-1.27.0` → 1.28.0, MERGEABLE); npm latest **1.29.0**; blocks #21 (wave 3)

## Intent

Keep the kit on a supported lucide-react major. We are stuck on **0.515.x** while upstream ships **1.x**. Dependabot already proposes a version bump, but 0→1 can rename or drop icon exports — so a wave that **bumps + renames** is required before wave 3 (vitest/vite).

## Goal

`@kit/ui` and `example-web` depend on lucide-react **1.x** (latest stable), all existing icon imports resolve, and typecheck + example-web build pass with zero missing icons.

## Users

- **Kit maintainers** landing dependency waves
- **Product consumers** of `@kit/ui` that re-export or share the same lucide major

## Expected Behavior

1. Maintainer records a **pre-bump inventory** of all named imports from `'lucide-react'` under `packages/ui` + `apps/example-web` (file → export list).
2. Bumps `lucide-react` in **both** `packages/ui/package.json` and `apps/example-web/package.json` to the **same** concrete range pinned at implement time (e.g. `^1.29.0` — not informal `^1.x`).
3. Clean install from lockfile (`bun install`) so typecheck/build run against the resolved 1.x, not stale `node_modules`.
4. Broken named exports are fixed via **1:1 renames** or an explicit substitution table in the PR (no unbounded “nearest glyph”).
5. Post-bump: re-inventory; every pre-bump import is either still valid or mapped in the PR table.
6. Gates after clean install: UI typecheck, example-web typecheck, example-web production build.
7. Single lock resolution: one lucide-react 1.x version for the monorepo (no dual major / leftover 0.515).
8. Dedicated PR against base (`main`) closes #20. Dependabot **#5 is closed/superseded before merge** of the dedicated PR (block parallel merge-on-green race).

## Data Model & Consumers

### Data Structure

No application data model. Dependency graph only:

| Package | Field | Today | Target |
|---------|-------|-------|--------|
| `@kit/ui` | `dependencies.lucide-react` | `^0.515.0` | same concrete `^1.N.M` as example-web (pin at implement) |
| `@kit/example-web` | `dependencies.lucide-react` | `^0.515.0` | identical range to `@kit/ui` |
| lockfile | `lucide-react@…` | 0.515.x | single 1.x resolution (no dual major) |

**Icon surface (consumers):** named exports imported from `'lucide-react'` — mix of `*Icon` suffix (shadcn kit shell) and unprefixed names (example-web routes). Both must remain valid after the bump (or be renamed per lucide 1.x changelog/API).

### Consumers

| Consumer | Fields consumed | When | Status |
|----------|-----------------|------|--------|
| `packages/ui` components (sidebar, dialog, select, …) | `*Icon` exports | compile + runtime UI | This issue |
| `apps/example-web` routes/shell | unprefixed + shared icons | compile + runtime UI | This issue |
| Product apps using `@kit/ui` | transitive lucide major | after pull kit | Future (document in PR if peer guidance needed) |

## Breadboard

### Dependency axis

| ID | Element | Handler | Data |
|----|---------|---------|------|
| D1 | `packages/ui/package.json` lucide range | edit + `bun install` | lockfile |
| D2 | `apps/example-web/package.json` lucide range | edit + `bun install` | lockfile |
| D3 | Dependabot PR #5 | close/supersede after land | GH |

### Icon import axis

| ID | Element | Handler | Data |
|----|---------|---------|------|
| I1 | `packages/ui/src/**` lucide imports (~14 files) | rename exports if broken | lucide-react 1.x module |
| I2 | `apps/example-web/src/**` lucide imports (~11 files) | rename exports if broken | lucide-react 1.x module |

### Verify axis

| ID | Element | Handler | Data |
|----|---------|---------|------|
| V1 | `@kit/ui` typecheck | `tsc --noEmit` | TS program |
| V2 | `example-web` typecheck | `tsc --noEmit` | TS program |
| V3 | `example-web` build | Vite build | bundle |

### Wiring

```
D1+D2 → lockfile 1.x → I1+I2 rename pass → V1+V2+V3 green → dedicated PR → D3 close #5
```

## Slices

| # | Name | Scope (IDs) | Demo criteria |
|---|------|-------------|---------------|
| 1 | Inventory + bump + lock | D1, D2 | Pre-bump import inventory captured; both package.json share same `^1.N.M`; lockfile single 1.x; clean install |
| 2 | Rename pass + green | I1, I2, V1, V2, V3 | Post-inventory ⊆ pre ∪ rename table; typecheck UI + example-web green after clean install; example-web build green |
| 3 | Ship PR | D3 | Dedicated PR open for #20; #5 closed/superseded **before** merge |

Slices 1–2 may land in one commit if the rename set is empty (bump alone typechecks).

## Success Criteria

- [ ] Both manifests pin the **same** concrete range (e.g. `^1.29.0`) — not informal `^1.x`
- [ ] Lockfile has a **single** lucide-react 1.x resolution (no 0.515 remaining for kit consumers)
- [ ] Pre-bump named-import inventory exists (file → exports) for `packages/ui` + `apps/example-web`
- [ ] Post-bump: every inventory entry still typechecks, or appears in an explicit 1:1 / substitution table in the PR
- [ ] After clean install: `bun run --filter @kit/ui typecheck` exits 0
- [ ] After clean install: `bun run --filter @kit/example-web typecheck` exits 0 (or package script equivalent)
- [ ] After clean install: `example-web` production build exits 0 with no unresolved `lucide-react` exports
- [ ] Dedicated PR targets base branch and references #20
- [ ] Dependabot PR #5 closed or superseded **before** the dedicated PR merges (no parallel merge race)

## Open Questions

none

## Edge Cases

| Case | Handling |
|------|----------|
| No renames needed after bump | Ship bump-only; still run full V1–V3 |
| Icon removed in 1.x with no 1:1 rename | Explicit substitution table in PR (old → new export); reject unbounded glyph swaps |
| Dual versions in monorepo | Force **identical** range in both package.json; assert single lock resolution |
| Dependabot #5 conflicts / stale | Implement on `feat/20-lucide-react-1x`; close #5 before dedicated merge; do not merge #5 |
| Stale node_modules after bump | Always clean install before V1–V3; CI uses lockfile |
| Product apps pin lucide independently | Out of scope; PR body notes consumers should align major when they pull kit |

## Non-goals

- Other UI deps (recharts, etc.)
- Wave 3 (#21)
- Visual redesign / icon set expansion
- Changing shadcn Base UI engine
