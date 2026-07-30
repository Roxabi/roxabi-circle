# Goal 002 — Wave-1 gap list (HMAC cut / BA-only)
# Date: 2026-07-30
# Scope: Wave-1 only (GH #14 / B2) vs Goal 002 D1 + binary exit #2
# Spec SSoT: artifacts/specs/14-epic-b2-hmac-cut-ba-only-spec.md
# NOT: 14-epic-b2-auth-ba-default-* (superseded)

## Goal 002 activation (this pass)
- [x] Goal 002 path: artifacts/goals/002-product-ready-multi-tenant-goal.md status=ready-for-goal
- [x] Goal 001 status=superseded → superseded_by Goal 002
- [x] Live DoD is Goal 002 (not freeze A11/A13/A14 dual HMAC)

## Wave-1 gaps (code/docs still violate BA-only)

### W1-G1 — Public HMAC SessionPort (package)
- packages/auth/src/session-port.ts: createHmacSessionPort + defaultSessionPort = HMAC
- packages/auth/src/index.ts: exports createHmacSessionPort, defaultSessionPort
- packages/auth/src/session.ts: HMAC sign/verify implementation
- packages/auth/src/cookie-name.ts: AuthSessionAdapter = 'hmac' | 'better-auth'
- Goal 002 exit #2 / D1: no public HMAC session path
- Spec #14: remove public HMAC API

### W1-G2 — Dual adapter runtime (example-api)
- apps/example-api/src/lib/session-env.ts: AUTH_SESSION_ADAPTER SSoT; unset → hmac
- apps/example-api/src/env.schema.ts: AUTH_SESSION_ADAPTER optional
- apps/example-api/.dev.vars.example: AUTH_SESSION_ADAPTER=hmac (default)
- apps/example-api/src/routes/auth.ts: dual mount BA vs HMAC login/logout
- apps/example-api/src/lib/require-ba-adapter.ts: org surfaces gate on better-auth adapter
- Spec #14: remove AUTH_SESSION_ADAPTER; BA-only boot

### W1-G3 — Tests encode HMAC as kit default
- packages/auth/src/keys.test.ts: describe SessionPort HMAC; defaultSessionPort is HMAC adapter
- example-api app tests: AUTH_SESSION_ADAPTER=hmac and better-auth matrix (app.test.ts)
- Spec #14: drop HMAC matrix; keep BA + sk_ dual-path tests

### W1-G4 — Live SSoT docs still teach HMAC interim
- AGENTS.md ~190: Sessions UI aujourd'hui = HMAC-signed cookie; BA = M3 future
- AGENTS.md ~211: Interim HMAC volontaire; ne pas inventer Better Auth
- AGENTS.md ~293: @gosilex/auth HMAC session interim
- AGENTS.md ~555: [ ] Better Auth + cookies unchecked
- README.md package map: Session cookie HMAC + sk_
- Goal 002: B1 #13 resync after B2; #14 DoD may touch Quick Start per spec

### W1-G5 — ADR vs code split-brain
- ADR-0002 amended BA-only (docs) — code still dual-adapter
- Implementers must not treat ADR alone as Wave-1 done

## Deferred (NOT Wave-1 — do not plan/implement in #14 mega-plan)

| Item | GH | Why deferred |
|---|---|---|
| B3 shells /admin /app | #15 | After B2 /ship |
| B3 invites + reset UX | #15 | After B2 + email soft-dep |
| CF Email wire | #21 | After B2 |
| B1 full AGENTS resync | #13 | After B2 truth stable (partial docs ok in #14 DoD) |
| B5 consumer dogfood | #17 | After B2+B3 mini |
| RBAC Phase B | #22 | After B2+B3 |
| B4 ops CI | #16 | Companion |
| B6 patterns ×4 | #18 | Companion; not MT spine |
| B7 Playwright/Sentry/CR | #19 | Companion |
| B8 park rest only | #20 | Docs |
| TanStack Start default | — | Non-goal Goal 002 |
| Paraglide monorepo | — | Park DR-B8-01 |
| share M0–M6 métier | — | Out of kit goal |

## Handoff (exclusive)

```text
/plan     — GH #14 only · spec 14-epic-b2-hmac-cut-ba-only-spec.md
implement — feat branch · validate:full green · close W1-G1..G3 (+ G4 per #14 DoD)
/ship     — PR + code-review + fix + reviewed + ci-watch  (mandatory D13)
# STOP — no mega-plan B3–B8
```

## Prompt alignment
- artifacts/goals/002-goal-run-prompt.md: same Wave-1 handoff /plan #14 → implement → /ship
