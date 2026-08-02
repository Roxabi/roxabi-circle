---
title: "Plan: Layer import boundary gate (packages↛apps)"
issue: 69
spec: artifacts/specs/69-layer-import-boundary-gate-spec.md
complexity: 4/10
tier: F-lite
generated: 2026-08-02
status: approved
---

## Summary

Ship `scripts/check-import-boundaries.ts` (R1–R4 static import zones), temp-dir self-test harness, fail-closed exemptions, wire both into `validate:full`, and document **CP-IMPORT** honesty. Single PR · V1→V2→V3 (plan 009 S1–S3).

## Architecture

**Data flow:** [Import boundary scan flow](../visuals/69-layer-import-boundary-gate-data-flow.html)  
**File map:** [Files × functions](../visuals/69-layer-import-boundary-gate-file-map.html)

## Bootstrap Context

- Worktree: `.claude/worktrees/69-layer-import-boundary-gate`
- Branch: `feat/69-layer-import-boundary-gate`
- Frame + spec approved on branch; SSoT `plans/009-layer-import-gate.md`
- Patterns: `scripts/check-env-sync.ts` (Bun CLI + ROOT), `scripts/check-banned-strings.sh` (walk + exclusions), `scripts/test-deny-upstream.sh` (temp fixtures + matrix in validate:full), `tools/file_exemptions.txt` (path + reason)
- Workspace names: packages `@gosilex/*` + apps `@gosilex/example-api|example-web|mcp-example`
- Walk roots: **only** `packages/` + `apps/` — never scripts/tools/fixtures
- Prefer **zero new deps**; regex + path resolve

## Agents

| Agent | Instance | Tasks | Files |
|-------|----------|-------|-------|
| backend-dev | backend-dev-A | T1–T3 | scanner, exemptions stub, harness |
| devops | devops-A | T4 | package.json |
| doc-writer | doc-writer-A | T5 | docs/testing.md |
| tester | tester-A | T6 | RED-GATE verify |

## Wave Structure

4 waves, max 1 parallel agent (sequential deps; small surface). Elapsed ~1 session.

| Wave | Trigger | Agents | Tasks |
|------|---------|--------|-------|
| 1 | start | backend-dev-A | T1 → T2 → T3 |
| 2 | Wave 1 done | devops-A | T4 |
| 3 | Wave 2 done | doc-writer-A | T5 |
| 4 | Wave 3 done | tester-A | T6 (RED-GATE) |

### Budget — per task

| Task | Items | Class | Est. ops | Split? |
|------|-------|-------|----------|--------|
| T1 | scanner R1–R4 | judgmental | 10 | — |
| T2 | exemptions file | trivial | 2 | — |
| T3 | self-test harness | judgmental | 8 | — |
| T4 | package.json wire | trivial | 2 | — |
| T5 | CP-IMPORT docs | bounded | 3 | — |
| T6 | RED-GATE | bounded | 4 | — |

**Total estimated ops: ~29**

### Budget — per agent instance

| Instance | Tasks | Σ ops | Subjects | Split? |
|----------|-------|-------|----------|--------|
| backend-dev-A | T1–T3 | 20 | scanner, exemptions, harness | — |
| devops-A | T4 | 2 | package | — |
| doc-writer-A | T5 | 3 | testing | — |
| tester-A | T6 | 4 | verify | — |

## Consistency Report

| | |
|--|--|
| Covered SC | SC1–SC9, SC11 via T1–T6 |
| Uncovered | R5 optional (explicit OOS) |
| Untraced tasks | none |
| Exemptions | empty exemptions file shipped; no live package exemptions expected on clean tree |

## Micro-Tasks

### Slice V1 — Scanner R1–R3 (+ core R4 in same file)

#### T1 — check-import-boundaries.ts

