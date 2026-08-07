---
title: "Plan: chore(deps) wave 4 — fastmcp 4"
issue: 22
spec: artifacts/specs/22-fastmcp-4-spec.md
complexity: 4/10
tier: F-lite
generated: "2026-08-07T12:00:00Z"
---

## Summary

Single ship unit: bump **FastMCP 3→4** on `apps/mcp-example`, one clean `bun install`, single-major assert (no consumer on 3.x), fix constructor/`addTool`/stdio only if broken, then green typecheck + package tests + `smoke:mcp` + `validate:full`. Dedicated PR for #22; **do not merge Dependabot #7** — close/supersede before merge.

**Implement-time pin (re-verify at start):** `fastmcp` **`^4.12.6`** (or latest 4.x if newer; ≥ Dependabot #7 target 4.12.2).

## Architecture

### Data Flow

**Diagram:** [wave 4 FastMCP data flow](../visuals/22-fastmcp-4-data-flow.html)

Inventory → pin 4.x + lock → single-major assert → optional adapter → gates → ship PR + close #7.

### File x Function Map

**Diagram:** [files × roles](../visuals/22-fastmcp-4-file-map.html)

Manifest + lock (devops) · optional `index.ts` / `catalogue.ts` / `stdio-smoke.mjs` · gate commands (tester). No product MCP tools.

## Agents

| Agent | Task count | Files |
|-------|-----------|-------|
| devops-A | 5 | mcp-example package.json, bun.lock, optional index/catalogue/smoke, inventory note |
| tester-A | 1 | verify commands only (no new test files) |

## Wave Structure

3 waves, max 1 parallel agent (sequential dep wave). Elapsed ~0.5 day vs sequential same.

| Wave | Trigger | Agents | Tasks |
|------|---------|--------|-------|
| 1 | start | 1 | devops-A: T1→T2→T3 |
| 2 | Wave 1 done | 1 | devops-A: T4 · tester-A: T5 (T5 after T4) |
| 3 | Wave 2 done | 1 | devops-A: T6 |

### Budget — per task

| Task | Items | Class | Est. ops | Split? |
|------|-------|-------|----------|--------|
| T1 inventory | 4–6 paths | bounded | 3 | — |
| T2 pin + install | 2 files + lock | bounded | 4 | — |
| T3 single-major assert | lock/pm | bounded | 2 | — |
| T4 adapter if needed | 0–3 files | judgmental | 6 | — |
| T5 gates | 5 cmds | bounded | 5 | — |
| T6 #7 + PR prep | 2 | trivial | 2 | — |

**Total estimated ops: ~22**

### Budget — per agent instance

| Instance | Tasks | Σ ops | Subjects | Split? |
|----------|-------|-------|----------|--------|
| devops-A | T1–T4, T6 | 17 | inventory, deps, adapter, pr | — |
| tester-A | T5 | 5 | gates | — |

## Consistency Report

- Criteria covered: 14/14 (SC from approved σ)
- Uncovered criteria: none
- Tasks without spec backing: none
- Gold plating exemptions: 0 (no new unit tests — real FastMCP proven by smoke:mcp; @kit/mcp fakes still run)

## Micro-Tasks

### Slice V1: Manifest + lock (not mergeable alone)

#### Task 1: Capture pre-bump FastMCP inventory → devops-A
- **File:** `artifacts/notes/22-fastmcp-inventory.md` (create under worktree)
- **Snippet:** table `path | field/API | today | target` for package.json, lock pin, index.ts construct/start, catalogue ToolServer/registerAll, stdio-smoke; note Dependabot #7 target
- **Verify:** `test -f artifacts/notes/22-fastmcp-inventory.md && grep -E 'fastmcp|FastMCP|smoke' artifacts/notes/22-fastmcp-inventory.md | wc -l` (ready)
- **Expected:** inventory lists current `^3.1.0` / lock 3.35.0 and touchpoints for A1–A3
- **Time:** 5 min
- **Difficulty:** 1
- **Traces:** SC-1–SC-2 (pre-state)
- **Phase:** GREEN
- **Subject:** inventory

#### Task 2: Pin fastmcp ^4.x + one clean install → devops-A
- **File:** `apps/mcp-example/package.json`, `bun.lock`
- **Snippet:** `"fastmcp": "^4.12.6"` (re-verify `npm view fastmcp version` at implement); `bun install` once; **no** monorepo/`packages/*` zod range changes
- **Verify:** `grep -E '"fastmcp"' apps/mcp-example/package.json; bun install` (ready)
- **Expected:** package range is 4.x; install succeeds; no packages/* zod edits in diff
- **Time:** 8 min
- **Difficulty:** 2
- **Traces:** SC-1, SC-13
- **Phase:** GREEN
- **Subject:** deps
- **blockedBy:** T1

#### Task 3: Single-major assert (no fastmcp@3 for consumer) → devops-A
- **File:** inventory note (append evidence)
- **Snippet:** e.g. `rg 'fastmcp@3\\.' bun.lock` empty / `bun pm ls fastmcp` shows 4.x for mcp-example; package.json still `^4`
- **Verify:** `grep '"fastmcp"' apps/mcp-example/package.json | grep -E '\\^4|4\\.'; ! grep -E 'fastmcp@3\\.' bun.lock || true` (ready — refine if lock format differs; evidence must show 4.x wins)
- **Expected:** D2 passes; evidence appended to inventory note
- **Time:** 5 min
- **Difficulty:** 2
- **Traces:** SC-2
- **Phase:** GREEN
- **Subject:** deps
- **blockedBy:** T2

#### RED-GATE: V1 complete → devops-A
- **Verify:** inventory exists; range 4.x; D2 evidence recorded; **not** ship yet
- **Phase:** RED-GATE

### Slice V2: Adapter (if needed) + green gates (ship control)

#### Task 4: Minimal adapter fixes only if typecheck/smoke would fail → devops-A
- **File:** `apps/mcp-example/src/index.ts`, `packages/mcp/src/catalogue.ts`, `apps/mcp-example/scripts/stdio-smoke.mjs` — **only if needed**
- **Snippet:** no-op if bump-only greens; else fix FastMCP construct/start, `addTool` payload vs duck-type, or smoke handshake; keep tools `ping`/`whoami` only; keep `@kit/mcp` free of hard `fastmcp` dep unless peer force **only** under mcp-example + PR note
- **Verify:** `git diff --stat -- apps/mcp-example/src/index.ts packages/mcp/src/catalogue.ts apps/mcp-example/scripts/stdio-smoke.mjs packages/mcp/package.json` (ready)
- **Expected:** empty adapter diff **or** minimal edits; still no product MCP tools; still no packages/* zod range change
- **Time:** 15 min
- **Difficulty:** 3
- **Traces:** SC-3, SC-4, SC-13, SC-14
- **Phase:** GREEN
- **Subject:** adapter
- **blockedBy:** T3

#### Task 5: Clean-install gates (typecheck + tests + smoke + validate:full) → tester-A
- **File:** n/a (commands only)
- **Snippet:** after clean install, run ship gates
- **Verify:** `bun install && bun run --filter @kit/mcp typecheck && bun run --filter @kit/mcp-example typecheck && bun run --filter @kit/mcp test && bun run --filter @kit/mcp-example test && bun run smoke:mcp && bun run validate:full` (ready)
- **Expected:** all exit 0
- **Time:** 20 min
- **Difficulty:** 2
- **Traces:** SC-5–SC-10
- **Phase:** GREEN
- **Subject:** gates
- **blockedBy:** T4

#### RED-GATE: V2 complete → tester-A
- **Verify:** T5 green (smoke:mcp required)
- **Phase:** RED-GATE

### Slice V3: Ship process

#### Task 6: Dependabot #7 close plan + PR body material → devops-A
- **File:** inventory note (append PR body bullets)
- **Snippet:** pins used; D2 evidence; “do not merge #7”; close #7 before dedicated merge; residuals dual-Zod + empty-input smoke non-claim; one ship unit
- **Verify:** `gh pr view 7 --json state,number,title` (ready)
- **Expected:** note documents #7 supersede policy; code ready for `/pr` (implement lands code commits — open PR in `/pr` step)
- **Time:** 5 min
- **Difficulty:** 1
- **Traces:** SC-11, SC-12, SC-14
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
| T4 | devops-A | T3 | adapter |
| T5 | tester-A | T4 | gates |

### Wave 3 — after Wave 2

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T6 | devops-A | T5 | pr |

Planning slice **all** (V1→V2→V3 sequential ship unit).

## Task IDs

<!-- Generated by /plan. Used by /implement to resume tasks on session restart. -->
- T1: T1 — inventory
- T2: T2 — deps
- T3: T3 — deps
- T4: T4 — adapter
- T5: T5 — gates
- T6: T6 — pr
