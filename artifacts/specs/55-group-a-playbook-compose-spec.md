---
title: "Group A — playbook compose + foreign-org CI + env:check honesty + deploy checklist"
issue: 55
status: approved
tier: F-lite
date: 2026-08-01
parent: 54
frame: artifacts/frames/55-group-a-playbook-compose-frame.md
---

## Context

- **Source:** approved frame `artifacts/frames/55-group-a-playbook-compose-frame.md` (analyze skipped, F-lite)
- **Parent:** #54 Group A — Docs & consumer contract
- **Drift absorbed:** post-issue rename `GOSILEX_CI_APP_*` → **`CI_APP_ID` / `CI_APP_PRIVATE_KEY`** (`75a6096`); docs teach live names only
- **Promoted-from:** frame + issue #55 body (work items 6 / 4 / 3A / 7)

## Goal

An engineer who reads **only** the product start playbook (plus linked contract/CI docs) bootstraps a product on the **compose `@gosilex/*` spine**, configures foreign-org CI with **`CI_APP_*`**, and never mistakes kit `env:check` for product-wide env validation or ships `ENVIRONMENT=development`.

## Users

| Role | Need |
|------|------|
| Product eng (greenfield) | Correct default architecture (compose, not bare Worker / not full SaaS clone) |
| Foreign-org eng/ops | Same secret **names**, own GitHub App, evaluate-only until set |
| Reviewer / dogfood | Honest gate docs (CP-ENV example-only) |

## Expected Behavior

1. **Day 0 — open playbook** → first architecture section says: compose packages into a new app (Hono `createApp`, `@gosilex/core`, …); links ADR-0001 axis test.
2. **Opt-in SaaS** → multi-tenant BA / RBAC / feedback described as **opt-in only if** the product is multi-tenant SaaS — not default.
3. **`cp -R example-*`** → labeled **last resort** with an explicit strip list (names, wrangler, routes); never presented as the happy path.
4. **Foreign org** → checklist: create org-local App → map PEM/ID to **`CI_APP_ID`** + **`CI_APP_PRIVATE_KEY`** → merge-on-green evaluate-only until set; no App install steps in this repo.
5. **env:check** → playbook + `docs/testing.md` CP-ENV + script header: kit check covers **`apps/example-api` schema ↔ examples only**; product owns its env inventory later.
6. **Before first deploy** → checklist: never ship `ENVIRONMENT=development`; BA/session secrets via CF secrets; CORS not localhost.

## Data Model & Consumers

Docs domain — “entities” are narrative contracts, not DB tables.

**Data structure:** [Doc surfaces layered model](../visuals/55-group-a-playbook-compose-data-model.html)  
**Consumer map:** [Who reads what](../visuals/55-group-a-playbook-compose-consumers.html)

| Consumer | Facts consumed | When | Status |
|----------|----------------|------|--------|
| Product eng | compose default, strip list, deploy checklist | day-0 bootstrap | this issue |
| Foreign-org ops | `CI_APP_ID`, `CI_APP_PRIVATE_KEY`, own App | first product on foreign org | this issue |
| Reviewer | env:check = example-api only | PR / dogfood | this issue |
| Group B author | product env inventory ownership | after Group A | future |

## Breadboard

### U — User affordances (doc sections)

| ID | Affordance | Handler (file) | Data / fact |
|----|------------|----------------|-------------|
| U1 | “Default: compose spine” section | `docs/playbooks/start-product.md` | ADR-0001 link; Hono `createApp`; `@gosilex/*` |
| U2 | “Not bare Worker / not full SaaS clone” callouts | same | Anti-pattern list |
| U3 | Opt-in multi-tenant modules | same | BA / RBAC / feedback flags as optional |
| U4 | Last-resort `cp -R` + strip list | same | rename package/wrangler/routes; never push renames upstream |
| U5 | Foreign-org CI checklist | playbook + `docs/product-consumer-contract.md` + `docs/gosilex-ci-app-setup.md` | `CI_APP_ID` / `CI_APP_PRIVATE_KEY` |
| U6 | env:check honesty | playbook + `docs/testing.md` + `scripts/check-env-sync.ts` header | example-api only |
| U7 | Before first deploy checklist | playbook | ENVIRONMENT, CF secrets, CORS |

### N — Narrative nodes

| ID | Node | Role |
|----|------|------|
| N1 | Playbook | Primary bootstrap SSoT |
| N2 | Consumer contract | Zero-edit + config-without-fork + foreign-org |
| N3 | CI app setup | App → `CI_APP_*` mapping |
| N4 | testing.md CP-ENV | Gate honesty |
| N5 | ADR-0001 | Axis authority (read-only) |

