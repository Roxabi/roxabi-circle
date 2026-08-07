---
title: "chore(deps): wave 5a — Zod 3 → 4"
issue: 23
status: approved
tier: F-lite
date: 2026-08-07
---

## Problem

The kit SSoT (AGENTS stack) targets **Zod 4**, but the monorepo still pins **Zod 3.25.x** (`^3.25.0` / `3.25.76`) in `@kit/core`, `@kit/flows`, `@kit/mcp`, `example-api`, `example-web`, and `mcp-example`. Transitive peers already pull **zod@4.4.3** via Better Auth / FastMCP / MCP SDK, so the lockfile is dual-version today.

Why now: deps waves #19–#22 are closed (lefthook → lucide → vitest/vite → fastmcp 4). Wave 5a is next and **blocks #24 (TypeScript 7)**. `@kit/flows` pure core landed on main with Zod 3 schemas (#28 / PR #37) — this PR must **port** those schemas to Zod 4, not leave a second major hanging.

Observable impact: single resolved Zod major, green typecheck/tests on auth/api/types/flows, no dual 3+4 graph for kit-owned packages.

## Who

- **Primary:** Kit maintainers landing dependency waves on Chemin A
- **Secondary:** Product repos that depend on `@kit/*` validation types and share Zod major via workspace/lockfile conventions

## Constraints

- Bump `zod` to **^4** (latest stable 4.x) everywhere the kit/apps currently pin 3.x; one resolved version in the lockfile for kit deps
- Fix Zod 4 API breakages only where required for compile/runtime (schemas, `z.infer` / error shapes, `z.record` arity, etc.)
- Peers: Better Auth, Hono Zod helpers if any, FastMCP 4 — verify peer range compatibility; document any forced dual if unavoidable (prefer eliminate)
- **Port `@kit/flows` schemas** (grant/plan/check path) written under Zod 3 — mandatory DoD; prefer freeze or land #29/#30 if they heavily touch schemas during this PR
- Gates: monorepo `typecheck` · focused tests (auth / api / types / flows validation) · no dual kit-owned Zod major
- **Isolated PR** — do **not** group with TypeScript 7 (#24)
- Kit extractibility: no product domain strings; packages + example dogfood only

## Out of Scope

- TypeScript 7 (wave 5b — #24, after this)
- Broader test-framework or runtime majors already covered by earlier waves
- New validation features / schema redesign beyond what Zod 4 migration requires
- Product apps outside the kit monorepo (consumers pull after land)
- Full rewrite of error UX or i18n of Zod messages (only keep green compile/tests)

## Premise Validity

**Success in 6 months:** One Zod 4 resolution across kit workspaces; typecheck + auth/api/types/flows tests green; products can pull upstream without carrying Zod 3 for `@kit/*`.

**Failure in 6 months:** Lockfile still dual-majors for kit deps, or typecheck red on common schema paths, or flows/MCP validation silently diverges between packages (some on 3, some on 4).

**Simplest alternative:** Dependabot-only version bump of `zod` without a dedicated wave.
**Why not simplest:** Zod 3→4 is a major with API breaks; monorepo has ~19 direct import sites plus `@kit/flows` schemas that must be ported deliberately; peer graph (BA / FastMCP) already mixes 4.x transitively — needs a controlled, isolated PR and focused validation gates, not a bot-only bump.

## Complexity

**Tier: F-lite** — clear monorepo dependency wave, single domain (validation/deps), known sequence after #22; multi-package touch but no new architecture.

Signals observed:
- Clear scope from issue body (bump + breakages + peers + flows port)
- Prior waves #20–#22 framed as F-lite
- Multiple packages/files but one concern axis
- High risk noted → isolated PR, not F-full multi-domain redesign
- User-selected F-lite at `/dev` entry
