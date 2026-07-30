---
title: "B2 — HMAC cut / Better Auth only — technical analysis"
issue: 14
spark: 115
status: draft
date: 2026-07-30
adr: docs/architecture/adr/0002-session-hmac-interim-vs-better-auth.md
supersedes: artifacts/analyses/14-epic-b2-auth-ba-default-analysis.md
---

# Analysis #14 — Epic B2 · HMAC cut · Better Auth only

## Source

GitHub [#14](https://github.com/go-silex/silex-boilerplate/issues/14) · Spark **#115**  
**Decision (2026-07-30):** no upstream product consumers → **retire HMAC session path entirely** (not “BA default + HMAC compat”).

## Problem

1. Dual session stacks (HMAC + BA) double seeds, login UIs, tests, and docs lies.
2. Multi-tenant (ADR-0003) is BA-only; HMAC path cannot dogfood orgs/RBAC/modules.
3. Option A (unset → hmac) was for mid-migrate products — **none exist**.

## Outcome

- Browser sessions = **Better Auth only** (ADR-0002 amend 2026-07-30).
- Dual-path **cookie session \| Bearer `sk_`** unchanged.
- Green suite without HMAC login/session ports.
- Clone dogfoods multi-tenant on BA without adapter switch.

## Appetite

**M** — delete/disable HMAC surface, migrate example seed/docs/tests, amend ADR (done in docs wave).

## Shape (only)

**Shape Cut — BA-only**

| Change | Action |
|---|---|
| `AUTH_SESSION_ADAPTER` | Remove from env schema / docs / health |
| `createHmacSessionPort` | Remove from public `@gosilex/auth` exports |
| HMAC login routes | Delete |
| Seed | BA tenancy personas only; no dual `demo@` HMAC-only path as primary |
| Tests | Drop HMAC matrix; keep BA + sk_ dual-path + org IDOR |
| Docs | Quick Start BA-only; CHANGELOG breaking note for future consumers |

**Rejected:** Option A/B dual-default (superseded by no-upstream decision).

## Risks

| Risk | Mitigation |
|---|---|
| Residual HMAC imports | banlist / typecheck / package export clean |
| Seed incomplete for BA | fail-loud tenancy seed + print creds |
| Token logs on reset | owned by CF Email + B3 redaction |
| Product later wants HMAC | **won’t support** — document in ADR |

## Files impacted (implement later)

- `packages/auth/src/*` (session HMAC, index exports)
- `apps/example-api` env, auth routes, seed, health, tests
- `apps/example-web` login, messages, prefill
- README / AGENTS (B1 may absorb narrative)
- `.dev.vars.example`

## Open Qs (non-blocking for docs)

- One-release soft deprecation throw vs hard delete in single PR — prefer **hard delete** (no consumers).
