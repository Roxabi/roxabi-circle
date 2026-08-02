---
title: "Plan: Group B — product-validate/CI templates (no dual-edit kit coverage)"
issue: 56
spec: artifacts/specs/56-group-b-product-validate-ci-spec.md
complexity: 3/10
tier: F-lite
generated: 2026-08-02
status: approved
---

## Summary

Ship **copyable** product-validate + product-ci templates under `docs/templates/`, and rewrite playbook / contract / testing so kit `validate:full` is documented as **kit bar only** with product-validate **required DoD** when `apps/<product>-*` exists. S3 coverage discovery **parked**. Four micro-tasks (doc-writer + tester RED-GATE); no product package names in kit scripts.

## Architecture

**Data flow:** [Kit templates → product copy → CI](../visuals/56-group-b-product-validate-ci-data-flow.html)  
**File map:** [Files × tasks](../visuals/56-group-b-product-validate-ci-file-map.html)

## Bootstrap Context

- Worktree: `.claude/worktrees/56-group-b-product-validate-ci`
- Branch: `feat/56-group-b-product-validate-ci`
- Frame + spec approved on branch
- Sibling #55 playbook already has compose narrative — **extend** §7/§10, do not revert
- Zero-edit allowed copy targets: `scripts/product/`, `.github/workflows/product-*.yml`, `apps/<product>-*`
- Contract already has optional product-CI prose + inline script shape — promote + link templates

## Agents

| Agent | Instance | Tasks | Files |
|-------|----------|-------|-------|
| doc-writer | doc-writer-A | T1–T3 | templates, playbook, contract, testing.md |
| tester | tester-A | T4 | verify greps + `validate:full` |

## Wave Structure

2 waves, max 1 parallel agent (sequential docs). Elapsed ~1 short session.

| Wave | Trigger | Agents | Tasks |
|------|---------|--------|-------|
| 1 | start | doc-writer-A | T1 → T2 → T3 |
| 2 | Wave 1 done | tester-A | T4 (RED-GATE) |

### Budget — per task

| Task | Items | Class | Est. ops | Split? |
|------|-------|-------|----------|--------|
| T1 | two template files | judgmental | 5 | — |
| T2 | playbook §7 + §10 | bounded | 3 | — |
| T3 | contract + testing.md | bounded | 4 | — |
| T4 | verify SC greps + validate | bounded | 3 | — |

**Total estimated ops: ~15**

### Budget — per agent instance

| Instance | Tasks | Σ ops | Subjects | Split? |
|----------|-------|-------|----------|--------|
| doc-writer-A | T1–T3 | 12 | templates, playbook, contract | — |
| tester-A | T4 | 3 | verify | — |

## Consistency Report

| | |
|--|--|
| Covered SC | SC1–SC9 via T1–T4; SC10 parked (explicit) |
| Uncovered | S3 / SC10 discovery — follow-up only |
| Untraced tasks | none |
| Exemptions | no runtime product tests (templates + docs); bare kit validate is the gate |

## Micro-Tasks

### Slice S1 — Templates

#### T1 — Add product-validate + product-ci templates

| Field | Value |
|-------|-------|
| Description | Create `docs/templates/product-validate.example.sh` (bash, `set -euo pipefail`, ROOT detect, `bun run zero-edit`, placeholder `bun run --filter @gosilex/<product>-api|web` typecheck/test/build) and `docs/templates/product-ci.example.yml` (checkout, setup-bun, frozen install, run validate script path). Header comments: copy targets (`scripts/product/validate.sh` or app-local; `.github/workflows/product-ci.yml`); **never** commit live product-ci into kit `.github/workflows/`. |
| File path | `docs/templates/product-validate.example.sh`, `docs/templates/product-ci.example.yml` |
| Code snippet | Align with contract § Optional product CI shape; use `<product>` placeholders only |
| Verify | `test -f docs/templates/product-validate.example.sh && test -f docs/templates/product-ci.example.yml && ! test -f .github/workflows/product-ci.yml` |
| Expected | both templates exist; no live product-ci workflow in kit |
| Time | 8 min |
| `[P]` | N |
| Agent | doc-writer |
| Agent instance | doc-writer-A |
| Subject | templates |
| Spec trace | SC1–SC3 · U1–U2 · S1 |
| Slice | S1 |
| Phase | GREEN |
| Difficulty | 3 |

