---
title: 'ADR-0002 — Kit session = HMAC cookie (interim); Better Auth as product swap'
status: accepted
date: 2026-07-12
---

# ADR-0002 — Kit session HMAC interim vs Better Auth

## Context

Chemin A kit needs dual client auth for demos and tests:

1. **Browser SPA** — HttpOnly cookie + `credentials: 'include'`
2. **Machine / MCP** — Bearer `sk_` (hashed at rest)

Arbitration freeze mentioned Better Auth for B3. Full Better Auth on Workers adds schema, cookie naming, and adapter surface that the kit examples do not need for exit. Shipping a **Workers-native HMAC session** unblocks dual-auth demos without blocking a later product swap.

## Decision

| Layer | Kit (now) | Product / later |
|---|---|---|
| Session cookie | HMAC-signed payload (`@gosilex/auth` `signSession` / `verifySession`) | Better Auth (or equivalent) adapter |
| Cookie contract | `gosilex_session` · HttpOnly · SameSite=Lax · Secure when not local | May change cookie **name**; keep HttpOnly + credentials include |
| Passwords | PBKDF2-SHA-256 (`hashPassword` / `verifyPassword`) | Better Auth credential plugin |
| API keys | SHA-256 of high-entropy `sk_` (`hashApiKey`) | Same primitive OK |
| FE contract | `credentials: 'include'` + nested error envelope | Unchanged |

**Stable FE/API contract for extract:**

- Session auth via cookie (not localStorage token)
- Machine auth via `Authorization: Bearer sk_…`
- Error body `{ error: { code, message, details? }, requestId }`

**Not stable:** cookie name, session table shape, password storage format if Better Auth replaces PBKDF2 demo users.

## Consequences

- Example apps must not hard-code Better Auth routes (`/api/auth/*` kit login is demo-only).
- **SessionPort is shipped** (`createHmacSessionPort` / `defaultSessionPort` in `@gosilex/auth`). Apps inject or default the HMAC adapter; product swap implements the same port.
- Staging/prod must set real `SESSION_SECRET` and explicit `ENVIRONMENT`.

## Better Auth timeline (not installed in kit)

| Phase | Status | Work |
|---|---|---|
| **Kit B3 / now** | **Done** | HMAC `SessionPort` + cookie contract + PBKDF2 demo users + `sk_` keys |
| **Before product M3** | Required | Keep FE contract stable; do not claim BA in README |
| **Product M3** | Planned | Better Auth on Hono + D1 adapter + GitHub OAuth + org gate (issue #12) |
| **After BA** | Follow-up | HMAC adapter becomes optional/demo-only; password storage may change |

Swap recipe (product):

1. Implement `SessionPort` with Better Auth session cookie read/write (or thin wrapper).
2. Bind `example-api` / `share-api` via `opts.sessions` / DI — no FE change if cookie still HttpOnly + credentials include.
3. Keep `hashApiKey` / timing-safe compare for machine keys (unchanged).

## Anti-patterns

- Using `hashApiKey` for user passwords
- Storing session tokens in SPA localStorage
- Claiming “Better Auth installed” when only HMAC is present
- Forking session crypto per app instead of implementing `SessionPort`

## Related

- ADR-0001 axial packages compose apps
- `packages/auth/src/session.ts`, `packages/auth/src/session-port.ts`, `packages/auth/src/keys.ts`
- Goal arbitration freeze B3 dual auth
- GitHub #3 SessionPort · #12 Better Auth M3
