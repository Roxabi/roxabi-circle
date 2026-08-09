---
title: "Plan: chore(deps) wave 5b — TypeScript → 7"
issue: 24
spec: artifacts/specs/24-typescript-7-spec.md
complexity: 6/10
tier: F-lite
generated: "2026-08-07T14:00:00Z"
status: approved
normative: false
---

## Summary

Single ship unit: bump monorepo **TypeScript 5.9.3 → ^7.0.2** on all **15** manifests that pin it, clean install, permanent **`ts-major`** gate (mirror `zod-major`), fix **6/7 hard deprecations** (known: `packages/ui` `baseUrl`) + first-party diagnostics under native `tsc` 7, update AGENTS to **TypeScript 7+**, then green **forced typecheck** · `build:kit` · `validate:full`. Dedicated PR for #24 with triage attestation; **close Dependabot #12 before merge**; not a ship unit if only #12 lands green.

**Implement-time pin (re-verify at start):** `typescript` **`^7.0.2`** (or newer 7.x patch if npm latest). Confirm #12 still open and 6.x bridge availability for hatch.

## Architecture

### Data Flow

**Diagram:** [wave 5b TypeScript 7 data flow](../visuals/24-typescript-7-data-flow.html)

Inventory → pin ^7.0.2 + lock → permanent D2 (`ts-major`) → compile fixes (ui baseUrl + first-party) → docs → forced gates → ship PR (close #12 first).

### File x Function Map

**Diagram:** [files × roles](../visuals/24-typescript-7-file-map.html)

Manifest + lock + D2 script (devops) · compile/tsconfig (backend-A) · AGENTS (doc-writer) · gates (tester) · PR process (devops).

## Bootstrap Context

- Frame: `artifacts/frames/24-typescript-7-frame.md` (approved, F-lite)
- Spec: `artifacts/specs/24-typescript-7-spec.md` (approved)
- Branch/ω: `feat/24-typescript-7` @ `~/.grok/worktrees/Roxabi-roxabi-boilerplate-cf/24-typescript-7`
- Prior wave pattern: #23 Zod 4 plan (deps wave sequential + permanent major script)
- Known pins: root + 14 workspaces all `^5.9.0` → resolved `5.9.3`; `@kit/config` unpinned
- Known landmine: `packages/ui/tsconfig.json` `"baseUrl": "."` + `paths` `@/*`
- Dependabot: **PR #12** `dependabot/npm_and_yarn/typescript-7.0.2` (same 15 files) — not ship unit
- Ref script: `scripts/check-zod-major.sh` + `zod-major` in `validate` / `validate:full`

## Agents

| Agent | Task count | Files |
|-------|-----------|-------|
| devops-A | 4 | 15× package.json, bun.lock, check-typescript-major.sh, package.json scripts, inventory note, PR material |
| backend-dev-A | 1 | packages/ui/tsconfig.json + any first-party type/tsconfig fixes |
| doc-writer-A | 1 | AGENTS.md (+ residual 5.9 target docs) |
| tester-A | 1 | gate commands only |

## Wave Structure

4 waves, max 2 parallel agents (Wave 3). Elapsed ~0.5–1 day vs sequential same.

| Wave | Trigger | Agents | Tasks |
|------|---------|--------|-------|
| 1 | start | 1 | devops-A: T1→T2→T3 |
| 2 | Wave 1 done | 1 | backend-dev-A: T4 |
| 3 | Wave 2 done | 2 ∥ | doc-writer-A: T5 · tester-A: T6 (after T5 if docs-only conflict; prefer T5 then T6 sequential if same tree thrash — default T5 ∥ start of T6 only when docs don't touch typecheck paths; **implement: T5 then T6** if unsure) |
| 4 | Wave 3 done | 1 | devops-A: T7 |

**Implement note:** Prefer **T5 → T6** sequential on one wave if parallel thrash risk; blueprint lists T5 ∥ T6 with T6 blockedBy T4 only — if docs touch AGENTS only, true parallel is fine. Safer default for agents: **T6 blockedBy T4,T5**.

| Wave (safe) | Trigger | Agents | Tasks |
|-------------|---------|--------|-------|
| 3' | after T4 | 1 | doc-writer-A: T5 |
| 4' | after T5 | 1 | tester-A: T6 |
| 5' | after T6 | 1 | devops-A: T7 |

Use **safe** chain in seeding blueprint below.

### Budget — per task

| Task | Items | Class | Est. ops | Split? |
|------|-------|-------|----------|--------|
| T1 inventory | 15 pins + ui baseUrl + AGENTS + #12 | bounded | 4 | — |
| T2 pin + clean install | 15 package.json + lock | bounded | 6 | — |
| T3 ts-major script + wire | script + package.json validate* | judgmental | 8 | — |
| T4 compile fixes | ui tsconfig + first-party errors | judgmental | 15 | — |
| T5 docs | AGENTS + grep | bounded | 4 | — |
| T6 gates | force typecheck · build:kit · validate:full · ts-major | bounded | 10 | — |
| T7 PR process | note + close #12 checklist | trivial | 3 | — |

**Total estimated ops: ~50**

### Budget — per agent instance

| Instance | Tasks | Σ ops | Subjects | Split? |
|----------|-------|-------|----------|--------|
| devops-A | T1–T3, T7 | 21 | inventory, deps, gate-script, pr | — |
| backend-dev-A | T4 | 15 | compile | — |
| doc-writer-A | T5 | 4 | docs | — |
| tester-A | T6 | 10 | gates | — |

## Consistency Report

- Criteria covered: 16/16 (SC from approved σ)
- Uncovered criteria: none
- Tasks without spec backing: none
- Gold plating exemptions: 0 (permanent ts-major required by σ — mirror zod-major)

## Micro-Tasks

### Slice V1: Manifest + lock + D2 script (not mergeable alone)

#### Task 1: Capture pre-bump TypeScript inventory → devops-A
- **File:** `artifacts/notes/24-typescript-inventory.md` (create under worktree)
- **Snippet:** table `manifest | package.json range | lock resolution`; list all 15 paths; note `@kit/config` unpinned; record `packages/ui` baseUrl+paths; AGENTS Language row text; Dependabot #12 state/target; optional `npm view typescript version` / 6.x bridge note for hatch
- **Verify:** `test -f artifacts/notes/24-typescript-inventory.md && grep -E 'typescript|5\\.9|baseUrl|#12' artifacts/notes/24-typescript-inventory.md | wc -l` (ready)
- **Expected:** 15 pins listed; baseUrl + #12 recorded
- **Time:** 8 min
- **Difficulty:** 1
- **Traces:** SC-1–SC-2 (pre-state), χ items
- **Phase:** GREEN
- **Subject:** inventory

#### Task 2: Pin typescript ^7.0.2 on all 15 + clean install → devops-A
- **File:** root + 14 workspace `package.json` + `bun.lock`
- **Snippet:** re-verify `npm view typescript version` (or bun); set `"typescript": "^7.0.2"` (or newer 7.x patch) on every pin; `rm -rf node_modules && bun install`; **no** product domain edits; **no** other majors
- **Verify:** `! grep -rn '"typescript":\s*"\^5' package.json packages/*/package.json apps/*/package.json 2>/dev/null; grep -qE '"typescript":\s*"\^7' package.json` (ready)
- **Expected:** all 15 ranges ^7; install succeeds
- **Time:** 12 min
- **Difficulty:** 2
- **Traces:** SC-1
- **Phase:** GREEN
- **Subject:** deps
- **blockedBy:** T1

#### Task 3: Permanent D2 — check-typescript-major.sh + wire validate → devops-A
- **File:** `scripts/check-typescript-major.sh`, root `package.json` (`ts-major`, `validate`, `validate:full`)
- **Snippet:** mirror `scripts/check-zod-major.sh`: (1) fail if any of the 15 manifests pin outside `^7`; (2) fail on non-allowlisted `typescript@5.` (and optionally `@6.` if end state pure-7) in `bun.lock`; empty allowlist default; dual-install API exception only if documented in script header + inventory note; wire `"ts-major": "bash scripts/check-typescript-major.sh"` into both `validate` and `validate:full` next to `zod-major`
- **Verify:** `bash scripts/check-typescript-major.sh && grep -q ts-major package.json && grep -E 'validate:full' package.json | grep -q ts-major` (ready)
- **Expected:** script exits 0 after T2; present in validate:full
- **Time:** 15 min
- **Difficulty:** 3
- **Traces:** SC-2
- **Phase:** GREEN
- **Subject:** gate-script
- **blockedBy:** T2

#### RED-GATE: V1 complete → devops-A
- **Verify:** inventory exists; 15 pins ^7; `bun run ts-major` green; **not** ship yet
- **Phase:** RED-GATE

### Slice V2: Compile green + docs (ship control)

#### Task 4: First-party compile fixes under tsc 7 (incl. ui baseUrl) → backend-dev-A
- **File:** `packages/ui/tsconfig.json` + any packages/apps that fail typecheck
- **Snippet:** drop `"baseUrl": "."`; re-express `paths` as project-root-relative so `@/*` still resolves (or equivalent minimal 6/7-legal paths); run `turbo run typecheck --force` and fix **first-party** errors only under existing strict + skipLibCheck; no `strict: false`; no mass `@ts-ignore`; `@ts-expect-error` only with reason + note in inventory; tool peers / dual-install only if a gate tool fails; if hatch needed: document trigger + 6.x bridge in inventory, intermediate commits same branch, end on tsc 7
- **Verify:** `! grep -q baseUrl packages/ui/tsconfig.json; turbo run typecheck --force` (ready)
- **Expected:** no ui baseUrl; forced typecheck exit 0
- **Time:** 45–90 min
- **Difficulty:** 4
- **Traces:** SC-3, SC-4, SC-7, SC-9–SC-11, SC-16
- **Phase:** GREEN
- **Subject:** compile
- **blockedBy:** T3

#### Task 5: AGENTS TypeScript 7+ + residual 5.9 targets → doc-writer-A
- **File:** `AGENTS.md` (+ any kit doc that hardcodes 5.9 as *target*)
- **Snippet:** Language row **TypeScript 5.9+ strict → TypeScript 7+ strict**; grep kit for residual target wording (not historical issue IDs); no new language-feature essay
- **Verify:** `grep -n 'TypeScript 7' AGENTS.md && ! grep -n 'TypeScript 5\\.9+' AGENTS.md` (ready)
- **Expected:** AGENTS target is 7+
- **Time:** 8 min
- **Difficulty:** 1
- **Traces:** SC-8
- **Phase:** GREEN
- **Subject:** docs
- **blockedBy:** T4

#### RED-GATE: V2 technical complete → backend-dev-A / doc-writer-A
- **Verify:** forced typecheck green; no ui baseUrl; AGENTS 7+
- **Phase:** RED-GATE

### Slice V3: Ship process

#### Task 6: Clean-install gates (force typecheck · build:kit · validate:full) → tester-A
- **File:** n/a (commands only); append evidence paths to inventory note
- **Snippet:** after clean install on wave branch: `bun run ts-major` · `turbo run typecheck --force` (or `TURBO_FORCE=true bun run typecheck`) · `bun run build:kit` · `bun run validate:full`; record log excerpts for PR attestation (fixes list **or** “0 new first-party diagnostics”)
- **Verify:** `bun run ts-major && turbo run typecheck --force && bun run build:kit && bun run validate:full` (ready)
- **Expected:** all exit 0; evidence in inventory note
- **Time:** 25–40 min
- **Difficulty:** 2
- **Traces:** SC-2–SC-6, SC-12
- **Phase:** GREEN
- **Subject:** gates
- **blockedBy:** T5

#### RED-GATE: Gates green → tester-A
- **Verify:** T6 all green including validate:full
- **Phase:** RED-GATE

#### Task 7: PR body material + Dependabot #12 close-before-merge → devops-A
- **File:** inventory note (append PR body bullets)
- **Snippet:** pin used; D2/ts-major evidence; force-typecheck evidence; compile fixes list or zero-diagnostics attestation; “no other majors”; #30/#31 dirty-merge ban; **close/supersede #12 before dedicated merge**; do not label #12 `reviewed`; ship vehicle = dedicated #24 PR only; title shape `chore(deps): wave5b typescript7…`
- **Verify:** `test -f artifacts/notes/24-typescript-inventory.md && grep -E 'ts-major|validate:full|#12|attestation|wave5b' artifacts/notes/24-typescript-inventory.md` (ready)
- **Expected:** note ready for `/pr`; code commits already on branch
- **Time:** 8 min
- **Difficulty:** 1
- **Traces:** SC-12–SC-15
- **Phase:** GREEN
- **Subject:** pr
- **blockedBy:** T6

## Task Seeding Blueprint

<!-- Used by /implement to seed TaskCreate calls on session start.
     Format: T{n} | agent-instance | blockedBy | subject
     Safe sequential waves (docs before full gates). -->

### Wave 1 — T1→T2→T3 sequential, 1 agent

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T1 | devops-A | — | inventory |
| T2 | devops-A | T1 | deps |
| T3 | devops-A | T2 | gate-script |

### Wave 2 — after Wave 1

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T4 | backend-dev-A | T3 | compile |

### Wave 3 — after Wave 2

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T5 | doc-writer-A | T4 | docs |

### Wave 4 — after Wave 3

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T6 | tester-A | T5 | gates |
| T7 | devops-A | T6 | pr |

Planning slice **all** (V1→V2→V3 sequential ship unit).

## Task IDs

<!-- Generated by /plan. Used by /implement to resume tasks on session restart. -->
- T1: T1 — inventory
- T2: T2 — deps
- T3: T3 — gate-script
- T4: T4 — compile
- T5: T5 — docs
- T6: T6 — gates
- T7: T7 — pr
