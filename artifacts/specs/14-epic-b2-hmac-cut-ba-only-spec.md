---
title: "Spec — B2 HMAC cut / Better Auth only"
issue: 14
spark: 115
status: approved
tier: M
date: 2026-07-30
analysis: artifacts/analyses/14-epic-b2-hmac-cut-ba-only-analysis.md
adr: docs/architecture/adr/0002-session-hmac-interim-vs-better-auth.md
shape: cut-ba-only
---

# Spec #14 — Epic B2 · HMAC cut · Better Auth only

## Goal

Retire the HMAC browser session path. Kit and examples use **Better Auth only** for cookies; keep **Bearer `sk_`** dual-path. Align code, env, seed, tests, and docs with [ADR-0002](../../docs/architecture/adr/0002-session-hmac-interim-vs-better-auth.md) (amended 2026-07-30).

## Non-goals

| Out | Owner |
|---|---|
| OAuth GitHub | Later epic |
| Invites / A4 shells / reset UX | **B3** #15 |
| CF Email transport | **Email epic** (ADR-0004) |
| RBAC Phase B | **RBAC B epic** |
| Removing `sk_` dual-path | Never (MCP/machine) |

## Expected behavior

1. App boots only with BA session wiring (no `AUTH_SESSION_ADAPTER`).
2. Login = BA sign-in only; HMAC `POST /api/auth/login` **gone** (404 or absent).
3. `requireAuth` resolves session via BA `SessionPort` **or** Bearer `sk_`.
4. Org/RBAC/modules work on default local path after migrate+seed.
5. Health reports session stack as Better Auth (no hmac adapter field, or fixed `better-auth`).
6. `validate:full` green with HMAC tests removed/replaced.

## Env contract (normative)

```bash
ENVIRONMENT=development
BETTER_AUTH_SECRET=…   # min 32; no kit placeholder in staging/prod
BETTER_AUTH_URL=http://localhost:8787
SESSION_SECRET=…       # only if still required by residual helpers — prefer drop if unused
# AUTH_SESSION_ADAPTER  # REMOVED — do not set
```

Fail-closed: missing/short `BETTER_AUTH_SECRET` outside test mocks.

## DoD

- [ ] ADR-0002 amend merged (docs)
- [ ] No public HMAC session API in `@gosilex/auth`
- [ ] example-api/web login + seed BA-only
- [ ] No tests requiring `AUTH_SESSION_ADAPTER=hmac`
- [ ] README Quick Start BA-only + tenancy creds
- [ ] `bun run validate:full` green
- [ ] CHANGELOG / release note: breaking — HMAC removed

## Slices (implement)

| Slice | Content |
|---|---|
| S1 | Package auth: remove HMAC port/exports; BA-only factories |
| S2 | example-api env/routes/seed/health/tests |
| S3 | example-web login + i18n + remove demo HMAC assumptions |
| S4 | Docs B1 overlap + ban residual `AUTH_SESSION_ADAPTER` strings in kit |

## Status

`draft` until human promote after multi-role review pins absorbed (identity seed fail-loud, no dual demo@ primary).
