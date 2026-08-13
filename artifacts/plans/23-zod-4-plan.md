---
title: "Plan: chore(deps) wave 5a — Zod 3 → 4"
issue: 23
spec: artifacts/specs/23-zod-4-spec.md
complexity: 6/10
tier: F-lite
generated: "2026-08-07T10:00:00Z"
status: approved
normative: false
---

## Summary

Single ship unit: bump monorepo **Zod 3.25 → ^4.4.3** on all six workspaces that pin it, clean install, **machine D2** (no `zod@3.` in lock or allowlist), port **`@kit/flows` schemas** (+ minimal `z.record` / `parseOrThrow` fixtures), fix other Zod 4 breaks only if needed, then green typecheck + focused tests + `smoke:mcp` + `validate:full`. Dedicated PR for #23; **no TypeScript 7**; freeze/rebase #29/#30 if schema conflict; do not merge Dependabot zod bots as ship unit.

**Implement-time pin (re-verify at start):** `zod` **`^4.4.3`** (or newer 4.x patch if npm latest).

## Architecture

### Data Flow

**Diagram:** [wave 5a Zod 4 data flow](../visuals/23-zod-4-data-flow.html)

Inventory → pin ^4.4.3 + lock → D2 assert → core/flows port (+ fixtures) → optional consumer fixes → gates → ship PR.

### File x Function Map

**Diagram:** [files × roles](../visuals/23-zod-4-file-map.html)

Manifest + lock (devops) · core parse + flows schemas (backend-A) · mcp + api (backend-B) · web schemas (frontend) · gates (tester) · PR process (devops).

## Bootstrap Context

- Frame: `artifacts/frames/23-zod-4-frame.md` (approved, F-lite)
- Spec: `artifacts/specs/23-zod-4-spec.md` (approved)
- Branch/ω: `feat/23-zod-4` @ `~/.grok/worktrees/Roxabi-roxabi-boilerplate-cf/23-zod-4`
- Prior wave pattern: #22 FastMCP plan (deps wave sequential)
- Known pins: core, flows, mcp, example-api, example-web (exact 3.25.76), mcp-example → all `^3.25` class
- Lock today: `zod@3.25.76` + nested peers `zod@4.4.3` (BA / FastMCP / MCP SDK)

## Agents

| Agent | Task count | Files |
|-------|-----------|-------|
| devops-A | 4 | 6× package.json, bun.lock, inventory note, PR material |
| backend-dev-A | 2 | core parse + flows schema/grant/check (+ fixtures/tests) |
| backend-dev-B | 1 | mcp catalogue/schemas + example-api schemas if break |
| frontend-dev-A | 1 | example-web schemas if break |
| tester-A | 1 | gate commands only |

## Wave Structure

4 waves, max 2 parallel agents (Wave 3). Elapsed ~0.5–1 day vs sequential same.

| Wave | Trigger | Agents | Tasks |
|------|---------|--------|-------|
| 1 | start | 1 | devops-A: T1→T2→T3 |
| 2 | Wave 1 done | 1 | backend-dev-A: T4→T5 |
| 3 | Wave 2 done | 2 ∥ | backend-dev-B: T6 · frontend-dev-A: T7 |
| 4 | Wave 3 done | 1 then 1 | tester-A: T8 → devops-A: T9 |

### Budget — per task

| Task | Items | Class | Est. ops | Split? |
|------|-------|-------|----------|--------|
| T1 inventory | 6 pins + lock | bounded | 3 | — |
| T2 pin + clean install | 6 package.json + lock | bounded | 5 | — |
| T3 D2 assert | lock grep / pm ls | bounded | 3 | — |
| T4 core parse + fixture | parse.ts + test | judgmental | 6 | — |
| T5 flows port + fixture | schema/grant/check + tests | judgmental | 10 | — |
| T6 mcp + api if break | catalogue, schemas, routes | judgmental | 6 | — |
| T7 web if break | lib/schemas + routes | bounded | 4 | — |
| T8 gates | 9 cmds | bounded | 8 | — |
| T9 PR process | note + body bullets | trivial | 2 | — |

**Total estimated ops: ~47**

### Budget — per agent instance

| Instance | Tasks | Σ ops | Subjects | Split? |
|----------|-------|-------|----------|--------|
| devops-A | T1–T3, T9 | 13 | inventory, deps, pr | — |
| backend-dev-A | T4, T5 | 16 | parse, flows | — |
| backend-dev-B | T6 | 6 | mcp-api | — |
| frontend-dev-A | T7 | 4 | web | — |
| tester-A | T8 | 8 | gates | — |

