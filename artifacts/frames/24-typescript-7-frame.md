---
title: "chore(deps): wave 5b — TypeScript → 7"
issue: 24
status: approved
tier: F-lite
date: 2026-08-07
---

## Problem

The kit SSoT (AGENTS stack) targets **TypeScript 5.9+ strict**, and the monorepo still pins **`typescript` ^5.9.0** (resolved **5.9.3**) at root and in every workspace package/app. Upstream / Dependabot already open **PR #12** (`dependabot/npm_and_yarn/typescript-7.0.2`) for **5.9.3 → 7.0.2**. A major compiler jump can change strict diagnostics, lib types, and tool peers — so this wave owns the bump + compile fixes rather than a blind Dependabot merge.

Why now: deps waves #19–#23 are closed (lefthook → lucide → vitest/vite → fastmcp 4 → Zod 4). Wave 5b is the **last open deps-wave issue** on the sequence. Prefer not concurrent with heavy flows type churn (#30/#31).

Observable impact: single resolved TypeScript major monorepo-wide, green `typecheck` · `build:kit` · `validate:full`, AGENTS/stack docs aligned to TS 7, Dependabot #12 supersedable after land.

## Who

- **Primary:** Kit maintainers landing dependency waves on Chemin A
- **Secondary:** Product repos that pull the kit and share the monorepo TypeScript major / `tsc` behavior via workspace conventions

## Constraints

- Bump `typescript` to **^7** (target latest stable 7.x, align with Dependabot #12 ~7.0.2 unless a newer patch is needed) at **root + all workspace** `package.json` pins that currently list `^5.9.0`
- Fix strict / lib / tool type breakages only where required for compile and green gates
- Escape hatch documented in issue: if 5.9→7 is non-viable in one hop, intermediate **5.9→6 then 6→7** (prefer single hop if green)
- Gates: monorepo `typecheck` · `build:kit` · `validate:full` green
- **Isolated PR** — do **not** group with other majors; max blast radius
- Prefer avoid concurrent merge conflict with heavy #30/#31 type churn
- Kit extractibility: no product domain strings; packages + example dogfood only
- May supersede/close Dependabot **PR #12** after land

## Out of Scope

- Other runtime majors (Bun, Vitest, Vite, FastMCP, Zod — already waved or separate)
- New TS language features adoption beyond what the upgrade forces
- Product apps outside this monorepo (consumers pull after land)
- Concurrent redesign of flows runner / agent packages (#30/#31+) beyond type fixes forced by `tsc` 7
- Changing `tsconfig` target/module baseline unless required for TS 7 compile

## Premise Validity

**Success in 6 months:** Kit monorepo compiles and gates green on TypeScript 7.x; lockfile has one TS major; AGENTS/stack docs match; Dependabot TS-major noise is closed.

**Failure in 6 months:** Still on TypeScript 5.9 after 6 months, or a partial/broken 7.x land leaves `typecheck` / `build:kit` / `validate:full` red so consumers cannot trust the kit spine.

**Simplest alternative:** Merge Dependabot PR #12 as-is (version-only bump).
**Why not simplest:** Max blast radius across root + all workspaces; majors can introduce new strict diagnostics and lib breaks that need owned fixes and full gate proof, not a blind lockfile merge. Escape hatch (6 then 7) may be required.

## Complexity

**Tier: F-lite** — single domain (compiler / types tooling), clear DoD from issue, multi-package pin surface but no new architecture.

Signals observed:

- Clear scope: `typescript` → ^7, fix strict/lib, gates green
- 15 package.json pins currently `^5.9.0` + AGENTS “TypeScript 5.9+”
- Prior deps waves (#20–#23) same tier
- User/session τ = F-lite; not S (far more than 3 files); not F-full (no multi-domain redesign)
