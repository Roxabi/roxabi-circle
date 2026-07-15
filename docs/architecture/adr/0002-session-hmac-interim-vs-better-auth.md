---
title: 'ADR-0002 — SessionPort dual-path; HMAC default + Better Auth kit path'
status: accepted
date: 2026-07-12
amended: 2026-07-15
supersedes_notes: 'Interim-only wording updated — Better Auth is a first-class kit path via AUTH_SESSION_ADAPTER (issue #5)'
---

# ADR-0002 — SessionPort: HMAC default + Better Auth kit path

## Context

Chemin A kit needs dual client auth for demos and products:

1. **Browser SPA** — HttpOnly cookie + `credentials: 'include'`
2. **Machine / MCP** — Bearer `sk_` (hashed at rest)

HMAC-signed cookies shipped first (B3) as a Workers-native interim. Issue #5 lands **Better Auth** as an optional kit session path behind the same **`SessionPort`**, without forking `@gosilex/auth` for products.

## Decision

| Layer | Kit default (`AUTH_SESSION_ADAPTER=hmac`) | Kit BA path (`=better-auth`) |
|---|---|---|
| Session | HMAC `createHmacSessionPort` | `createBetterAuthSessionPort` + per-request `betterAuth` |
| Cookie contract | `gosilex_session` (overridable via `SESSION_COOKIE_NAME`) · HttpOnly · SameSite=Lax · Secure when not local | Same SSoT cookie name when configured on BA |
| Login surface | `POST /api/auth/login` (demo PBKDF2 users) | BA handler `ALL /api/auth/*` (email/password; OAuth optional) |
| API keys | SHA-256 `sk_` via `hashApiKey` | Unchanged |
| FE contract | `credentials: 'include'` + error envelope | Unchanged |

**Stable FE/API contract:**

- Session auth via cookie (not localStorage token)
- Machine auth via `Authorization: Bearer sk_…`
- Error body `{ error: { code, message, details? }, requestId }`
- Dual-path: Bearer preferred when both present

**Not stable across adapters:** session table shape, password storage, login URL path (`/api/auth/login` vs BA sign-in routes).

### SessionPort (normative)

```ts
resolveSession({ cookieHeader?, headers?, secret?, cookieName }) → SessionPayload | null
```

HMAC implements parse + verify. BA implements `auth.api.getSession({ headers })`.  
`resolveDualAuth` / `originGuard` use **cookie name SSoT** (`sessionCookieName` / `SESSION_COOKIE_NAME`) — never hardcode.

### Adapter switch (D4)

- **`AUTH_SESSION_ADAPTER`**: `hmac` | `better-auth` (unset → `hmac` for back-compat)
- **No inference** from secret presence
- `better-auth` without required secret → **fail closed**

### Mount exclusivity (D6)

| Adapter | Mounted | Not mounted |
|---|---|---|
| `better-auth` | BA `handler` on `/api/auth/*` | HMAC login/logout |
| `hmac` | HMAC login/logout | BA handler |

## Consequences

- **`@gosilex/auth`** exports HMAC port, BA port factory, cookie SSoT, dual-auth factory. Optional peer: `better-auth`.
- **Apps own** D1 migrations apply; package ships SQL under `packages/auth/migrations/` for composition (not re-author tables).
- **example-api** wires per-request BA middleware + injects port into `requireAuth`.
- Products: set adapter + secrets, apply BA migrations, mount handler, inject port — **zero-edit** of package sources.
- Staging/prod: real secrets + explicit `ENVIRONMENT`.

## Product inject recipe

1. Depend on `@gosilex/auth` (+ `better-auth` peer when using BA).
2. Apply `packages/auth/migrations/0001_better_auth.sql` (or copy into app migrations).
3. `AUTH_SESSION_ADAPTER=better-auth`, `BETTER_AUTH_SECRET`, optional `BETTER_AUTH_URL`, optional `SESSION_COOKIE_NAME`.
4. Per-request: `createBetterAuth(env, baseURL)` → `c.set('betterAuth', auth)`.
5. `createBetterAuthSessionPort({ getAuth: () => c.get('betterAuth'), cookieName })` into `createRequireAuth`.
6. Mount `auth.handler(c.req.raw)` on `/api/auth/*`.
7. Keep `findApiKeyByPrefix` for `sk_` dual-path.

## Anti-patterns

- Using `hashApiKey` for user passwords
- Storing session tokens in SPA localStorage
- Silent dual stacks (HMAC login + BA login both live)
- Inferring adapter from secrets
- Hardcoding cookie name outside SSoT helper
- Forking session crypto per app instead of `SessionPort`

## Related

- ADR-0001 axial packages compose apps
- `packages/auth/src/session-port.ts`, `better-auth-port.ts`, `require-auth.ts`, `cookie-name.ts`
- GitHub #5 Better Auth on Hono (M3) · product `silex-share#12` for org OAuth depth