## Consistency Report

- Criteria covered: 14/14 (SC from approved σ)
- Uncovered criteria: none
- Tasks without spec backing: none
- Gold plating exemptions: 0 (minimal fixtures required by σ — not full suite rewrite)

## Micro-Tasks

### Slice V1: Manifest + lock (not mergeable alone)

#### Task 1: Capture pre-bump Zod inventory → devops-A
- **File:** `artifacts/notes/23-zod-inventory.md` (create under worktree)
- **Snippet:** table `workspace | package.json range | lock resolution`; list import sites (core parse, flows schema/grant, mcp catalogue, example-api/web); note nested BA/FastMCP zod@4.4.3; note #29/#30 open
- **Verify:** `test -f artifacts/notes/23-zod-inventory.md && grep -E 'zod|3\\.25|4\\.' artifacts/notes/23-zod-inventory.md | wc -l` (ready)
- **Expected:** six pins listed; dual-graph pre-state recorded
- **Time:** 5 min
- **Difficulty:** 1
- **Traces:** SC-1–SC-2 (pre-state)
- **Phase:** GREEN
- **Subject:** inventory

#### Task 2: Pin zod ^4.4.3 on all six + clean install → devops-A
- **File:** six `package.json` + `bun.lock`
- **Snippet:** set `"zod": "^4.4.3"` (re-verify `npm view zod version`); normalize example-web exact pin; `rm -rf node_modules && bun install`; **no** `typescript` major / tsconfig target bump
- **Verify:** `grep -rn '"zod"' packages/*/package.json apps/*/package.json | grep -v 4\\. || true; test ! -z "$(grep -E '\\^4\\.4' packages/core/package.json)"` (ready)
- **Expected:** all six ranges 4.x; install succeeds; no TS7 edits
- **Time:** 10 min
- **Difficulty:** 2
- **Traces:** SC-1, SC-12
- **Phase:** GREEN
- **Subject:** deps
- **blockedBy:** T1

#### Task 3: Machine D2 assert (no zod@3 or allowlist) → devops-A
- **File:** inventory note (append evidence)
- **Snippet:** prefer `! grep -E 'zod@3\\.' bun.lock` (or `bun pm ls zod` only 4.x). If residual unavoidable: allowlist table `{package, why}` in note; fail if non-allowlisted 3.x
- **Verify:** `grep -E 'zod@3\\.' bun.lock || echo 'D2: no zod@3 in lock'` (ready — refine to allowlist if needed)
- **Expected:** D2 evidence appended; prefer zero zod@3
- **Time:** 5 min
- **Difficulty:** 2
- **Traces:** SC-2
- **Phase:** GREEN
- **Subject:** deps
- **blockedBy:** T2

#### RED-GATE: V1 complete → devops-A
- **Verify:** inventory exists; six pins ^4.x; D2 evidence recorded; **not** ship yet
- **Phase:** RED-GATE

### Slice V2: Schema port + green gates (ship control)

#### Task 4: Adapt @kit/core parseOrThrow + fieldErrors fixture → backend-dev-A
- **File:** `packages/core/src/parse.ts`, related tests under `packages/core`
- **Snippet:** keep `ParseableSchema` duck-type working on Zod 4; if `flatten()` shape changes, adapt once; add/adjust test asserting `AppError.validation` fieldErrors under Zod 4
- **Verify:** `bun run --filter @kit/core test` (ready)
- **Expected:** core tests exit 0; public AppError fieldErrors shape stable
- **Time:** 15 min
- **Difficulty:** 3
- **Traces:** SC-4
- **Phase:** GREEN
- **Subject:** parse
- **blockedBy:** T3

#### Task 5: Port @kit/flows schemas + z.record fixture → backend-dev-A
- **File:** `packages/flows/src/schema.ts`, `grant.ts`, `check.ts`, `*.test.ts` as needed
- **Snippet:** fix `z.record` one/two-arg, `.strict()`, `superRefine`, `safeParse`/`z.infer` for Zod 4; keep plan/grant validation behavior; ensure tests cover a plan with record task keys
- **Verify:** `bun run --filter @kit/flows test` (ready)
- **Expected:** flows tests exit 0; schemas portable on Zod 4
- **Time:** 25 min
- **Difficulty:** 4
- **Traces:** SC-3
- **Phase:** GREEN
- **Subject:** flows
- **blockedBy:** T4

