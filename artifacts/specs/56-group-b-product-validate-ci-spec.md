---
title: "Group B — product-validate/CI templates (no dual-edit kit coverage)"
issue: 56
status: approved
tier: F-lite
date: 2026-08-02
parent: 54
frame: artifacts/frames/56-group-b-product-validate-ci-frame.md
approval_note: "S1+S2 in scope; S3 coverage discovery parked (follow-up)"
---

## Context

- **Source:** approved frame `artifacts/frames/56-group-b-product-validate-ci-frame.md` (analyze skipped, F-lite)
- **Parent:** #54 Group B — Product quality gates
- **Sibling:** #55 Group A (playbook compose + env:check honesty) — already landed; playbook §7 still says `validate:full` is “same bar as kit” without a product-validate DoD
- **Promoted-from:** frame + issue #56 body (work item 2 + docs honesty)

## Goal

Product apps under `apps/<product>-*` get a **copyable machine path** (product-validate + product-ci) for typecheck/test/build **without** dual-editing kit coverage or kit CI; docs state clearly that kit `validate:full` ≠ product tested.

## Users

| Role | Need |
|------|------|
| Product eng | Drop-in scripts/workflows under zero-edit-allowed paths |
| Reviewer / dogfood | Enforce product-validate when product apps exist; reject kit dual-edit |
| Kit maintainer | Bare kit `validate:full` stays green; no product names in kit scripts |

## Expected Behavior

1. **Open `docs/templates/`** → finds `product-validate.example.sh` and `product-ci.example.yml` (examples only; not live GH workflows in the kit).
2. **Product eng copies** validate script into `scripts/product/validate.sh` **or** `apps/<product>-api/scripts/product-validate.sh` (both zero-edit-safe shapes documented); copies workflow to `.github/workflows/product-ci.yml`.
3. **Edits placeholders** only in the product copy (`@gosilex/<product>-api` filters, etc.) — never edits kit `ci.yml` / `test-coverage.sh` for product packages.
4. **Playbook §7 Gates** → lists kit bar (`zero-edit`, `validate:full`) **and** product bar (`product-validate` once apps exist); links templates.
5. **Playbook §10 DoD** → checkbox: product-validate / product-ci **required** when `apps/<product>-*` exists.
6. **Contract** → “Optional product CI” promoted to **recommended DoD** when product apps exist; templates linked.
7. **`docs/testing.md`** → gate table: `validate:full` = kit bar only; product bar = product-validate (copy templates).
8. **Bare kit CI** → still green with no product apps; no product package names in kit scripts.
9. **Optional:** `test-coverage.sh` discovers `apps/*` packages excluding `example-*` / `mcp-example` (generic; no hardwired product names) — same PR or follow-up.

## Data Model & Consumers

Docs + template domain — “entities” are gate contracts and copyable files, not DB tables.

**Data structure:** [Product quality gates layered model](../visuals/56-group-b-product-validate-ci-data-model.html)  
**Consumer map:** [Who uses product quality gates](../visuals/56-group-b-product-validate-ci-consumers.html)

| Consumer | Facts consumed | When | Status |
|----------|----------------|------|--------|
| Product eng | template paths, filter placeholders, allowed copy targets | day product apps land | this issue |
| Reviewer | DoD: product-ci required when apps exist; no dual-edit | PR review | this issue |
| Kit CI | unchanged kit bar | every kit PR | frozen |
| Group C | independent | later | future |

## Breadboard

### U — User affordances

| ID | Affordance | Handler (file) | Data / fact |
|----|------------|----------------|-------------|
| U1 | Copyable product-validate shell | `docs/templates/product-validate.example.sh` | `set -euo`; root detect; `zero-edit`; `bun run --filter` typecheck/test/build placeholders |
| U2 | Copyable product-ci workflow | `docs/templates/product-ci.example.yml` | checkout · setup-bun · install · run validate script |
| U3 | Gates section: kit vs product bar | `docs/playbooks/start-product.md` §7 | links U1/U2; `validate:full` = kit only |
| U4 | DoD checkbox product-validate | playbook §10 | required when `apps/<product>-*` exists |
| U5 | Contract product CI DoD | `docs/product-consumer-contract.md` | recommended when apps exist; never dual-edit kit CI |
| U6 | testing.md gate honesty | `docs/testing.md` | table row: kit bar vs product bar |
| U7 | Optional coverage discovery | `scripts/test-coverage.sh` | glob `apps/*` exclude example/mcp-example |

### N — Narrative nodes

| ID | Node | Role |
|----|------|------|
| N1 | Templates dir | Copy sources (kit-owned examples) |
| N2 | Playbook | Bootstrap + DoD |
| N3 | Consumer contract | Zero-edit + product CI policy |
| N4 | testing.md | Gate SSoT table |
| N5 | Kit CI / validate:full | Unchanged kit bar |
| N6 | Product copy paths | `scripts/product/`, `product-*.yml`, `apps/<p>-*/scripts/` |

