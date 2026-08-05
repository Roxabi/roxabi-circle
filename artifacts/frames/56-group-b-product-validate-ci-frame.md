---
title: "Group B — product-validate/CI templates (no dual-edit kit coverage)"
issue: 56
status: approved
tier: F-lite
date: 2026-08-02
parent: 54
---

## Problem

Product apps under `apps/<product>-*` have **no first-class machine path** for typecheck / test / build without dual-editing protected kit scripts (`scripts/test-coverage.sh`, root `package.json`, `lefthook.yml`, kit `ci.yml`). Kit `validate:full` is a **kit bar only** — it can stay green while product apps are untyped, untested, or unbuilt (**false green**).

Contract prose already sketches an “optional product CI” pattern, but there are **no copyable templates** under `docs/templates/`, and playbook / testing DoD do not **require** product-validate once product apps exist. Engineers invent paths, patch kit coverage, or skip product gates.

Group B (child of #54) ships **templates + docs honesty + recommended DoD** so products wire CI by **copy** into zero-edit-allowed paths — never by dual-editing kit gates.

## Who

- **Primary:** GOSILEX engineer with a product repo (`apps/<product>-*`) who needs typecheck/test/build in CI without touching kit scripts
- **Secondary:** Reviewers enforcing zero-edit; authors of Groups A (playbook narrative) and C (deny-upstream) who link this machine path

## Constraints

- Templates live under `docs/templates/` only — **never** as live workflows under `.github/workflows/` in the kit (GH executes all YAML there)
- Product wires by **copy** into allowed paths: `scripts/product/`, `.github/workflows/product-*.yml`, or `apps/<product>-*/scripts/`
- Bare kit `validate:full` must stay green (no product package filter hardwired into kit CI)
- Zero product-specific package names in kit scripts
- Docs honesty: `validate:full` = kit bar; product bar = product-validate / product-ci
- Optional same-PR or follow-up: generic discovery in `test-coverage.sh` (exclude `example-*` / `mcp-example`, no product names)
- Optional: document calling `scripts/product/validate.sh` when present (allowed under zero-edit)

## Out of Scope

- Hardcoding product package names (`@roxabi/*`, etc.) into kit scripts
- Dual-editing kit `ci.yml` / `test-coverage.sh` per product
- Full Group A playbook rewrite (sibling — may **link** templates only)
- deny-upstream multi-hop (Group C)
- Making kit CI fail when product apps are absent

## Premise Validity

**Success in 6 months:** ≥1 product with `apps/<product>-*` runs product-validate (typecheck/test/build) via **copied** templates; bare kit `validate:full` still green; zero dual-edit of kit coverage / kit CI for product packages.

**Failure in 6 months:** Within 6 months of merge, ≥1 product with real `apps/<product>-*` still treats kit `validate:full` as “product tested” (no product-ci workflow), **or** dual-edits `test-coverage.sh` / kit `ci.yml` for product packages.

**Simplest alternative:** Keep optional product-CI prose in the contract without copyable templates.
**Why not simplest:** Products invent paths, dual-edit kit CI, or skip product gates — templates + DoD make the machine path frictionless and enforceable in review.

## Complexity

**Tier: F-lite** — clear docs/templates domain, single concern (product quality gates without dual-edit); optional coverage discovery is small and same-domain.

Signals:

- Single domain: docs + copyable shell/yml templates
- Preferred files: `docs/templates/product-validate.example.sh`, `docs/templates/product-ci.example.yml`, playbook gates, contract product-CI §, `docs/testing.md` gate table
- Optional: `scripts/test-coverage.sh` generic discovery (no product names)
- No new packages, bindings, or runtime auth
- Parent #54 already scoped work item 2 + docs honesty
