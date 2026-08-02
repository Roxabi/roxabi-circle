---
title: "Plan: Group C — deny-upstream multi-hop + CP-DENY tests"
issue: 57
spec: artifacts/specs/57-group-c-deny-upstream-multi-hop-spec.md
complexity: 4/10
tier: F-lite
generated: 2026-08-02
status: approved
---

## Summary

Extend `scripts/deny-upstream-push.sh` for multi-hop bounce (REPO_ROOT policy union: builtin + optional kit JSON + product JSON + env), prove with **CP-DENY** temp-repo harness wired into `validate:full`, and document bounce topology on **both** contract and playbook. Single PR · S1→S2→S3.

## Architecture

**Data flow:** [Deny decision flow](../visuals/57-group-c-deny-upstream-multi-hop-data-flow.html)  
**File map:** [Files × tasks](../visuals/57-group-c-deny-upstream-multi-hop-file-map.html)

## Bootstrap Context

- Worktree: `.claude/worktrees/57-group-c-deny-upstream-multi-hop`
- Branch: `feat/57-group-c-deny-upstream-multi-hop`
- Frame + spec approved on branch
- Current script: name=`upstream` + URL `*silex-boilerplate*` only; kit origin no-op
- Patterns: `scripts/dogfood-zero-edit.sh` (temp product clone + remote rename), `scripts/check-zero-edit-zones.sh` (ROOT + Bun/JSON family)
- Zero-edit free product path: `docs/product/deny-upstream.json`
- Fixture chassis slug: `private-chassis-fixture` (never real product names)
- Lefthook call shape **unchanged**: `bash scripts/deny-upstream-push.sh {1} {2}`

## Agents

| Agent | Instance | Tasks | Files |
|-------|----------|-------|-------|
| backend-dev | backend-dev-A | T1–T3 | deny script, harness, package.json |
| doc-writer | doc-writer-A | T4–T6 | testing.md, contract, playbook |
| tester | tester-A | T7 | RED-GATE verify |

## Wave Structure

3 waves, max 1 parallel agent (sequential deps). Elapsed ~1 session.

| Wave | Trigger | Agents | Tasks |
|------|---------|--------|-------|
| 1 | start | backend-dev-A | T1 → T2 → T3 |
| 2 | Wave 1 done | doc-writer-A | T4 → T5 → T6 |
| 3 | Wave 2 done | tester-A | T7 (RED-GATE) |

### Budget — per task

| Task | Items | Class | Est. ops | Split? |
|------|-------|-------|----------|--------|
| T1 | script rewrite | judgmental | 6 | — |
| T2 | harness + fixtures | judgmental | 8 | — |
| T3 | package.json | trivial | 2 | — |
| T4 | testing.md CP-DENY | bounded | 2 | — |
| T5 | contract remotes | bounded | 3 | — |
| T6 | playbook §2 | bounded | 3 | — |
| T7 | RED-GATE | bounded | 4 | — |

**Total estimated ops: ~28**

### Budget — per agent instance

| Instance | Tasks | Σ ops | Subjects | Split? |
|----------|-------|-------|----------|--------|
| backend-dev-A | T1–T3 | 16 | deny, harness, package | — |
| doc-writer-A | T4–T6 | 8 | testing, contract, playbook | — |
| tester-A | T7 | 4 | verify | — |

## Consistency Report

| | |
|--|--|
| Covered SC | SC1–SC11 via T1–T7 |
| Uncovered | none |
| Untraced tasks | none |
| Exemptions | optional kit `config/deny-upstream-remotes.json` file may stay uncommitted (reader only); dogfood optional smoke not required |

## Micro-Tasks

### Slice S1 — Multi-hop deny + config/env

#### T1 — Extend deny-upstream-push.sh