### S — System edges

| From | To | Edge |
|------|-----|------|
| U1,U2 | N1 | new files in kit |
| U3,U4 | N2 | playbook rewrite §7 + §10 |
| U5 | N3 | promote optional → recommended DoD |
| U6 | N4 | gate table honesty |
| N1 | N6 | eng copies then customizes |
| U7 | N5 | optional; must not break bare kit |
| N6 | product GH Actions | product CI runs product bar |

## Slices

| Slice | Demo | Affordance IDs | Notes |
|-------|------|----------------|-------|
| **S1 — Templates** | `docs/templates/` has both examples; script is executable-shaped; yml not under `.github/workflows/` in kit | U1–U2 | Core deliverable |
| **S2 — Docs honesty + DoD** | Playbook §7/§10, contract, testing.md state kit bar ≠ product bar; product-validate **required** when apps exist | U3–U6 | Depends on S1 paths for links |
| **S3 — Optional coverage discovery** | `test-coverage.sh` runs vitest under non-example `apps/*` if any; bare kit unchanged | U7 | Same PR or park; no product names |

Vertical order: **S1 → S2 → S3(optional)**. Single PR may ship S1+S2; S3 only if cheap and green.

## Edge cases

| Case | Handling |
|------|----------|
| Engineer pastes yml under kit `.github/workflows/` | Templates stay under `docs/templates/`; docs warn never commit live product-ci into kit |
| Product has no apps yet | DoD product-validate **N/A**; kit bar only |
| Product uses package names outside `@gosilex/*` | Template placeholders document rename; filters are product-owned |
| `scripts/product/validate.sh` vs app-local script | Both allowed; template comments show preferred roots |
| Optional S3 finds zero product apps | Discovery is no-op; exit 0 |
| Group A playbook already rewrote §7 | Extend, do not revert compose narrative |

## Success Criteria

- [ ] SC1: `docs/templates/product-validate.example.sh` exists (bash, `set -euo pipefail`, documents copy targets)
- [ ] SC2: `docs/templates/product-ci.example.yml` exists (checkout → bun → product-validate)
- [ ] SC3: Neither template is committed as a **live** workflow under kit `.github/workflows/`
- [ ] SC4: Playbook states kit `validate:full` ≠ product tested; links templates
- [ ] SC5: Playbook DoD: product-validate / product-ci **required** when `apps/<product>-*` exists
- [ ] SC6: Contract promotes product CI from optional prose to **recommended DoD** when product apps exist; links templates
- [ ] SC7: `docs/testing.md` gate table distinguishes kit bar vs product bar
- [ ] SC8: No product-specific package names in kit scripts changed by this PR (placeholders only in templates)
- [ ] SC9: Bare kit `validate:full` still green after the PR
- [ ] SC10: (Optional) coverage discovery runs only generic `apps/*` exclusions — or explicitly parked in plan as follow-up

## Out of Scope

- Hardcoding product package names into kit scripts
- Dual-editing kit `ci.yml` / `test-coverage.sh` per product as the primary path
- Group A full compose rewrite (already shipped; link only)
- Group C deny-upstream multi-hop
- Making kit CI fail when product apps are absent

## Files (expected touch set)

| Path | Change |
|------|--------|
| `docs/templates/product-validate.example.sh` | **new** — copyable validate script |
| `docs/templates/product-ci.example.yml` | **new** — copyable workflow |
| `docs/playbooks/start-product.md` | §7 gates + §10 DoD + refs |
| `docs/product-consumer-contract.md` | product CI § → recommended DoD + template links |
| `docs/testing.md` | gate table honesty |
| `scripts/test-coverage.sh` | optional generic discovery |

## Pre-check

| Check | Result |
|-------|--------|
| Testable criteria | PASS — SC1–SC10 binary (SC10 optional flag explicit) |
| No dangling breadboard IDs | PASS — U1–U7 in S1–S3 |
| Ambiguity budget | PASS — 0 χ |
| Slice coverage | PASS |
| Edge completeness | PASS |

## Expert review (inline, docs/templates domain)

| Reviewer lens | Verdict | Notes |
|---------------|---------|-------|
| architect | good | No package boundary change; templates outside live workflows; zero-edit paths respected |
| doc-writer | good | Single narrative: kit bar vs product bar; DoD checkbox is the enforceability lever |
| product-lead | good | Acceptance matches #56; optional S3 correctly non-blocking |
| devops | good | product-ci shape is standard Actions; bare kit CI unimpacted; warn against committing yml into kit workflows |

Unresolved expert concerns: none.