#### Task 6: Fix @kit/mcp + example-api only if break → backend-dev-B
- **File:** `packages/mcp/src/catalogue.ts`, `packages/mcp/src/schemas.ts`, example-api env/route schemas — **only if typecheck/test fail**
- **Snippet:** no-op if green after T5; else fix `ZodTypeAny`, safeParse, `.strict()`; no product redesign
- **Verify:** `bun run --filter @kit/mcp test && bun run --filter @kit/example-api test` (ready)
- **Expected:** exit 0; empty adapter diff **or** minimal
- **Time:** 15 min
- **Difficulty:** 3
- **Traces:** SC-5, SC-6
- **Phase:** GREEN
- **Subject:** mcp-api
- **blockedBy:** T5

#### Task 7: Fix example-web schemas only if break → frontend-dev-A
- **File:** `apps/example-web/src/lib/schemas.ts` (+ routes using zod) — **only if typecheck fails**
- **Snippet:** no-op if green; else minimal Zod 4 fixes
- **Verify:** `bun run --filter @kit/example-web typecheck` (ready)
- **Expected:** exit 0
- **Time:** 10 min
- **Difficulty:** 2
- **Traces:** SC-8
- **Phase:** GREEN
- **Subject:** web
- **blockedBy:** T5

#### Task 8: Clean-install gates (typecheck + tests + smoke + validate:full) → tester-A
- **File:** n/a (commands only)
- **Snippet:** after clean install, run full ship gate set from σ
- **Verify:** `bun install && bun run typecheck && bun run --filter @kit/core test && bun run --filter @kit/flows test && bun run --filter @kit/mcp test && bun run --filter @kit/example-api test && bun run --filter @kit/auth test && bun run --filter @kit/example-web typecheck && bun run smoke:mcp && bun run validate:full` (ready)
- **Expected:** all exit 0
- **Time:** 25 min
- **Difficulty:** 2
- **Traces:** SC-3–SC-11
- **Phase:** GREEN
- **Subject:** gates
- **blockedBy:** T6, T7

#### RED-GATE: V2 complete → tester-A
- **Verify:** T8 green (smoke:mcp + validate:full required)
- **Phase:** RED-GATE

### Slice V3: Ship process

#### Task 9: PR body material + cross-track note → devops-A
- **File:** inventory note (append PR body bullets)
- **Snippet:** pin used; D2 evidence; allowlist if any; “no #24 / no typescript major”; #29/#30 freeze-or-rebase; Dependabot zod not ship unit; residual dual non-claim only if allowlisted
- **Verify:** `test -f artifacts/notes/23-zod-inventory.md && grep -E 'D2|4\\.4|validate:full|#24' artifacts/notes/23-zod-inventory.md` (ready)
- **Expected:** note ready for `/pr`; code commits already on branch
- **Time:** 5 min
- **Difficulty:** 1
- **Traces:** SC-12–SC-14
- **Phase:** GREEN
- **Subject:** pr
- **blockedBy:** T8

## Task Seeding Blueprint

<!-- Used by /implement to seed TaskCreate calls on session start.
     Format: T{n} | agent-instance | blockedBy | subject -->

### Wave 1 — T1→T2→T3 sequential, 1 agent

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T1 | devops-A | — | inventory |
| T2 | devops-A | T1 | deps |
| T3 | devops-A | T2 | deps |

### Wave 2 — after Wave 1

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T4 | backend-dev-A | T3 | parse |
| T5 | backend-dev-A | T4 | flows |

### Wave 3 — after Wave 2, 2 agents ∥

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T6 | backend-dev-B | T5 | mcp-api |
| T7 | frontend-dev-A | T5 | web |

### Wave 4 — after Wave 3

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T8 | tester-A | T6, T7 | gates |
| T9 | devops-A | T8 | pr |

Planning slice **all** (V1→V2→V3 sequential ship unit).

## Task IDs

<!-- Generated by /plan. Used by /implement to resume tasks on session restart. -->
- T1: T1 — inventory
- T2: T2 — deps
- T3: T3 — deps
- T4: T4 — parse
- T5: T5 — flows
- T6: T6 — mcp-api
- T7: T7 — web
- T8: T8 — gates
- T9: T9 — pr
