# Architecture — P1+P2 (core/types/config/api-client/auth)

## Summary

Kernel packages in this slice are **structurally healthy**: dependency DAG is acyclic (`types` → `core`/`api-client`; `auth` → `core`), public entrypoints are single-barrel (`exports["."]` only, plus auth migrations), and **no app or sibling package deep-imports** `@kit/*/src/...` modules. Layer purity is strong for Workers: zero Hono/Drizzle/Cloudflare runtime imports inside these packages; auth uses a structural `SessionPort` + optional `better-auth` peer; apps own BA factory + D1 wiring. Residual architecture debt is concentrated in **HMAC-era SessionPort surface** (`sign`/`verify`/`secret`), **dual password-hash story** (kit PBKDF2 still public while real sessions use BA crypto), and **`@kit/config` package boundary incomplete** (Vitest coverage helper consumed via relative path outside `exports`). Overall: shippable kit kernel with P2 cleanup, no P0 architecture break.

## Findings

| ID | Severity | File | Finding | Evidence | Recommendation |
|----|----------|------|---------|----------|----------------|
| F1 | P2 | `packages/auth/src/session-port.ts`, `better-auth-port.ts`, `require-auth.ts` | **HMAC-era SessionPort surface still public after ADR-0002 BA-only** | `SessionPort` still requires `sign` / `verify`; BA adapter `sign` **throws**, `verify` **always returns null**. `ResolveSessionInput.secret` and `DualAuthPorts.secret` remain optional but unused by BA `resolveSession` (only forwarded). ADR-0002 D2 retired HMAC; D3 normative surface is `resolveSession` only. Public API still advertises a multi-adapter token crypto contract. | Narrow `SessionPort` to `resolveSession` + cookie helpers; drop `sign`/`verify`/`secret` (or mark `@deprecated` + banlist in one release). Update tests that assert `sign` throws. |
| F2 | P2 | `packages/auth/src/keys.ts`, `packages/auth/src/index.ts`, `apps/example-api/src/seed/seed-db.ts` | **Dual password KDF surface confuses package vs BA ownership** | Kit exports `hashPassword` / `verifyPassword` (PBKDF2 WebCrypto). App seed writes **both** `demo_users.password_hash` via `@kit/auth` **and** BA `account.password` via `better-auth/crypto`. Login is BA-only (ADR-0002). Kit password helpers are no longer the session credential path but remain first-class public API; consumers can mint hashes that BA will not verify. | Document as **legacy/demo table only** or demote: stop seeding kit PBKDF2 on `demo_users` once unused; prefer BA crypto for any password write; optionally un-export kit password KDF from barrel (keep private for tests) once call sites gone. |
| F3 | P2 | `packages/config/package.json`, `packages/*/vitest.config.ts`, `apps/*/vitest.config.ts` | **`@kit/config` package boundary incomplete — internals reached by relative path** | `package.json` `exports` only `./tsconfig.base.json`. Shared `vitest-coverage.mjs` is imported as `../config/vitest-coverage.mjs` / `../../packages/config/vitest-coverage.mjs` from packages and apps — **bypasses package exports** (deep relative into package tree). AGENTS H also claims Biome presets under `@kit/config`; Biome lives at repo root, not this package. | Expand `exports` (e.g. `./vitest-coverage` → `./vitest-coverage.mjs`) and switch consumers to `@kit/config/vitest-coverage`; or move tooling to `tooling/` and keep `@kit/config` as pure JSON assets. Align AGENTS claim with actual contents. |
| F4 | P2 | `packages/auth/src/better-auth-port.ts` | **Cookie name override via string replace is brittle** | `cookieHeader` / `clearCookieHeader` build headers with hard-coded `SESSION_COOKIE` then `.replace(\`${SESSION_COOKIE}=\`, \`${cookieName}=\`)`. Fails if name appears elsewhere in the string or if default changes format; not a structured cookie builder. | Pass `cookieName` into `sessionCookieHeader` / `clearSessionCookieHeader` (or a single helper) so name is set once, not rewritten. |
| F5 | P2 | `packages/auth/src/better-auth-port.ts` | **Session resolve fail-closed swallows all BA errors as “no session”** | `resolveSession` `catch { return null }` — any throw from `getAuth()` or `getSession` becomes 401 identity miss. Correct for unauthenticated UX; **masks factory/misconfig** as empty session at the port layer (comment notes infra should fail earlier at factory — true only if app always binds auth before middleware). | Keep fail-closed for auth decisions; optionally distinguish binding missing (`getAuth` throw before ready) as `AppError.internal` at app middleware (already done when `betterAuth` unbound). Port may log at debug when catch fires in non-prod — do not leak to client. |
| F6 | P3 | `packages/core/src/index.ts`, `packages/types/src/index.ts` | **ErrorCode dual export path** | `@kit/types` owns `ErrorCode` / `ApiErrorBody`; `@kit/core` re-exports them. FE uses `@kit/types`; BE mostly `@kit/core` for `AppError` only. Dual entry is intentional convenience but two import paths for the same SSoT. | Document “types = wire SSoT; core re-export for BE convenience” in package READMEs; keep re-export (no fork). Prefer FE always `@kit/types`, BE AppError from `@kit/core`. |
| F7 | P3 | `packages/core/src/parse.ts`, `packages/core/src/index.ts` | **`ParseableSchema` not on public barrel** | Type is exported from `parse.ts` but `index.ts` only exports `parseOrThrow`. Consumers cannot type schema params without deep import (blocked by exports map) or local structural type. | `export type { ParseableSchema } from './parse'` on barrel if apps need it. |
| F8 | P3 | `packages/api-client/src/index.ts` | **`ApiError.code` widened to `string`** | Class field `readonly code: string` while constructor body uses `ApiErrorBody` (`ErrorCodeName`). Weakens FE exhaustiveness vs `ErrorCodeName`. | Type `code` as `ErrorCodeName` (or `ErrorCodeName \| string` only if product codes allowed on wire). |
| F9 | P3 | `packages/auth/src/index.ts` | **Large flat public surface for pure RBAC helpers** | Single barrel exports keys, session, dual-auth, org roles, module grants (~30+ symbols). Healthy for kit dogfood; no subpath exports for tree-shaking / cognitive split (`@kit/auth/org`, `@kit/auth/keys`). | Optional later: subpath exports when product surface stabilizes; not required while package stays small. |
| F10 | P3 | `packages/auth/package.json`, ADR-0002 | **Guards stay app-composed; package provides factory only** | AGENTS targets “`requireSession` / `requireApiKey` in `@kit/auth`”; live design is better: pure `resolveDualAuth` + `createRequireAuth(getPorts)` with app-injected key lookup + BA. Hono coupling is structural (`req.header` / `set`) not a dependency — good purity. Not a defect; docs slightly aspirational. | Keep factory pattern; update AGENTS wording to “createRequireAuth + ports” rather than named requireSession middleware exports. |

