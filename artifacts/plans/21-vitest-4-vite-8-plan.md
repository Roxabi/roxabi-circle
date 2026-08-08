---
title: "Plan: chore(deps) wave 3 — vitest 4 + vite 8 + plugin-react"
issue: 21
spec: artifacts/specs/21-vitest-4-vite-8-spec.md
complexity: 5/10
tier: F-lite
generated: "2026-08-06T15:00:00Z"
---

## Summary

Coordinate a **single ship unit**: bump Vitest **3→4** (+ `@vitest/coverage-v8` 4.x) across all kit workspaces, and Vite **6→8** + `@vitejs/plugin-react` **6.x** on `example-web` + `packages/ui`, with **one** `bun install`, dual-major assert, frozen coverage floors, green typecheck / test:coverage / build:kit, then dedicated PR + close Dependabot #4 before merge.

**Implement-time pins (re-verify at start):** vitest + coverage-v8 **`^4.1.10`** · vite **`^8.2.0`** · `@vitejs/plugin-react` **`^6.0.5`**.

## Architecture

### Data Flow

**Diagram:** [wave 3 dep bump data flow](../visuals/21-vitest-4-vite-8-data-flow.html)

Inventory → coordinated package.json pins → atomic lock → dual-major assert → optional config → gates → ship PR + close #4.

### File x Function Map

**Diagram:** [files × roles](../visuals/21-vitest-4-vite-8-file-map.html)

Manifests (devops) + optional config touch (13 vitest + 2 vite + coverage helper) + gate commands (tester); no app domain code expected.

## Agents

| Agent | Task count | Files |
|-------|-----------|-------|
| devops-A | 4 | package.json × ~15, bun.lock, optional vitest/vite configs |
| tester-A | 2 | verify commands only (no new test files) |

## Wave Structure

3 waves, max 1 parallel agent (sequential dep wave). Elapsed ~0.5–1 day vs sequential same.

| Wave | Trigger | Agents | Tasks |
|------|---------|--------|-------|
| 1 | start | 1 | devops-A: T1→T2→T3 |
| 2 | Wave 1 done | 1 | devops-A: T4 · tester-A: T5 (T5 after T4) |
| 3 | Wave 2 done | 1 | devops-A: T6 |

### Budget — per task

| Task | Items | Class | Est. ops | Split? |
|------|-------|-------|----------|--------|
| T1 inventory | ~15 manifests | bounded | 3 | — |
| T2 bump + install | ~15 files + lock | bounded | 4 | — |
| T3 dual-major assert | lock/pm | bounded | 2 | — |
| T4 config if needed | 0–15 files | judgmental | 5 | — |
| T5 gates | 3 cmds | bounded | 4 | — |
| T6 #4 + PR prep | 2 | trivial | 2 | — |

**Total estimated ops: ~20**

### Budget — per agent instance

| Instance | Tasks | Σ ops | Subjects | Split? |
|----------|-------|-------|----------|--------|
| devops-A | T1–T4, T6 | 16 | inventory, deps, config, pr | — |
| tester-A | T5 | 4 | gates | — |

## Consistency Report

- Criteria covered: 10/10
- Uncovered criteria: none
- Tasks without spec backing: none
- Gold plating exemptions applied: 0 (no new unit tests — gates = typecheck + coverage floors + build:kit)

## Micro-Tasks

### Slice V1: Manifests + atomic lock

#### Task 1: Capture pre-bump dep inventory → devops-A
- **File:** `artifacts/notes/21-vitest-vite-inventory.md` (create under worktree)
- **Snippet:** table `path | field | today | target`
- **Verify:** `test -f artifacts/notes/21-vitest-vite-inventory.md && grep -E 'vitest|coverage-v8|plugin-react' artifacts/notes/21-vitest-vite-inventory.md | wc -l` (ready)
- **Expected:** inventory lists root coverage-v8, every workspace `vitest`, and both vite/plugin-react sites (example-web + ui)
- **Time:** 5 min
- **Difficulty:** 1
- **Traces:** SC-1–SC-4 (pre-state)
- **Phase:** GREEN
- **Subject:** inventory

