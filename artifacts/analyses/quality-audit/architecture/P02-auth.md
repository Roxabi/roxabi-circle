# Architecture — P2 auth

**Partition:** `packages/auth/**`  
**Date:** 2026-07-12  
**Scope:** Session HMAC, API keys, passwords, package surface & composition with apps  
**Out of scope:** Full OWASP security audit (→ security domain); product `share-*` (absent)

## Summary

`@gosilex/auth` is a small, Workers-native crypto/helpers package with a clean **module split**: `session.ts` (HMAC cookie tokens + cookie header builders) vs `keys.ts` (`sk_` hash/generate/Bearer, password PBKDF2). It correctly has **no Hono, D1, or R2 dependencies**, so dual-auth orchestration (`resolveAuth`, `requireAuth`) lives in `apps/example-api` — good package→app direction (ADR-0001), but **guards and `SessionPort` are not yet promoted** into the kit as AGENTS.md / ADR-0002 anticipate. Declared dependency on `@gosilex/core` is **unused**. Interim HMAC vs Better Auth is **documented and intentional** (ADR-0002); architectural debt is the missing adapter boundary, not the interim choice itself. Pure functions make unit testability high; cookie header helpers and some session edge paths are under-tested relative to T0 floor intent.

## Findings (table)

| ID | Severity | File | Finding | Evidence |
|----|----------|------|---------|----------|
| ARCH-P2-001 | P2 | `packages/auth/src/*` + `apps/example-api/src/services/auth.ts`, `middleware/require-auth.ts` | **Hono / dual-auth API surface is app-local, not package-level.** AGENTS targets `requireSession` / `requireApiKey` and “Better Auth Hono … guards” in `@gosilex/auth`; package only exports pure crypto + cookie string helpers. Second product app will re-copy `resolveAuth` + middleware unless promoted. | Package exports: `signSession`/`verifySession`/`parseBearer`/cookie headers only (`index.ts`). No Hono types, no `require*`. App: `resolveAuth` bearer-then-cookie (`services/auth.ts:88–108`); `requireAuth` sets `subject`/`authMethod` (`middleware/require-auth.ts:9–21`). |
| ARCH-P2-002 | P2 | `packages/auth/src/session.ts`; ADR-0002 | **No `SessionPort` / adapter seam for Better Auth swap.** Call sites import concrete `signSession`/`verifySession`/`sessionCookieHeader`. ADR-0002 consequence (“introduce `SessionPort` / adapter at the app boundary”) not implemented; migration will touch every session consumer. | ADR-0002 lines 22–39; app imports concrete symbols (`services/auth.ts:1–13`); package has no port types or factory. |
| ARCH-P2-003 | P3 | `packages/auth/package.json` | **Unused `@gosilex/core` dependency.** Declared but zero imports under `packages/auth/src`. Inflates graph; hides that auth does not map failures to `AppError` (by design: returns `null`/`false`, app throws). | `package.json` `dependencies["@gosilex/core"]`; `rg @gosilex/core packages/auth` → only package.json. |
| ARCH-P2-004 | P3 | `packages/auth/src/session.ts` | **Cookie policy is fixed strings, not env-aware options object.** Path/HttpOnly/SameSite=Lax hard-coded; only `secure` and `maxAge` optional. Domain parent (`.gosilex.com`) and SameSite=`None` cross-site cases from AGENTS cannot be expressed without forking helpers. | `sessionCookieHeader` / `clearSessionCookieHeader` (`session.ts:79–91`); AGENTS cookie table (Domain / SameSite variants). |
| ARCH-P2-005 | P3 | `packages/auth/src/keys.test.ts` vs `session.ts` | **Boundary test gaps on cookie surface** (architecture testability debt). Sign/verify covered; `sessionCookieHeader`, `clearSessionCookieHeader`, `parseCookie`, malformed body JSON, missing `.` token parts partially untested as named unit cases. | Tests: api keys, password, session sign/verify/bad sig/expired only. Coverage summary: `session.ts` functions **62.5%**, lines **74.35%**; `keys.ts` **100%** lines. |
| ARCH-P2-006 | P3 | `packages/auth/src/keys.ts` | **Hex encode/decode repeated; `timingSafeEqualHex` is `async` without await.** Minor API/layout debt; not a layer violation. | `hexToBytes` + inline `[...].map(toString(16))` thrice (`keys.ts`); `timingSafeEqualHex` returns `Promise<boolean>` but is sync (`keys.ts:17–25`). |
| — | (positive) | `session.ts` / `keys.ts` | **Session vs API key vs password separation is clear and documented.** Different primitives; comments forbid reusing `hashApiKey` for passwords. | API keys: SHA-256 (`hashApiKey`); passwords: PBKDF2 format `pbkdf2$…` (`hashPassword`); session: HMAC body.sig (`signSession`). ADR-0002 anti-pattern “Using `hashApiKey` for user passwords”. |
| — | (positive) | `package.json` deps | **Dependency direction healthy for kit extract.** No `hono`, `drizzle`, app imports. Web Crypto only — Workers/Node dual-friendly. | Deps: only `@gosilex/core` (unused). `tsconfig` lib `ES2022`+`DOM` for `crypto.subtle`. |
| — | (positive) | ADR-0002 + `session.ts` header | **Interim HMAC is explicit architecture debt with acceptance criteria**, not accidental Better Auth claim. | ADR-0002 accepted 2026-07-12; file comment “Better Auth–compatible *contract*” / “Swap later” (`session.ts:1–7`). |
| — | (positive) | Dual-auth order in app | **Bearer precedes cookie** — machine/MCP path cannot be silently overridden by a browser cookie on the same request (composition choice in app). | `resolveAuth`: parseBearer first; only if no bearer → cookie (`services/auth.ts:94–106`). |