| Field | Value |
|-------|-------|
| Description | Rewrite `scripts/deny-upstream-push.sh`: (1) `REPO_ROOT=$(git rev-parse --show-toplevel)`; (2) kit no-op if origin contains `silex-boilerplate`; (3) build substrings union: builtin `silex-boilerplate` ∪ optional `config/deny-upstream-remotes.json` ∪ optional `docs/product/deny-upstream.json` ∪ env `DENY_UPSTREAM_URL_SUBSTRINGS` (comma-split, trim, drop empty); (4) Bun to parse JSON (`bun -e` / one-liner) — missing=empty, invalid=warn once+ignore; (5) deny if `remote_name==upstream` OR any substring case-sensitive match in remote_url; (6) generic deny stderr (parent/kit remote, not kit-only copy). Paths relative to REPO_ROOT. No chassis hardcodes. |
| File path | `scripts/deny-upstream-push.sh` |
| Code snippet | Keep `set -euo pipefail`; lefthook args `$1` `$2` unchanged |
| Verify | `bash -n scripts/deny-upstream-push.sh` |
| Expected | syntax OK; script still executable |
| Time | 12 min |
| `[P]` | N |
| Agent | backend-dev |
| Agent instance | backend-dev-A |
| Subject | deny |
| Spec trace | SC1–SC6 · SC10 · U1–U5 · S1 |
| Slice | S1 |
| Phase | GREEN |
| Difficulty | 4 |

### Slice S2 — CP-DENY harness + gate

#### T2 — test-deny-upstream.sh harness

| Field | Value |
|-------|-------|
| Description | Create `scripts/test-deny-upstream.sh` with temp git fixtures (pattern from dogfood self-sim: product origin must NOT contain `silex-boilerplate`). Run 6-row matrix from spec: (1) kit origin + name upstream → 0; (2) product + name upstream → 1; (3) product + kit URL → 1; (4) product + env `private-chassis-fixture` only → 1; (5) product + docs/product/deny-upstream.json only → 1; (6) product innocent → 0. Invoke `deny-upstream-push.sh` with explicit name/URL args from fixture cwd/REPO_ROOT. Weaken probe: assert row 2 depends on name check (e.g. subshell mutation or dedicated negative). Exit non-zero on any miss. |
| File path | `scripts/test-deny-upstream.sh` |
| Code snippet | `set -euo pipefail`; mktemp -d; trap cleanup |
| Verify | `bash scripts/test-deny-upstream.sh` |
| Expected | all rows PASS; exit 0 |
| Time | 15 min |
| `[P]` | N (depends T1) |
| Agent | backend-dev |
| Agent instance | backend-dev-A |
| Subject | harness |
| Spec trace | SC7 · U6 · S2 |
| Slice | S2 |
| Phase | GREEN |
| Difficulty | 4 |

#### T3 — package.json wire

| Field | Value |
|-------|-------|
| Description | Add `"test:deny-upstream": "bash scripts/test-deny-upstream.sh"`. Append `&& bun run test:deny-upstream` to `validate:full` (after a cheap gate, e.g. near zero-edit or smoke — prefer after `zero-edit` / before heavy coverage if length matters; any stable slot OK if always runs). |
| File path | `package.json` |
| Code snippet | scripts keys only |
| Verify | `node -e "const p=require('./package.json'); if(!p.scripts['test:deny-upstream']) process.exit(1); if(!p.scripts['validate:full'].includes('test:deny-upstream')) process.exit(1)"` |
| Expected | both present |
| Time | 3 min |
| `[P]` | N (depends T2) |
| Agent | backend-dev |
| Agent instance | backend-dev-A |
| Subject | package |
| Spec trace | SC11 · U7 · S2 |
| Slice | S2 |
| Phase | GREEN |
| Difficulty | 1 |

### Slice S3 — Docs honesty

#### T4 — CP-DENY in testing.md

| Field | Value |
|-------|-------|
| Description | Add **CP-DENY** row to critical path inventory in `docs/testing.md`: claim (multi-hop deny + kit no-op + product extend) + path `scripts/test-deny-upstream.sh` / `bun run test:deny-upstream`. Match existing CP-\* table shape. |
| File path | `docs/testing.md` |
| Code snippet | table row after CP-ZERO-EDIT or near scripts gates |
| Verify | `grep -n 'CP-DENY' docs/testing.md` |
| Expected | row present with harness path |
| Time | 4 min |
| `[P]` | Y (docs, after code paths exist) |
| Agent | doc-writer |
| Agent instance | doc-writer-A |
| Subject | testing |
| Spec trace | SC8 · U8 · S3 |
| Slice | S3 |
| Phase | GREEN |
| Difficulty | 1 |

#### T5 — Contract bounce remotes + product JSON