| Field | Value |
|-------|-------|
| Description | Create `scripts/check-import-boundaries.ts` (Bun): (1) ROOT = monorepo root; (2) build workspace map from `packages/*/package.json` **and** `apps/*/package.json` `name` → dir; (3) walk `packages/**` + `apps/**` for `.ts/.tsx/.js/.mjs`, exclude node_modules/dist/.wrangler/coverage + `*.test.ts`/`*.spec.ts`; (4) extract string literals: `from '…'`, `export … from '…'`, side-effect `import '…'`, `require('…')`, `import('…')`; (5) resolve workspace by longest name prefix + relative path normalize; (6) R1/R2 packages→apps; R3 example-web→example-api; R4 example-web→`cloudflare:workers` (+ optional WORKER_BAR constant); (7) load exemptions; invalid reason → exit 2; (8) report `RULE file:line → import` + remediation footer; exit 1 if violations. No heavy deps. |
| File path | `scripts/check-import-boundaries.ts` |
| Code snippet | `#!/usr/bin/env bun` + `import.meta.dirname` ROOT pattern like check-env-sync |
| Verify | `bun run scripts/check-import-boundaries.ts` on clean tree |
| Expected | exit 0; p95 &lt; 3s |
| Time | 20 min |
| `[P]` | N |
| Agent | backend-dev |
| Agent instance | backend-dev-A |
| Subject | scanner |
| Spec trace | SC1 · SC3–SC5 · SC9 · SC11 · U1 · EB1–11 |
| Slice | V1 |
| Phase | GREEN |
| Difficulty | 4 |

#### T2 — exemptions file stub

| Field | Value |
|-------|-------|
| Description | Create `tools/import-boundary-exemptions.txt` with header comments explaining format: `exact/relative/importer/path.ts  # reason — #issue`. Zero active exemptions on ship. Match culture of `tools/file_exemptions.txt`. |
| File path | `tools/import-boundary-exemptions.txt` |
| Code snippet | comment-only template lines |
| Verify | `test -f tools/import-boundary-exemptions.txt` |
| Expected | file exists; scanner still exit 0 |
| Time | 3 min |
| `[P]` | N (after T1 can load it) |
| Agent | backend-dev |
| Agent instance | backend-dev-A |
| Subject | exemptions |
| Spec trace | SC6 · U2 |
| Slice | V1 |
| Phase | GREEN |
| Difficulty | 1 |

### Slice V2 — Self-test + validate:full

#### T3 — test-import-boundaries.sh harness

| Field | Value |
|-------|-------|
| Description | Create `scripts/test-import-boundaries.sh`: mktemp tree with minimal packages/apps package.json names + planted source files for (a) R1 workspace packages→apps, (b) R2 relative packages→apps, (c) R3 web→api, (d) R4 cloudflare:workers, (e) exemption without reason → exit 2, (f) valid exemption suppresses one case. Invoke scanner with env/ROOT override pointing at temp tree (implement `IMPORT_BOUNDARY_ROOT` or argv `--root` on T1 — prefer env for parity with ZERO_EDIT_ROOT). Assert exit codes + stderr contains rule tags. Prefer **no** illegal sources under live packages/apps. Exit non-zero if any case fails. |
| File path | `scripts/test-import-boundaries.sh` |
| Code snippet | `set -euo pipefail`; mktemp -d; trap cleanup; `IMPORT_BOUNDARY_ROOT=… bun run scripts/check-import-boundaries.ts` |
| Verify | `bash scripts/test-import-boundaries.sh` |
| Expected | all cases PASS; exit 0 |
| Time | 18 min |
| `[P]` | N (depends T1+T2) |
| Agent | backend-dev |
| Agent instance | backend-dev-A |
| Subject | harness |
| Spec trace | SC2–SC6 · U5 |
| Slice | V2 |
| Phase | GREEN |
| Difficulty | 4 |

#### T4 — package.json wire