## Metrics

| Metric | Value |
|--------|--------|
| Files analyzed (package) | 7 (`src/index.ts`, `keys.ts`, `session.ts`, `keys.test.ts`, `package.json`, `tsconfig.json`, `vitest.config.ts`) + consumers for surface |
| Package source LOC (approx.) | ~210 (`keys` ~93, `session` ~102, `index` ~19) |
| Public exports | 14 symbols (8 keys + 6 session incl. type/`SESSION_COOKIE`) |
| Internal modules | 2 concerns + barrel (`keys` \| `session` \| `index`) |
| Runtime deps declared | 1 (`@gosilex/core`) — **0 used** |
| Framework deps (Hono/Better Auth) | **0** in package |
| Hono guards in package | **0** (`requireSession` / `requireApiKey` absent) |
| SessionPort / adapter types | **0** |
| Test files | 1 (`keys.test.ts` co-locates keys + session tests) |
| Coverage floors (vitest) | statements/lines 80 · branches/functions 70 |
| Coverage snapshot (`coverage-summary.json`) | total lines **85.98%** · functions **76.47%** · `keys.ts` 100% lines · `session.ts` 74.35% lines / 62.5% functions · `index.ts` 0% (barrel re-exports) |
| Issues | **5** · P0: **0** · P1: **0** · P2: **2** · P3: **3** |
| Documented interim debt (non-finding if accepted) | HMAC session + PBKDF2 demo passwords (ADR-0002) |

### Dependency map (current)

```text
@gosilex/auth
  ├── (declared) @gosilex/core     ← UNUSED
  └── Web Crypto (global)          ← actual runtime

Consumers:
  apps/example-api  → full surface (session + keys + cookies)
  packages/mcp      → parseBearer only
  apps/example-api seed → hashPassword
```

### Intended vs actual API surface (Hono)