### Slice S2 — Docs honesty + DoD

#### T2 — Playbook gates + DoD

| Field | Value |
|-------|-------|
| Description | Update `docs/playbooks/start-product.md` §7 Gates: kit bar (`zero-edit`, `validate:full`) vs **product bar** (`product-validate` after copy); link both templates. §10 DoD: checkbox **required** when `apps/<product>-*` exists — product-validate script + product-ci workflow. Refs table: link templates. Keep Group A compose narrative intact. |
| File path | `docs/playbooks/start-product.md` |
| Code snippet | New subsection under §7; DoD bullet with template paths |
| Verify | `grep -nE 'product-validate|product-ci|kit bar|docs/templates' docs/playbooks/start-product.md` |
| Expected | kit vs product bar language + template links + DoD checkbox |
| Time | 5 min |
| `[P]` | N (depends T1 for link targets) |
| Agent | doc-writer |
| Agent instance | doc-writer-A |
| Subject | playbook |
| Spec trace | SC4–SC5 · U3–U4 · S2 |
| Slice | S2 |
| Phase | GREEN |
| Difficulty | 2 |

#### T3 — Contract recommended DoD + testing.md gate table

| Field | Value |
|-------|-------|
| Description | `docs/product-consumer-contract.md`: promote “Optional product CI” to **recommended DoD when `apps/<product>-*` exists**; link `docs/templates/*`; keep zero dual-edit of kit CI. `docs/testing.md`: gate table / intro distinguish **kit `validate:full`** vs **product product-validate** (copy templates); align `validate` vs `validate:full` messaging if lagging. |
| File path | `docs/product-consumer-contract.md`, `docs/testing.md` |
| Code snippet | Section heading + template links; testing.md table rows |
| Verify | `grep -nE 'product-validate|product-ci|recommended|kit bar|docs/templates' docs/product-consumer-contract.md docs/testing.md` |
| Expected | recommended DoD + kit≠product in both docs |
| Time | 6 min |
| `[P]` | N |
| Agent | doc-writer |
| Agent instance | doc-writer-A |
| Subject | contract |
| Spec trace | SC6–SC7 · U5–U6 · S2 |
| Slice | S2 |
| Phase | GREEN |
| Difficulty | 2 |

### RED-GATE (S1+S2)

#### T4 — Verify SC1–SC9 + validate:full

| Field | Value |
|-------|-------|
| Description | Grep SC1–SC8 signals; confirm no product package names hardwired into kit scripts (templates may use placeholders); confirm no live `.github/workflows/product-*.yml` in kit; run `bun run validate:full` (must stay green). |
| File path | (verification) |
| Code snippet | n/a |
| Verify | See commands below |
| Expected | all greps pass; validate:full exit 0 |
| Time | 10 min |
| `[P]` | N |
| Agent | tester |
| Agent instance | tester-A |
| Subject | verify |
| Spec trace | SC1–SC9 |
| Slice | S1–S2 |
| Phase | RED-GATE |
| Difficulty | 2 |

**T4 verify commands:**

```bash
test -f docs/templates/product-validate.example.sh
test -f docs/templates/product-ci.example.yml
! ls .github/workflows/product-*.yml 2>/dev/null
grep -E 'product-validate|docs/templates' docs/playbooks/start-product.md
grep -E 'product-ci|product-validate|recommended' docs/product-consumer-contract.md
grep -E 'product-validate|kit bar|validate:full' docs/testing.md
# no real product package names in kit scripts (allow <product> placeholders in templates)
! grep -E '@roxabi/|@share/' scripts/*.sh package.json 2>/dev/null || true
bun run validate:full
```

## Task Seeding Blueprint

<!-- Used by /implement to seed TaskCreate calls on session start.
     Format: T{n} | agent-instance | blockedBy | subject -->

### Wave 1 — no deps (sequential on doc-writer-A)

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T1 | doc-writer-A | — | templates |
| T2 | doc-writer-A | T1 | playbook |
| T3 | doc-writer-A | T2 | contract |

### Wave 2 — after Wave 1

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T4 | tester-A | T3 | verify |

## Task IDs

<!-- Filled on plan approval -->
- T1: pending — templates
- T2: pending — playbook
- T3: pending — contract
- T4: pending — verify
