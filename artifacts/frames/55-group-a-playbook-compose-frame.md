---
title: "Group A — playbook compose + foreign-org CI + env:check honesty + deploy checklist"
issue: 55
status: approved
tier: F-lite
date: 2026-08-01
parent: 54
---

## Problem

Product engineers bootstrapping from this kit absorb **false mental models** from the playbook and adjacent docs: they may treat `example-*` as a full SaaS clone target, invent a bare `ExportedHandler` dual stack next to Hono, or assume kit `env:check` validates their product env. Foreign-org consumers also lack a clear contract for merge-on-green credentials after the rename to **`CI_APP_ID` / `CI_APP_PRIVATE_KEY`**.

Group A (child of #54) closes those models **with docs only** — no gate machinery, no product CI templates, no deny-upstream code — so the first product bootstrap narrative is safe before Groups B/C land.

## Who

- **Primary:** GOSILEX engineer starting a greenfield `go-silex/<product>` (or foreign-org product) from this kit via `upstream`
- **Secondary:** Reviewers / ops who set GH App secrets on a new org; future authors of Groups B/C who rely on this narrative

## Constraints

- Docs-only PR; `validate:full` stays green
- Canonical CI secret/var names: **`CI_APP_ID`** (var) + **`CI_APP_PRIVATE_KEY`** (secret) — not `GOSILEX_CI_APP_*` (retired in `75a6096`)
- Zero product package names hardwired into kit scripts
- Link ADR-0001 (compose packages, apps compose) as the axis test
- No GitHub App install performed in this issue
- Out of band of Groups B (product CI templates) and C (deny-upstream multi-hop)

## Out of Scope

- Product CI templates / coverage discovery (Group B)
- `deny-upstream` multi-hop code (Group C)
- Runtime / wrangler / merge-on-green code changes (already fail-closed where needed)
- Biome batch (optional piggyback only if tiny)
- Installing or rotating Apps outside documentation

## Premise Validity

**Success in 6 months:** New product repos bootstrap via the **compose `@gosilex/*` spine** (Hono `createApp`, core packages); engineers do not default to bare Worker dual-stack or full SaaS clone. Foreign-org products use **`CI_APP_*`** with their own App; kit `env:check` is never misread as product-wide env validation.

**Failure in 6 months:** Within 6 months of merge, ≥1 product still (a) copies bare `ExportedHandler` dual stack as the default, **or** (b) ships `ENVIRONMENT=development` to CF, **or** (c) documents `GOSILEX_CI_APP_*` as primary secret names after this PR lands.

**Simplest alternative:** A one-line warning in the root README (“prefer compose, don’t clone examples”).
**Why not simplest:** The playbook is the **only** guided bootstrap path; false models span four surfaces (compose vs clone, foreign-org CI names, env:check ownership, deploy ENVIRONMENT/secrets) and must be rewritten together so an engineer reading **only** the playbook still chooses correctly.

## Complexity

**Tier: F-lite** — clear docs domain, ~4–5 files, no architecture or runtime change; multi-file rewrite warrants plan + review, not analyze/F-full.

Signals:

- Single domain: docs / consumer contract
- Files: `start-product.md`, `product-consumer-contract.md`, `gosilex-ci-app-setup.md`, `testing.md`, optional `check-env-sync.ts` header
- No new packages, bindings, or gates
- Parent #54 code-review map already scoped work items 6 / 4 / 3A / 7
