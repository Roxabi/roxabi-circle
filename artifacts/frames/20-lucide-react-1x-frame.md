---
title: "chore(deps): wave 2 — lucide-react 1.x"
issue: 20
status: approved
tier: F-lite
date: 2026-08-06
---

## Problem

The kit pins `lucide-react` at **0.515.x** in `@kit/ui` and `example-web`. Upstream is on **1.x** (latest **1.29.0**). Dependabot already opened PR #5 (bump to 1.28.0) as a version-only change; major 0→1 can rename or remove icon exports, so a dedicated wave is needed: bump + fix any broken imports so typecheck and `example-web` build stay green.

Why now: wave DX (lefthook 2) landed (#25 / #19). Wave 2 was sequenced behind that; wave 3 (vitest/vite) is blocked by this.

## Who

- **Primary:** Kit maintainers landing dependency waves on Chemin A
- **Secondary:** Product repos that pull kit packages (`@kit/ui`) and share the same lucide major

## Constraints

- Scope limited to `lucide-react` (packages/ui + example-web); no other UI deps
- Prefer latest stable 1.x (currently 1.29.0; Dependabot #5 targets 1.28.0 — refresh as needed)
- Gates: typecheck `@kit/ui` + `example-web`, build example-web, zero missing icons
- May rebase/refresh Dependabot #5 or land an equivalent PR on `feat/20-lucide-react-1x` — dedicated PR required (DoD)
- Kit extractibility: no product strings; only shared UI package + example dogfood

## Out of Scope

- Other UI deps (recharts already wave 1)
- Wave 3 (vitest 4 + vite 8 + plugin-react) — #21
- shadcn re-codegen beyond what’s required to fix lucide renames
- Runtime visual redesign of icons

## Premise Validity

**Success in 6 months:** Kit and dogfood apps run on lucide-react 1.x with green typecheck/build; product consumers pull a single major without icon-break surprises.

**Failure in 6 months:** Still on 0.515 after 6 months, or 1.x landed without rename fixes so CI/typecheck stays red / icons 404 at build.

**Simplest alternative:** Merge Dependabot #5 as-is (version bump only).
**Why not simplest:** Major 0→1 can break named exports; DoD requires explicit typecheck + zero missing icons, which a pure Dependabot bump does not guarantee without a rename pass.

## Complexity

**Tier: F-lite** — clear scope, single domain (UI icons dep), known surfaces (~25 import sites), no new architecture.

Signals:
- User-selected F-lite at `/dev` entry
- Issue body: complexity 3, narrow DoD, one package major
- Files: package.json ×2 + import renames across packages/ui + example-web only
- Dependabot PR #5 already proves the version axis is mergeable (MERGEABLE, UNSTABLE checks)