### S — System edges

| From | To | Edge |
|------|-----|------|
| U1–U4,U7 | N1 | authored in playbook rewrite |
| U5 | N1,N2,N3 | cross-link; names consistent |
| U6 | N1,N4 + script header | consistent wording |
| N1 | N5 | link only (no ADR edit) |

## Slices

| Slice | Demo | Affordance IDs | Notes |
|-------|------|----------------|-------|
| **S1 — Compose spine playbook** | Engineer opens playbook → chooses compose default; sees ADR-0001; `cp -R` is last-resort | U1–U4 | Core rewrite of `start-product.md` architecture section |
| **S2 — Foreign-org CI_APP_*** | Foreign-org checklist uses only `CI_APP_*`; contract + CI setup aligned | U5 | No obsolete `GOSILEX_CI_APP_*` as primary |
| **S3 — env:check + deploy honesty** | CP-ENV + playbook + header say example-only; deploy checklist present | U6–U7 | Optional one-line script header tighten |

Vertical order: **S1 → S2 → S3** (single PR may ship all three; order = authoring dependency).

## Edge cases

| Case | Handling |
|------|----------|
| Reader has only playbook, never opens ADR | Playbook must still state compose default + axis test in prose + link |
| `GOSILEX_CI_*` leftover in playbook §4 | Replace with `CI_APP_*` (known drift in current file) |
| Product already forked examples | Strip list still applies; no runtime migration |
| Kit mode vs product mode env:check | Document that product-validate is **future** (Group B); do not claim it exists |

## Success Criteria

- [ ] SC1: Playbook default path is **compose `@gosilex/*` spine** (Hono `createApp` / core packages), not bare `ExportedHandler` dual stack
- [ ] SC2: Playbook does **not** present full SaaS clone (`cp -R example-*` without caveats) as the default; last-resort + strip list present
- [ ] SC3: Playbook links **ADR-0001** and states the axis test in prose
- [ ] SC4: Multi-tenant BA/RBAC/feedback described as **opt-in** for multi-tenant SaaS only
- [ ] SC5: Foreign-org section (playbook and/or contract + CI setup) uses **`CI_APP_ID` / `CI_APP_PRIVATE_KEY`** as primary names
- [ ] SC6: No playbook/contract/CI-setup doc teaches obsolete **`GOSILEX_CI_APP_*` as primary**
- [ ] SC7: `env:check` documented as **example-api only** in playbook, `docs/testing.md` CP-ENV, and script header
- [ ] SC8: Deploy checklist covers: never `ENVIRONMENT=development` in ship path; CF secrets for BA/session; CORS not localhost
- [ ] SC9: No product package names hardwired into kit scripts by this PR
- [ ] SC10: `validate:full` green after docs-only change

## Out of Scope

- Group B: product CI templates / coverage discovery / product-validate
- Group C: deny-upstream multi-hop code
- Runtime wrangler / merge-on-green code changes
- Installing GitHub Apps in any org from this issue
- Biome batch (unless trivial piggyback)

## Files (expected touch set)

| Path | Change |
|------|--------|
| `docs/playbooks/start-product.md` | Major rewrite — compose default, foreign-org, env, deploy |
| `docs/product-consumer-contract.md` | Foreign-org `CI_APP_*` section; align any lagging names |
| `docs/gosilex-ci-app-setup.md` | Foreign-org checklist if missing; names already `CI_APP_*` |
| `docs/testing.md` | CP-ENV honesty (example-only) |
| `scripts/check-env-sync.ts` | Header comment only (optional tighten) |

## Pre-check

| Check | Result |
|-------|--------|
| Testable criteria | PASS — SC1–SC10 binary |
| No dangling breadboard IDs | PASS — U1–U7 in S1–S3 |
| Ambiguity budget | PASS — 0 χ |
| Slice coverage | PASS |
| Edge completeness | PASS |

## Expert review (inline, docs-only)

| Reviewer lens | Verdict | Notes |
|---------------|---------|-------|
| architect | good | Axis = ADR-0001 link only; no package boundary change |
| doc-writer | good | Playbook is single narrative SSoT; sidecars are doc-surface maps |
| product-lead | good | Acceptance matches issue; Groups B/C deferred cleanly |
| devops | good | CI names match live workflows; evaluate-only until set documented |

Unresolved expert concerns: none.