| AGENTS / ADR target | Actual in `@gosilex/auth` | Actual in example-api |
|---------------------|---------------------------|------------------------|
| Better Auth on Hono | Not present (HMAC interim) | Demo password login routes |
| `requireSession` / `requireApiKey` | Absent | Combined `requireAuth` |
| Cookie HttpOnly + credentials include | Header builders | SPA `credentials: 'include'` |
| API key `sk_` hash | `hashApiKey` / `generateApiKey` / `verifyApiKey` | Mint + D1 lookup by hash |
| SessionPort | Absent | Direct `signSession`/`verifySession` |

## Recommendations

1. **P2 — Promote dual-auth composition into the package without pulling D1 into auth**  
   - Extract pure orchestration: e.g. `resolveAuthFromHeaders({ authorization, cookie, verifySessionToken, lookupApiKeyHash })` or a small `AuthResolver` with injected ports.  
   - Optional thin `createRequireAuth({ getDb, getSecret })` under a subpath `@gosilex/auth/hono` **only if** a Hono peerDep is accepted; otherwise keep middleware in apps but share the pure resolver.  
   - Goal: second app does not reimplement bearer-vs-cookie precedence and subject mapping.

2. **P2 — Introduce `SessionPort` (or `SessionStore`) before Better Auth work**  
   - Minimal interface: `sign(payload) → token`, `verify(token) → payload | null`, `setCookie` / `clearCookie` options.  
   - HMAC implementation = default kit adapter; Better Auth = product adapter.  
   - Keeps FE contract (`credentials: 'include'`, Bearer `sk_`) stable per ADR-0002.

3. **P3 — Drop unused `@gosilex/core` or use it deliberately**  
   - Prefer drop until auth needs shared `AppError`/`ErrorCode` (null/false remains a good pure boundary).  
   - If guards move into package, then depend on core for `AppError.unauthorized()`.

4. **P3 — Extend cookie options for multi-host product**  
   - `domain?`, `sameSite?: 'Lax' | 'Strict' | 'None'`, assert `Secure` when `SameSite=None`.  
   - Keep defaults as today (kit local).

5. **P3 — Close unit gaps on the cookie boundary**  
   - Tests for `sessionCookieHeader` flags, `clearSessionCookieHeader` Max-Age=0, `parseCookie` multi-cookie / empty value, malformed session body.  
   - Aligns with CP-AUTH-SESSION / T0 floor ownership in `docs/testing.md`.

6. **Keep (do not reverse)**  
   - Separate KDFs for passwords vs API keys.  
   - Stateless package (no D1 schema for sessions/keys inside `@gosilex/auth`).  
   - ADR-0002 honesty: never claim “Better Auth installed” while HMAC is the implementation.

## Residual risks

| Risk | Why residual | Mitigations elsewhere |
|------|----------------|------------------------|
| **Stateless HMAC = no server-side session revoke** | Architecture of interim; secret rotation only mass-revoke | Product Better Auth + session table; key revoke is D1-row delete (app) |
| **Cookie name / payload shape not stable** | ADR-0002 “Not stable” | FE must not parse cookie body; only rely on `/me` |
| **AGENTS.md stack table still says Better Auth** | Doc lag vs ADR interim | ADR-0002 is SSoT for kit; update AGENTS “When” column if confusion spreads |
| **Security properties of HMAC / PBKDF2 / SHA-256 keys** | Out of this architecture pass | Security partition P2; timing-safe hex present for digests |
| **`verifyApiKey` vs hash-then-D1-lookup** | App correctly uses hash as lookup key; `verifyApiKey` is for offline compare | No bug; document preferred app pattern |
| **MCP `whoami` does not verify sk_ against API** | `packages/mcp` presence-only | Product M5 / wiring — not auth package boundary |
| **Session secret handling** | Lives in `apps/example-api` `getSecret` | App architecture / security audit |
| **Coverage of barrel `index.ts`** | Re-export file at 0% | Ignore or import-from-barrel in one test |

**Architecture debt score (partition subjective):** ~72/100 — clean modules and dependency direction; incomplete kit guard/`SessionPort` surface and unused core dep keep it below “pristine kit auth package.”