### Non-findings (healthy patterns — no issue ID)

| Area | Evidence |
|------|----------|
| **No circular workspace deps** | `types` leaf; `core`→`types`; `api-client`→`types`; `auth`→`core` only. No reverse edges. |
| **No deep package imports from apps** | Grep for `@kit/(core\|types\|auth\|api-client)/` deep paths: **0** matches. All consumers use package root. |
| **Import-boundary gate** | Wave 0: `import-boundary` 0 violations; packages ↛ apps enforced. |
| **Layer purity** | No `hono`, `drizzle`, `cloudflare:workers` imports under these five packages’ `src/`. Web Crypto + structural types only. |
| **BA integration placement** | Factory in `apps/example-api/src/lib/better-auth.ts`; kit only has `BetterAuthLike` + `createBetterAuthSessionPort`. Bindings/secrets stay app-side (correct for multi-tenant product deploys). |
| **Dual-auth design** | Bearer preferred over cookie; org-bound key recheck lives in app middleware (`findKeyRecord`), not ambient in package — least privilege / product policy at compose site. |
| **Error envelope FE/BE split** | `@kit/types` wire shape; `@kit/core` `toApiErrorBody` (5xx scrub); `@kit/api-client` `ApiError` + i18n-agnostic `apiErrorToMessage` — clean axis. |
| **Zod decoupling** | `parseOrThrow` uses duck-typed `ParseableSchema`; `zod` is core **devDependency** only — packages don’t pin Zod major for consumers. |
| **Config as non-runtime** | `@kit/config` has no runtime `src/` — correct for tool presets (once exports fixed, F3). |
| **Auth migrations export** | `"./migrations/*"` allows products to compose BA/org SQL without forking package internals. |