| Field | Value |
|-------|-------|
| Description | Update `docs/product-consumer-contract.md` remotes / deny section: bounce topology (`origin`=product, `upstream`=immediate parent, `pushUrl=no_push`); multi-hop extension via `DENY_UPSTREAM_URL_SUBSTRINGS` and `docs/product/deny-upstream.json`; client-side honesty (`LEFTHOOK=0` / `--no-verify`; real integrity = GH ACLs); list `docs/product/deny-upstream.json` under optional product files next to kit-baseline / exceptions. Prefer repo-unique substrings. |
| File path | `docs/product-consumer-contract.md` |
| Code snippet | extend existing deny-upstream paragraph + optional files list |
| Verify | `grep -nE 'deny-upstream|DENY_UPSTREAM|multi-hop|docs/product/deny-upstream' docs/product-consumer-contract.md` |
| Expected | multi-hop + product JSON + honesty |
| Time | 6 min |
| `[P]` | N |
| Agent | doc-writer |
| Agent instance | doc-writer-A |
| Subject | contract |
| Spec trace | SC9 · U9 · S3 |
| Slice | S3 |
| Phase | GREEN |
| Difficulty | 2 |

#### T6 — Playbook §2 multi-hop recipe

| Field | Value |
|-------|-------|
| Description | Update `docs/playbooks/start-product.md` §2 (Deny push kit) and remotes setup: bounce topology; multi-hop recipe (env + product JSON example with placeholder chassis slug); client-side limitation + ACL note; misconfigured origin=kit stays no-op. Link contract. Do not revert Group A compose narrative. |
| File path | `docs/playbooks/start-product.md` |
| Code snippet | expand §2; optional env example block |
| Verify | `grep -nE 'deny-upstream|DENY_UPSTREAM|multi-hop|pushUrl|no_push|chassis' docs/playbooks/start-product.md` |
| Expected | recipe + honesty present |
| Time | 6 min |
| `[P]` | N |
| Agent | doc-writer |
| Agent instance | doc-writer-A |
| Subject | playbook |
| Spec trace | SC9 · U9 · S3 |
| Slice | S3 |
| Phase | GREEN |
| Difficulty | 2 |

### RED-GATE

#### T7 — Verify SC1–SC11 + validate:full

| Field | Value |
|-------|-------|
| Description | Run `bun run test:deny-upstream` (must pass). Grep SC8/SC9 signals in docs. Confirm no real product chassis names in kit script defaults. Confirm lefthook still calls deny script. Run `bun run validate:full` green. |
| File path | (verification) |
| Code snippet | n/a |
| Verify | See commands below |
| Expected | harness + greps + validate:full exit 0 |
| Time | 12 min |
| `[P]` | N |
| Agent | tester |
| Agent instance | tester-A |
| Subject | verify |
| Spec trace | SC1–SC11 · S1–S3 |
| Slice | RED-GATE |
| Phase | RED-GATE |
| Difficulty | 2 |

```bash
bun run test:deny-upstream
grep -n 'CP-DENY' docs/testing.md
grep -nE 'DENY_UPSTREAM|docs/product/deny-upstream' docs/product-consumer-contract.md docs/playbooks/start-product.md
grep -n 'deny-upstream-push' lefthook.yml
# no real chassis hardcodes:
! grep -E 'roxabi-cf-template' scripts/deny-upstream-push.sh
bun run validate:full
```

## Task Seeding Blueprint

<!-- Used by /implement to seed TaskCreate calls on session start.
     Format: T{n} | agent-instance | blockedBy | subject -->

### Wave 1 — no deps chain, backend-dev-A

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T1 | backend-dev-A | — | deny |
| T2 | backend-dev-A | T1 | harness |
| T3 | backend-dev-A | T2 | package |

### Wave 2 — after Wave 1, doc-writer-A

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T4 | doc-writer-A | T3 | testing |
| T5 | doc-writer-A | T3 | contract |
| T6 | doc-writer-A | T5 | playbook |

### Wave 3 — after Wave 2, tester-A

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T7 | tester-A | T4,T5,T6 | verify |

## Task IDs

<!-- Generated by /plan. Used by /implement to resume tasks on session restart. -->
- T1: plan-57-t1 — deny
- T2: plan-57-t2 — harness
- T3: plan-57-t3 — package
- T4: plan-57-t4 — testing
- T5: plan-57-t5 — contract
- T6: plan-57-t6 — playbook
- T7: plan-57-t7 — verify
