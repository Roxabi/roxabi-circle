---
title: 'ADR-0002 — SessionPort: Better Auth only + Bearer sk_ dual-path'
status: accepted
date: 2026-07-12
amended: 2026-07-30
supersedes_notes: >
  2026-07-15: Better Auth first-class via AUTH_SESSION_ADAPTER.
  2026-07-30: HMAC session path retired — no upstream product consumers;
  kit dogfood and all new products use Better Auth only for browser sessions.
  Bearer sk_ dual-path unchanged.
related:
  - docs/architecture/adr/0003-multi-tenant-rbac-modules.md
  - GitHub epic #14 (B2 HMAC cut)
---

# ADR-0002 — SessionPort: Better Auth only + Bearer `sk_` dual-path

## Context

Chemin A kit needs dual **client** auth for demos and products:

1. **Browser SPA** — HttpOnly cookie + `credentials: 'include'`
2. **Machine / MCP** — Bearer `sk_` (hashed at rest)

HMAC-signed cookies shipped first as a Workers-native interim. Issue #5 landed Better Auth behind `SessionPort` with an adapter switch (`hmac` | `better-auth`). Multi-tenant org/RBAC/modules (ADR-0003) **require** Better Auth.

**2026-07-30:** No product repo consumes this kit as `upstream` yet. Maintaining a dual session stack (HMAC + BA) is pure cost: wrong defaults, dual seeds, dual login surfaces, and false dogfood. **HMAC session path is retired.**

## Decision

### D1 — Browser session = Better Auth only

| Layer | Kit (normative) |
|---|---|
| Session | `createBetterAuthSessionPort` + per-request `betterAuth` instance |
| Cookie | `gosilex_session` (overridable via `SESSION_COOKIE_NAME`) · HttpOnly · SameSite=Lax · Secure when not local |
| Login surface | BA handler `ALL /api/auth/*` (email/password; OAuth optional later) |
| API keys | SHA-256 `sk_` via `hashApiKey` — **unchanged** |
| FE contract | `credentials: 'include'` + error envelope — **unchanged** |

**Stable FE/API contract:**

- Session auth via cookie (not localStorage token)
- Machine auth via `Authorization: Bearer sk_…`
- Error body `{ error: { code, message, details? }, requestId }`
- Dual-path credential: **Bearer preferred when both present** (session cookie + `sk_`)

### D2 — HMAC retired

| Removed / forbidden | Notes |
|---|---|
| `AUTH_SESSION_ADAPTER=hmac` | Delete switch; do not document as supported |
| `createHmacSessionPort` as kit path | Remove from public package API (or hard-throw deprecation in one release if needed for local cleanup) |
| Demo PBKDF2 `POST /api/auth/login` | Replaced by BA sign-in |
| Unset adapter → hmac | N/A — no adapter enum for session stack |

Historical interim code may remain briefly behind a private/test-only flag **only** during the cut PR; merge to `main` = BA-only green suite.

### D3 — SessionPort (normative)

```ts
resolveSession({ cookieHeader?, headers?, secret?, cookieName }) → SessionPayload | null
```

BA implements `auth.api.getSession({ headers })`.  
`resolveDualAuth` / `originGuard` use **cookie name SSoT** (`sessionCookieName` / `SESSION_COOKIE_NAME`) — never hardcode.

`SessionPort` remains the boundary so products do not fork session parsing — it is **not** a multi-adapter plug forever.

### D4 — Secrets / fail-closed

- `BETTER_AUTH_SECRET` required (min length enforced) outside pure unit mocks
- `BETTER_AUTH_URL` required outside `development` \| `test` (or derived base URL rules documented in app)
- **No inference** of auth mode from secret presence
- Kit placeholder secrets forbidden when `ENVIRONMENT` is `staging` \| `production`

### D5 — Mount

| Mounted | Not mounted |
|---|---|
| BA `handler` on `/api/auth/*` | HMAC login/logout routes |

## Consequences

### Positive

- One session story for docs, seed, e2e, multi-tenant dogfood.
- ADR-0003 org/RBAC always available on the kit path.
- Products clone → BA without choosing an adapter.

### Negative / accepted debt

- Breaking change for any **future** consumer that expected HMAC (none today).
- OAuth GitHub / social still **optional later** (not part of this ADR cut).
- Password reset / invites depend on email transport (CF Email epic) for real UX.

### Product inject recipe (updated)

1. Depend on `@gosilex/auth` + peer `better-auth`.
2. Apply BA migrations (`packages/auth/migrations/*` composed into app migrations).
3. Set `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (and cookie name if needed). **No** `AUTH_SESSION_ADAPTER`.
4. Per-request: `createBetterAuth(env, baseURL)` → `c.set('betterAuth', auth)`.
5. `createBetterAuthSessionPort({ getAuth: () => c.get('betterAuth'), cookieName })` into `createRequireAuth`.
6. Mount `auth.handler(c.req.raw)` on `/api/auth/*`.
7. Keep `findApiKeyByPrefix` for `sk_` dual-path.

## Anti-patterns

- Reintroducing HMAC “just for demos”
- Dual login stacks (BA + custom password routes)
- Storing session tokens in SPA localStorage
- Inferring auth from secrets
- Hardcoding cookie name outside SSoT helper
- Forking session crypto per app instead of `SessionPort`
- Using `hashApiKey` for user passwords
- Claiming “full BA” while leaving HMAC in Quick Start

## Related

- [ADR-0001](./0001-primary-axis-packages-compose-apps.md) — packages compose apps  
- [ADR-0003](./0003-multi-tenant-rbac-modules.md) — multi-tenant (BA org spine)  
- `packages/auth/src/session-port.ts`, `better-auth-port.ts`, `require-auth.ts`, `cookie-name.ts`  
- GitHub epic **#14** (B2 HMAC cut / BA-only) · historical #5 Better Auth dual-path land