## Metrics

| Metric | Value |
|--------|------:|
| Packages in scope | 5 (`core`, `types`, `config`, `api-client`, `auth`) |
| Source modules reviewed (excl. tests) | 16 |
| Test modules sampled | 6 |
| Public barrel exports (approx. symbols) | types ~3 · core ~10 · api-client ~6 · auth ~45 · config 1 export path |
| Workspace dependency edges (runtime) | 3 (`core→types`, `api-client→types`, `auth→core`) |
| Circular deps | **0** |
| Deep `@kit/*/` imports from apps | **0** |
| Relative deep imports into `packages/config` | **≥5** (all vitest configs) |
| Runtime CF/Hono/DB imports in package src | **0** |
| Issues | P0=0 · **P1=0** · **P2=5** · **P3=5** |
| Notable hotspots | `session-port.ts` + `better-auth-port.ts` (HMAC residue); `keys.ts` password path; `config` exports map |

### Public API inventory (normative surface today)

```text
@kit/types
  ErrorCode, ErrorCodeName, ApiErrorBody

@kit/core
  AppError, toApiErrorBody, newRequestId
  createLogger, Logger, LogLevel, LogFields
  parseOrThrow
  re-export: ErrorCode, ErrorCodeName, ApiErrorBody

@kit/api-client
  ApiError, ApiClientOptions, ApiFetch
  createApiClient, apiFetch, apiErrorToMessage

@kit/auth
  SessionPort, ResolveSessionInput, SessionPayload
  createBetterAuthSessionPort, BetterAuthLike
  resolveDualAuth, createRequireAuth, DualAuthPorts, AuthIdentity, …
  sk_ helpers: generate/hash/verify/prefix/parseBearer/timingSafeEqualHex
  password: hashPassword, verifyPassword  (legacy dual-seed risk — F2)
  cookie: SESSION_COOKIE, sessionCookieName, parseCookie, *CookieHeader
  pure RBAC: org-roles + module-grants helpers
  ./migrations/*

@kit/config
  ./tsconfig.base.json
  (vitest-coverage.mjs exists but NOT in exports — F3)
```

### Dependency DAG

```text
@kit/types          (pure, 0 deps)
    ↑           ↑
@kit/core    @kit/api-client
    ↑
@kit/auth  (peer: better-auth optional)

@kit/config        (assets only; isolated)
```

## Recommendations

1. **Trim SessionPort to BA-only contract (F1)** — remove `sign`/`verify`/`secret` from the public type once tests updated; aligns code with ADR-0002 D2/D3 and reduces product fork risk (“implement HMAC sign”).
2. **Close password dual-path (F2)** — treat kit PBKDF2 as non-session; migrate seed/docs; un-export when `demo_users.password_hash` is gone or unused for auth.
3. **Fix `@kit/config` exports (F3)** — publish `vitest-coverage` via package exports; replace relative `packages/config/...` imports; correct AGENTS package description.
4. **Harden cookie header builder (F4)** — name parameter on session cookie helpers; delete string replace.
5. **Keep purity discipline** — do **not** move Better Auth factory, D1 schema, or Hono into `@kit/auth`; current split (pure port + app compose) is the right multi-tenant kit shape.
6. **Hygiene (F6–F8, F10)** — export `ParseableSchema`; tighten `ApiError.code`; document ErrorCode dual import; align AGENTS guard wording with `createRequireAuth`.
7. **No architecture P0/P1 action required** for extractibility or circular deps in this slice; gate `import-boundary` already covers packages↛apps.

---

*Audit partition: Architecture P1+P2 · date 2026-08-12 · read-only · kit multi-tenant CF Workers*
