---
title: "Plan: chore(deps) wave 2 — lucide-react 1.x"
issue: 20
spec: artifacts/specs/20-lucide-react-1x-spec.md
complexity: 3/10
tier: F-lite
generated: "2026-08-06T12:00:00Z"
status: approved
normative: false
---

## Summary

Bump `lucide-react` from `^0.515.0` to a concrete `^1.N.M` (pin at implement: **1.29.0** or newer latest) in `@kit/ui` and `@kit/example-web`, refresh lockfile to a **single** 1.x resolution, fix any broken named imports via 1:1 renames (PR table if non-empty), prove green typecheck + example-web build after clean install, then ship a dedicated PR and close Dependabot #5 before merge.

## Architecture

### Data Flow

**Diagram:** [lucide-react bump data flow](../visuals/20-lucide-react-1x-data-flow.html)

Inventory → dual package.json pin → lockfile 1.x → import rename pass → clean-install V1–V3 gates → dedicated PR + close #5.

### File x Function Map

**Diagram:** [files × roles](../visuals/20-lucide-react-1x-file-map.html)

Manifests (devops) + ~14 `packages/ui` import sites + ~11 `example-web` import sites; no runtime API surface.

## Agents

| Agent | Task count | Files |
|-------|-----------|-------|
| devops-A | 3 | packages/ui/package.json, apps/example-web/package.json, bun.lock |
| frontend-dev-A | 2 | packages/ui/src/**, apps/example-web/src/** lucide imports |
| tester-A | 2 | verify commands only (no new test files required) |

## Wave Structure

3 waves, max 1 parallel agent (sequential dep bump). Elapsed ~0.5 day vs ~0.5 sequential.

| Wave | Trigger | Agents | Tasks |
|------|---------|--------|-------|
| 1 | start | 1 | devops-A: T1→T2 |
| 2 | Wave 1 done | 1 | frontend-dev-A: T3→T4 |
| 3 | Wave 2 done | 1 | tester-A: T5 · devops-A: T6 |

### Budget — per task

| Task | Items | Class | Est. ops | Split? |
|------|-------|-------|----------|--------|
| T1 inventory | ~25 files | bounded | 3 | — |
| T2 bump + install | 3 files | bounded | 3 | — |
| T3 rename ui | ~14 files | judgmental | 5 | — |
| T4 rename web | ~11 files | judgmental | 5 | — |
| T5 gates | 3 cmds | bounded | 3 | — |
| T6 #5 + PR prep | 2 | trivial | 2 | — |

**Total estimated ops: ~21**

### Budget — per agent instance

| Instance | Tasks | Σ ops | Subjects | Split? |
|----------|-------|-------|----------|--------|
| devops-A | T1, T2, T6 | 8 | deps, lock, pr | — |
| frontend-dev-A | T3, T4 | 10 | icons-ui, icons-web | — |
| tester-A | T5 | 3 | gates | — |

## Consistency Report

- Criteria covered: 9/9
- Uncovered criteria: none
- Tasks without spec backing: none
- Gold plating exemptions applied: 0 (no new unit tests — gates = typecheck + build per issue)

## Micro-Tasks

### Slice V1: Inventory + bump + lock

#### Task 1: Capture pre-bump lucide import inventory → devops-A
- **File:** `artifacts/notes/20-lucide-import-inventory.md` (create under worktree)
- **Snippet:** table `path | named exports`
- **Verify:** `test -f artifacts/notes/20-lucide-import-inventory.md && grep -c 'lucide-react' artifacts/notes/20-lucide-import-inventory.md` (ready)
- **Expected:** inventory lists all ~25 import sites under packages/ui + apps/example-web
- **Time:** 5 min
- **Difficulty:** 1
- **Traces:** SC-3 (pre-inventory)
- **Phase:** GREEN
- **Subject:** inventory

#### Task 2: Pin both package.json to same ^1.N.M + clean install → devops-A
- **File:** `packages/ui/package.json`, `apps/example-web/package.json`, `bun.lock`
- **Snippet:** `"lucide-react": "^1.29.0"` (or implement-time latest; **identical** in both)
- **Verify:** `grep -n 'lucide-react' packages/ui/package.json apps/example-web/package.json && bun install` (ready)
- **Expected:** both ranges identical; lock resolves single 1.x; no 0.515 left for these deps
- **Time:** 5 min
- **Difficulty:** 2
- **Traces:** SC-1, SC-2
- **Phase:** GREEN
- **Subject:** deps
- **blockedBy:** T1

#### RED-GATE: V1 complete → tester-A
- **Verify:** inventory file exists; both package.json share range; lock 1.x
- **Phase:** RED-GATE

### Slice V2: Rename pass + green

#### Task 3: Fix packages/ui lucide imports (1:1 renames) → frontend-dev-A
- **File:** `packages/ui/src/**` lucide import sites
- **Snippet:** update named imports only if typecheck fails; document old→new in inventory note
- **Verify:** `bun run --filter @kit/ui typecheck` (ready)
- **Expected:** exit 0; any renames listed in inventory note / PR table
- **Time:** 10 min
- **Difficulty:** 3
- **Traces:** SC-4, SC-5
- **Phase:** GREEN
- **Subject:** icons-ui
- **blockedBy:** T2

#### Task 4: Fix example-web lucide imports (1:1 renames) → frontend-dev-A
- **File:** `apps/example-web/src/**` lucide import sites
- **Snippet:** same rename discipline as T3
- **Verify:** `bun run --filter @kit/example-web typecheck` (ready)
- **Expected:** exit 0
- **Time:** 10 min
- **Difficulty:** 3
- **Traces:** SC-4, SC-6
- **Phase:** GREEN
- **Subject:** icons-web
- **blockedBy:** T3

#### Task 5: Clean-install gates (typecheck×2 + build) → tester-A
- **File:** n/a (commands only)
- **Snippet:** re-run install if needed then V1–V3
- **Verify:** `bun install && bun run --filter @kit/ui typecheck && bun run --filter @kit/example-web typecheck && bun run --filter @kit/example-web build` (ready)
- **Expected:** all exit 0; no unresolved lucide-react exports
- **Time:** 8 min
- **Difficulty:** 2
- **Traces:** SC-5, SC-6, SC-7
- **Phase:** GREEN
- **Subject:** gates
- **blockedBy:** T4

#### RED-GATE: V2 complete → tester-A
- **Verify:** T5 green; post-inventory ⊆ pre ∪ rename table
- **Phase:** RED-GATE

### Slice V3: Ship prep

#### Task 6: Dependabot #5 close plan + PR body material → devops-A
- **File:** inventory note + commit message / PR body draft in note
- **Snippet:** list rename table (or “none”); note “close #5 before merge”
- **Verify:** `gh pr view 5 --json state,number` (ready)
- **Expected:** note documents #5 supersede; ready for `/pr` step (do not open PR inside implement if process separates — implement lands code commits only)
- **Time:** 5 min
- **Difficulty:** 1
- **Traces:** SC-8, SC-9
- **Phase:** GREEN
- **Subject:** pr
- **blockedBy:** T5

## Task Seeding Blueprint

<!-- Used by /implement to seed TaskCreate calls on session start.
     Format: T{n} | agent-instance | blockedBy | subject -->

### Wave 1 — no deps then T1→T2, 1 agent

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T1 | devops-A | — | inventory |
| T2 | devops-A | T1 | deps |

### Wave 2 — after Wave 1, 1 agent

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T3 | frontend-dev-A | T2 | icons-ui |
| T4 | frontend-dev-A | T3 | icons-web |

### Wave 3 — after Wave 2, 1–2 agents

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T5 | tester-A | T4 | gates |
| T6 | devops-A | T5 | pr |

## Task IDs

<!-- Generated by /plan. Used by /implement to resume tasks on session restart. -->
- T1: T1 — inventory
- T2: T2 — deps
- T3: T3 — icons-ui
- T4: T4 — icons-web
- T5: T5 — gates
- T6: T6 — pr
