---
title: "chore(deps): wave 5a — Zod 3 → 4"
description: "Bump monorepo zod 3→4; fix API breaks; port @kit/flows schemas; single resolved major; green typecheck + focused tests."
type: spec
status: approved
issue: 23
tier: F-lite
---

## Context

**Promoted from:** [frame #23 Zod 4](../frames/23-zod-4-frame.md) (F-lite — analyze skipped)
**GitHub issue:** #23
**Related:** Waves #19–#22 closed; `@kit/flows` pure core on main (#28 / PR #37) still Zod 3; blocks #24 (TypeScript 7); mirror go-silex/silex-boilerplate#103; cross-track freeze/rebase #29/#30 if they touch schemas during this PR

## Intent

Align the monorepo with the AGENTS SSoT target **Zod 4**. Kit packages and examples still pin **Zod 3.25.x** (`^3.25.0` / exact `3.25.76` on example-web) while Better Auth, FastMCP 4, and the MCP SDK already pull **zod@4.4.3** transitively — dual major in the lockfile today. Wave 5a owns a deliberate monorepo bump + API fixes (including **port of `@kit/flows` schemas**), so typecheck and validation-focused tests go green on a **single Zod major in the install graph** before TypeScript 7 (#24).

## Goal

All workspaces that declare `zod` pin **`^4.4.3`** (or newer 4.x patch at implement); after clean install the lockfile has **no `zod@3.` resolution** (allowlist only if unavoidable — see D2); monorepo typecheck + focused package tests exit 0; dedicated PR closes #23 without TypeScript 7.

## Users

- **Kit maintainers** landing deps waves and running local/CI gates (`typecheck`, package tests, `validate:full`)
- **Product repos** that consume `@kit/*` and share Zod majors via workspace/lockfile conventions

## Out of Scope

- TypeScript 7 / `typescript` major / tsconfig target bumps (#24)
- Unrelated dependency majors already covered by waves #19–#22
- Product-domain schema redesign or new validation features beyond migration
- Product apps outside this monorepo (consumers pull after land)

## Expected Behavior

1. **Inventory** every workspace that pins `zod` today (six known):
   - `packages/core`, `packages/flows`, `packages/mcp`
   - `apps/example-api`, `apps/example-web`, `apps/mcp-example`
   - `@kit/types` and `@kit/auth` have **no** direct `zod` pin today — leave unless implement discovers a need.
2. **Bump** every declared `zod` range to **`^4.4.3`** (or newer 4.x patch if npm latest at implement). Normalize example-web’s exact pin (`3.25.76`) to the same caret. Clean install: `rm -rf node_modules && bun install` (commit updated `bun.lock`).
3. **Single-major assert (D2) — machine, not prose:**
   - After clean install, **prefer zero** `zod@3.` in the lockfile (e.g. `grep -E 'zod@3\\.' bun.lock` empty, or `bun pm ls zod` shows only 4.x).
   - If a residual transitive 3.x is **unavoidable**, PR body must list **allowlist table** `{package, why, issue follow-up}` and CI/manual check must fail if a **new** non-allowlisted `zod@3.` appears. Prefer eliminate over allowlist.
   - Starting state: direct `zod@3.25.76` + nested peer keys already on `zod@4.4.3` (BA / FastMCP / MCP SDK) — target collapses kit direct onto 4.x and drops kit-driven 3.x.
4. **Fix Zod 4 API breaks only as required for compile/runtime**, especially:
   - `z.record` arity / key schema (`packages/flows/src/schema.ts` one- and two-arg)
   - `z.ZodTypeAny` / type exports in `@kit/mcp` catalogue
   - `error.flatten()` used by `@kit/core` `parseOrThrow` — keep `ParseableSchema` duck-type or adapt once
   - `.strict()` / `superRefine` / `safeParse` / `z.infer` across flows, mcp, example-api, example-web
   - BA / FastMCP boundaries only if typecheck fails after bump
5. **Port `@kit/flows` schemas** (grant, plan document, permits, check) — **mandatory DoD**. Add **minimal migration fixtures** (not a full suite rewrite):
   - at least one plan path exercising `z.record` task keys
   - at least one `parseOrThrow` / flatten → `AppError.validation` fieldErrors shape assert under Zod 4
6. **Do not** include TypeScript 7 prep, product redesigns, or new validation features. PR review flags non-migration schema restructures and any `typescript` version/tsconfig target change.
7. **Cross-track (process DoD):** during #23 open window, **do not merge** #29/#30 schema-touching PRs without rebase + re-run D2 + `@kit/flows` tests. Close/supersede any Dependabot `zod` PRs — **not** ship units. Post-rebase: re-assert D2 + focused tests before merge.
8. **Gates after clean install** (all required):
   - `bun run typecheck`
   - `bun run --filter @kit/core test`
   - `bun run --filter @kit/flows test`
   - `bun run --filter @kit/mcp test`
   - `bun run --filter @kit/example-api test`
   - `bun run --filter @kit/auth test`
   - `bun run --filter @kit/example-web typecheck`
   - `bun run smoke:mcp` (always — mcp-example pins zod)
   - Before push: `bun run validate:full`
9. Dedicated PR against `main` closes #23. Title: `chore(deps): wave5a zod4…`. **Isolated** from #24.

## Data Model & Consumers

### Data Structure

No application domain model change. Dependency + schema surface only:

| Package / path | Field / API | Today | Target |
|----------------|-------------|-------|--------|
| `@kit/core` | `dependencies.zod` | `^3.25.0` | `^4.4.3` |
| `@kit/flows` | `dependencies.zod` | `^3.25.0` | `^4.4.3` |
| `@kit/mcp` | `dependencies.zod` | `^3.25.0` | `^4.4.3` |
| `@kit/example-api` | `dependencies.zod` | `^3.25.0` | `^4.4.3` |
| `@kit/example-web` | `dependencies.zod` | `3.25.76` exact | `^4.4.3` |
| `@kit/mcp-example` | `dependencies.zod` | `^3.25.0` | `^4.4.3` |
| lockfile | `zod@…` | **3.25.76** + **4.4.3** (nested peers) | **no `zod@3.`** (or documented allowlist) |
| `packages/core/src/parse.ts` | `ParseableSchema` + `flatten()` | Zod-3-shaped duck type | works on Zod 4 or adapted once |
| `packages/flows/src/schema.ts` | plan/grant, `z.record`, `.strict()` | Zod 3 | Zod 4 portable |
| `packages/mcp/src/catalogue.ts` | `input: z.ZodTypeAny` | Zod 3 types | Zod 4 type name if renamed |
| example-api / example-web schemas | `safeParse` / `.strict()` | Zod 3 | Zod 4 |

### Consumers

| Consumer | Consumes | When | Status |
|----------|----------|------|--------|
| example-api routes | Zod body schemas + `parseOrThrow` | request validation | This issue |
| `@kit/flows` check/grant | plan document schemas | plan parse + check | This issue (mandatory) |
| `@kit/mcp` catalogue | ZodTypeAny tool input/output | tool registration | This issue |
| example-web lib schemas | client-side Zod | forms / validation | This issue |
| Better Auth / FastMCP | peer zod 4 | already transitive | This issue (align) |
| Product apps | `@kit/*` + zod major | after merge | Future |

## Breadboard

### Dep axis

| ID | Element | Handler | Data |
|----|---------|---------|------|
| D1 | Six workspace `package.json` `zod` pins | edit + clean `bun install` | lock Zod 4 |
| D2 | Single-major machine assert | lockfile grep / `bun pm ls zod` | zero `zod@3.` or allowlist table |

### Schema / adapter axis

| ID | Element | Handler | Data |
|----|---------|---------|------|
| A1 | `@kit/core` `parseOrThrow` / `ParseableSchema` | edit if flatten breaks + fieldErrors fixture | AppError.validation shape stable |
| A2 | `@kit/flows` schema + grant + check | port + `z.record` fixture | flows tests green |
| A3 | `@kit/mcp` catalogue + schemas | edit if ZodTypeAny breaks | mcp tests green |
| A4 | example-api env + route schemas | edit only if break | api tests green |
| A5 | example-web schemas / routes | edit only if break | web typecheck green |
| A6 | mcp-example zod pin | bump | smoke:mcp green |

### Ship axis

| ID | Element | Handler | Data |
|----|---------|---------|------|
| S1 | `bun run typecheck` | monorepo | exit 0 |
| S2 | focused package tests + auth | vitest filters | exit 0 |
| S3 | `smoke:mcp` + `validate:full` | root scripts | exit 0 |
| S4 | Dedicated PR for #23 | open against main | no #24 / no TS major |
| S5 | Cross-track freeze + Dependabot | process | #29/#30 not merged dirty; bot zod PRs closed |

### Wiring

```
D1 → clean bun install → D2 assert
  → A1–A6 where typecheck/test break (A2 mandatory + fixtures)
  → S1+S2+smoke → S3 validate:full → S4 PR (+ S5 process)
```

## Slices

**Ship rule:** slices are **commit/logic gates**, not separately mergeable PRs. Mergeable only when S1+S2+S3 green and S4/S5 process complete. Manifest-only bump is **not** a ship unit.

| # | Name | Scope (IDs) | Demo criteria |
|---|------|-------------|---------------|
| 1 | Manifest + lock | D1, D2 | all declared `zod` = `^4.4.3` (+patch); D2 machine assert — **not mergeable alone** |
| 2 | Schema port + green gates | A1–A6, S1, S2 | typecheck + focused tests + smoke:mcp green — **required for ship** |
| 3 | Ship process | S3, S4, S5 | `validate:full` green; dedicated #23 PR only; cross-track + Dependabot handled |

## Success Criteria

- [ ] All six workspaces that declare `zod` pin **`^4.4.3`** (or newer 4.x patch); no 3.x left in those package.json files
- [ ] D2: after clean install, lockfile has **no `zod@3.`** OR PR lists allowlist `{package, why}` and no non-allowlisted 3.x remains
- [ ] `@kit/flows` schemas ported; minimal `z.record` fixture covered; `bun run --filter @kit/flows test` exits 0
- [ ] `parseOrThrow` still maps failures to `AppError.validation` with fieldErrors; fixture under Zod 4; `bun run --filter @kit/core test` exits 0
- [ ] `bun run --filter @kit/mcp test` exits 0
- [ ] `bun run --filter @kit/example-api test` exits 0
- [ ] `bun run --filter @kit/auth test` exits 0
- [ ] `bun run --filter @kit/example-web typecheck` exits 0
- [ ] `bun run smoke:mcp` exits 0
- [ ] `bun run typecheck` exits 0
- [ ] `bun run validate:full` exits 0 before push
- [ ] Dedicated PR for #23; title wave5a/zod4; **no** TypeScript major / tsconfig target bump / #24 scope
- [ ] Dependabot zod PRs not merged as ship unit; closed/superseded when dedicated PR lands
- [ ] No product-domain schema redesign beyond migration

## Edge Cases

| Case | Handling |
|------|----------|
| Zod 4 renames `ZodTypeAny` | Update `@kit/mcp` catalogue; keep duck-type spirit |
| `z.record` one- vs two-arg semantics | Adjust flows `schema.ts`; keep plan validation behavior; fixture proves keys |
| `error.flatten()` shape changes | Adapt `parseOrThrow` once; fixture asserts AppError fieldErrors |
| Residual transitive zod 3 | Prefer eliminate; else allowlist table in PR; D2 fails on new non-allowlisted 3.x |
| #29/#30 concurrent schema edits | Freeze merge until #23 lands or rebase + re-assert D2 + flows tests |
| Dependabot zod PR mid-wave | Do not merge as ship unit; close/supersede |
| example-web exact pin | Normalize to `^4.4.3` with siblings |
| Temptation to include TS 7 | Hard OOS — separate #24; review rejects typescript major in this PR |

## χ

none after expert pass (D2 hardened to machine assert; API renames deferred to installed Zod 4 types)