| Field | Value |
|-------|-------|
| Description | Add `"import-boundary": "bun run scripts/check-import-boundaries.ts"` and `"test:import-boundary": "bash scripts/test-import-boundaries.sh"`. Append both into `validate:full` after `banlist` (or next to extract/zero-edit): `&& bun run import-boundary && bun run test:import-boundary`. Update lefthook pre-push comment listing stages if present. Light `validate` script need not include. |
| File path | `package.json` |
| Code snippet | scripts keys only |
| Verify | `node -e "const p=require('./package.json'); if(!p.scripts['import-boundary']\|\|!p.scripts['test:import-boundary']\|\|!p.scripts['validate:full'].includes('import-boundary')\|\|!p.scripts['validate:full'].includes('test:import-boundary')) process.exit(1)"` |
| Expected | both scripts + validate:full chain |
| Time | 4 min |
| `[P]` | N (depends T3) |
| Agent | devops |
| Agent instance | devops-A |
| Subject | package |
| Spec trace | SC7 · U3 · U4 |
| Slice | V2 |
| Phase | GREEN |
| Difficulty | 1 |

### Slice V3 — CP-IMPORT docs

#### T5 — testing.md CP-IMPORT

| Field | Value |
|-------|-------|
| Description | Add **CP-IMPORT** row to critical path inventory in `docs/testing.md` (after CP-DENY or near arch scripts). Add Proves / Does not prove per spec normative draft (static R1–R4 after exemptions; not runtime DI / non-literal dynamic / full alias / product graphs / R5 / test-only edges). Paths: `bun run import-boundary` · `scripts/check-import-boundaries.ts` · `bun run test:import-boundary`. |
| File path | `docs/testing.md` |
| Code snippet | inventory table row + honesty row |
| Verify | `grep -n 'CP-IMPORT' docs/testing.md` |
| Expected | inventory + Proves/Does not prove |
| Time | 6 min |
| `[P]` | N |
| Agent | doc-writer |
| Agent instance | doc-writer-A |
| Subject | testing |
| Spec trace | SC8 · U6 |
| Slice | V3 |
| Phase | GREEN |
| Difficulty | 1 |

### RED-GATE

#### T6 — Full gate verify

| Field | Value |
|-------|-------|
| Description | Run `bun run import-boundary` (exit 0), `bun run test:import-boundary` (exit 0), and confirm `validate:full` includes both (string check or dry subset). Optionally run full `validate:full` if time allows; minimum = import-boundary + test:import-boundary green + package.json chain. |
| File path | — (verify only) |
| Code snippet | — |
| Verify | `bun run import-boundary && bun run test:import-boundary` |
| Expected | both exit 0; SC1–SC8 evidence |
| Time | 8 min |
| `[P]` | N |
| Agent | tester |
| Agent instance | tester-A |
| Subject | verify |
| Spec trace | SC1–SC8 · SC11 |
| Slice | V1–V3 |
| Phase | RED-GATE |
| Difficulty | 2 |

## Task Seeding Blueprint

<!-- Used by /implement to seed TaskCreate calls on session start.
     Format: T{n} | agent-instance | blockedBy | subject -->

### Wave 1 — no deps, backend-dev-A sequential

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T1 | backend-dev-A | — | scanner |
| T2 | backend-dev-A | T1 | exemptions |
| T3 | backend-dev-A | T1,T2 | harness |

### Wave 2 — after Wave 1

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T4 | devops-A | T3 | package |

### Wave 3 — after Wave 2

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T5 | doc-writer-A | T4 | testing |

### Wave 4 — after Wave 3

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T6 | tester-A | T5 | verify |

## Task IDs

<!-- Generated by /plan. Used by /implement to resume tasks on session restart. -->
- T1: 69-T1 — scanner
- T2: 69-T2 — exemptions
- T3: 69-T3 — harness
- T4: 69-T4 — package
- T5: 69-T5 — testing
- T6: 69-T6 — verify

## Ref patterns

| Pattern | Path |
|---------|------|
| Bun CLI ROOT | `scripts/check-env-sync.ts` |
| Arch walk exclusions | `scripts/check-banned-strings.sh` |
| Temp harness + validate:full | `scripts/test-deny-upstream.sh` |
| Exemptions culture | `tools/file_exemptions.txt` |
| Prior F-lite plan shape | `artifacts/plans/57-group-c-deny-upstream-multi-hop-plan.md` |