#### Task 2: Pin all axes to same concrete ranges + one clean install → devops-A
- **File:** root + apps/*/package.json + packages/*/package.json + `bun.lock`
- **Snippet:** `"vitest": "^4.1.10"` (all); root `"@vitest/coverage-v8": "4.1.10"` (or `^4.1.10` if kit prefers caret — **aligned with vitest line**); example-web + ui `"vite": "^8.2.0"`, `"@vitejs/plugin-react": "^6.0.5"` **identical** in both; then `bun install`
- **Verify:** `grep -rn '"vitest"' --include=package.json apps packages package.json | grep -v node_modules; grep coverage-v8 package.json; grep -E 'vite|plugin-react' apps/example-web/package.json packages/ui/package.json; bun install` (ready)
- **Expected:** no `^3` vitest left; coverage-v8 4.x; web+ui share vite 8 + plugin-react 6 ranges; install succeeds
- **Time:** 8 min
- **Difficulty:** 2
- **Traces:** SC-1, SC-2, SC-3, SC-4
- **Phase:** GREEN
- **Subject:** deps
- **blockedBy:** T1

#### Task 3: Machine dual-major assert → devops-A
- **File:** n/a (commands + note evidence)
- **Snippet:** assert no kit vitest@3 / vite@6 after install — e.g. `grep` bun.lock / `bun pm ls` filtered; append result to inventory note
- **Verify:** `! grep -E 'vitest@3\.|"vitest": "\^3' bun.lock package.json apps/*/package.json packages/*/package.json 2>/dev/null | grep -v node_modules; ! grep -E '"vite": "\^6' apps/example-web/package.json packages/ui/package.json` (ready — refine if lock format differs)
- **Expected:** dual-major assert passes; evidence in inventory note
- **Time:** 5 min
- **Difficulty:** 2
- **Traces:** SC-5
- **Phase:** GREEN
- **Subject:** deps
- **blockedBy:** T2

#### RED-GATE: V1 complete → tester-A
- **Verify:** inventory exists; identical ranges per axis; dual-major assert recorded
- **Phase:** RED-GATE

### Slice V2: Config (if needed) + green gates

#### Task 4: Minimal config fixes only if gates would fail → devops-A
- **File:** `packages/config/vitest-coverage.mjs`, `*/vitest.config.ts`, `apps/example-web/vite.config.ts`, `packages/ui/vite.config.ts` — **only if needed**
- **Snippet:** no-op commit skip if bump-only greens; else minimal API renames for Vitest 4 / Vite 8 / plugin-react 6; **do not lower** coverage thresholds
- **Verify:** `git diff --stat -- '**/vitest.config.*' '**/vite.config.*' packages/config/vitest-coverage.mjs` (ready)
- **Expected:** either empty config diff, or minimal edits with floors unchanged
- **Time:** 10 min
- **Difficulty:** 3
- **Traces:** SC-7 (floors freeze), config edges
- **Phase:** GREEN
- **Subject:** config
- **blockedBy:** T3

#### Task 5: Clean-install gates (typecheck + coverage + build:kit) → tester-A
- **File:** n/a (commands only)
- **Snippet:** re-run install if needed then gates
- **Verify:** `bun install && bun run typecheck && bun run test:coverage && bun run build:kit` (ready)
- **Expected:** all exit 0; floors at pre-bump numbers (no silent lower)
- **Time:** 15 min
- **Difficulty:** 2
- **Traces:** SC-6, SC-7, SC-8
- **Phase:** GREEN
- **Subject:** gates
- **blockedBy:** T4

#### RED-GATE: V2 complete → tester-A
- **Verify:** T5 green; floors frozen
- **Phase:** RED-GATE

### Slice V3: Ship prep

#### Task 6: Dependabot #4 close plan + PR body material → devops-A
- **File:** inventory note + PR body material in note
- **Snippet:** list pin versions; dual-major evidence; “close #4 before merge”; note floor freeze; one ship unit
- **Verify:** `gh pr view 4 --json state,number,title` (ready)
- **Expected:** note documents #4 supersede; code ready for `/pr` (implement lands code commits only — do not open PR inside implement if process separates)
- **Time:** 5 min
- **Difficulty:** 1
- **Traces:** SC-9, SC-10
- **Phase:** GREEN
- **Subject:** pr
- **blockedBy:** T5

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
| T4 | devops-A | T3 | config |
| T5 | tester-A | T4 | gates |

### Wave 3 — after Wave 2

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T6 | devops-A | T5 | pr |

## Task IDs

<!-- Generated by /plan. Used by /implement to resume tasks on session restart. -->
- T1: T1 — inventory
- T2: T2 — deps
- T3: T3 — deps
- T4: T4 — config
- T5: T5 — gates
- T6: T6 — pr
