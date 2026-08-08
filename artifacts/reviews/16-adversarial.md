---
title: "feat(flows) platform module — Adversarial review"
issue: 16
status: review-complete
date: 2026-08-06
subject: "docs/architecture/adr/0005-flows-platform-agentic-workflows.md + issue #16 + conversation locks"
verdict_lean: survives-with-major
---

## Priced claim

The Chemin A kit can ship a Nika-inspired governed-plans platform (`@kit/flows`) on Cloudflare Workflows with `check()`/permits, multi-tenant org-scoped runs, **YAML plans as MVP authoring**, **V0 admin-only** (later all users), dogfood in `example-*` — without forking Nika AGPL or reinventing a durable engine — such that products compose packages instead of inventing Cron+Queue+agent loops (N×M).

## Locked product decisions

| Lock | Decision |
|---|---|
| Authoring | **YAML is MVP**; parse is a trust boundary |
| Permits empty | Absent/empty authority = fail-closed (NEP-0003 spirit) |
| Access V0 | **Org admins only**; later open to all users |
| Ship mode | Imperfect OK if load-bearing controls land early |

## Findings (summary)

| σ | Title | Lens | C |
|---|-------|------|---|
| **fatal** | Plan-embedded permits make `check()` authority-tautological | vacuous-guard | 92% |
| **major** | Pre-run `check` without immutable run snapshot / kill semantics | bypass | 88% |
| **major** | `max_cost` / tokens static proxies ≠ runtime spend (esp. `agent`) | vacuous-guard | 90% |
| **major** | P0 AC omits org scope + admin gate | scope-attack | 86% |
| **major** | `permits.net` / `r2` without enforcement surface | vacuous-guard | 87% |
| **major** | HITL `waitForEvent` lacks principal-binding | bypass | 84% |
| **major** | Promote gate allows package without second call site | scope-attack | 82% |
| **major** | Workflows limits under-specified vs agent graphs | assumption-kill | 80% |
| **minor** | V0 admin vs ADR-0003 module catalogue dual models | assumption-kill | 78% |
| **minor** | Dual-auth `sk_` can execute high-permit plans | bypass | 76% |
| **minor** | YAML MVP without parse safety AC | operational | 74% |

### fatal: self-granted permits

Author writes tasks **and** `permits.tools`. Check verifies subset of registry — ambient authority remains.  
**Fix (normative in ADR):** grants are sole source of power; plan permits only **narrow**; snapshot effective set on run.

### major (selected)

- **TOCTOU:** freeze run snapshot; runner never reloads live plan.  
- **Budgets:** runtime meter or forbid `agent` in V0.  
- **P0 tenancy:** `org_id` + admin gate from day 0.  
- **net/r2:** tools field only until wrappers.  
- **HITL:** app route + signed ticket or D1 decision (not raw instance event).  

## Survivors

- Option C phased packages  
- No Nika binary  
- CF Workflows for linear invoke + HITL with ref I/O  
- Dogfood generic plans  
- Dual-path transport (authz separate)  
- YAML authoring with parse budget  
- Fail-closed empty permits (necessary, not sufficient)  

## Disposition

Do **not** claim Nika-class governance until grant∩plan + snapshot + runtime meter/no-agent + org/admin + HITL principal land. Direction + phased engine is valid.

## Follow-up issues

#27 docs · #28 pure core · #29 D1 · #30 Workflows · #31 API · #32 HITL · #33 UI · #34 authoring · #35 agent meter · #36 net/r2  
