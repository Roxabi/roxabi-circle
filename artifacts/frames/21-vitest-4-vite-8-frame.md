---
title: "chore(deps): wave 3 — vitest 4 + vite 8 + plugin-react"
issue: 21
status: approved
normative: false
tier: F-lite
date: 2026-08-06
---

## Problem

The kit is still on **Vitest 3.2.x** across apps/packages (root `@vitest/coverage-v8` pinned at **3.2.7**) and **Vite 6.3.x** + `@vitejs/plugin-react` **4.x** in `example-web` and `packages/ui`. Upstream majors are available: Vitest **4**, Vite **8**, and plugin-react **6** (peer on Vite 8; Dependabot PR #4 already proposes plugin-react 4.7→6.0.4).

Why now: wave 2 (lucide-react 1.x, #20) is closed and merged. Wave 3 was sequenced behind it. Coordinated majors avoid half-upgraded peer graphs and keep monorepo test/build gates green before wave 4.

## Who

- **Primary:** Kit maintainers landing dependency waves on Chemin A
- **Secondary:** Product repos that pull the kit (share vitest/vite majors via workspace or lockfile conventions) and CI that runs `test` / `test:coverage` / `build:kit`

## Constraints

- Vitest ^4 on every workspace that currently pins vitest 3.x; `@vitest/coverage-v8` → 4.x (root + any consumers)
- Vite ^8 + `@vitejs/plugin-react` major compatible with Vite 8 in `example-web` + `packages/ui`
- Config / pool Workers (`@cloudflare/vitest-pool-workers` if used) may need Vitest 4 adjustments
- Gates: `bun run test`, `bun run test:coverage` (floors), `bun run build:kit` (example-api + example-web)
- Prefer dedicated PR `chore(deps): wave3 vitest4 + vite8…`; may supersede/rebase Dependabot #4 (plugin-react only)
- Kit extractibility: no product strings; tooling + example dogfood only

## Out of Scope

- TypeScript major, Zod, FastMCP, lucide (wave 2 done), lefthook
- Product apps outside this kit tree
- Unrelated Dependabot noise not listed in wave 3
- Switching test runners or bundlers away from Vitest/Vite

## Premise Validity

**Success in 6 months:** Monorepo runs Vitest 4 + Vite 8 (+ matching plugin-react) with green test, coverage floors, and build:kit; product consumers can pull without peer thrash on the test/build stack.

**Failure in 6 months:** Still on Vitest 3 / Vite 6 after 6 months, or majors landed with red coverage floors / broken Workers pool / failed example-web build.

**Simplest alternative:** Merge Dependabot #4 alone (plugin-react 6) without Vitest 4 or Vite 8.
**Why not simplest:** plugin-react 6 targets Vite 8; bumping the plugin without Vite 8 leaves an incomplete peer graph. Vitest 4 is a separate major that must stay aligned with coverage-v8 and any Workers pool — partial bumps fail the wave DoD.

## Complexity

**Tier: F-lite** — clear scope, single domain (tooling/deps), multi-package.json but mechanical with known gates; no new architecture.

Signals:
- User-selected F-lite at `/dev` entry
- Issue body: complexity 5, explicit DoD and sequence after wave 2
- Surfaces: package.json × N + vitest/vite configs + possible pool Workers tweak
- Dependabot PR #4 covers one axis (plugin-react); wave owns full coordination
