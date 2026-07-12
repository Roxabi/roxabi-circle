# Error Handling — BE

**Partition:** `packages/core`, `packages/auth`, `packages/db`, `packages/storage`, `packages/email`, `packages/mcp`, `apps/example-api`  
**Date:** 2026-07-12  
**Focus:** bare catch / swallow · `throw Error` vs `AppError` · client leakage (stack/SQL/paths/config) · missing `requestId` · Zod → `VALIDATION_ERROR` mapping  
**Out of scope:** FE SPA (`example-web`), product `share-*` (absent)  
**Refs:** AGENTS.md §F (errors centralisées), `packages/core/src/errors.ts`, `apps/example-api/src/middleware/error-handler.ts`

## Summary

Backend error handling is **structurally healthy for a kit demo**. `@gosilex/core` owns `AppError` + `toApiErrorBody` + `newRequestId`; `example-api` wires global `requestIdMiddleware` and `app.onError` → nested `{ error: { code, message, details? }, requestId }` with stacks only in structured `console.error`. Domain paths (auth, notes, requireAuth, Zod body boundaries) consistently `throw AppError.*`. Unknown/`Error` throws map to generic `INTERNAL_ERROR` / `Internal error` (no stack/SQL to clients). Integration tests assert nested UNAUTHORIZED, VALIDATION_ERROR, NOT_FOUND, and no `stack` in JSON.

Gaps are **policy and completeness**, not a missing spine:

1. **`toApiErrorBody` treats all `AppError.message` as public** — so `AppError.internal('SESSION_SECRET is required…')` leaks operational config detail (violates AGENTS “message générique”).  
2. **No central Zod helper** — each route hand-rolls `safeParse` + `AppError.validation` + `fieldErrors`; `.parse()` elsewhere would become 500.  
3. **Swallow / false-success** on SMTP fallback and R2 delete (email reports `ok: true` after catch; notes `catch {}` ignores all delete errors).  
4. **Platform packages throw bare `Error`** (`storage` traversal, `mcp` boot asserts) — OK for boot/helpers today, inconsistent if they cross HTTP.  
5. **Hono unmatched-route 404** is not shaped as `ApiErrorBody` + `requestId`.  
6. Kit surface incomplete vs AGENTS sketch: no `cause` on `AppError`, no `rateLimited()` despite `ErrorCode.RATE_LIMITED`.

**Bottom line:** No P0 leak of stacks or secrets in the happy error path. Highest practical risks are **config-message leakage via `AppError.internal`**, **false-positive email success**, and **clone risk** (copy-paste validation/error patterns without a single mapper).

## Findings

| ID | Severity | File | Finding | Evidence |
|----|----------|------|---------|----------|
| ERR-BE-001 | **P1** | `packages/core/src/errors.ts` · `apps/example-api/src/lib/session-env.ts` | **`AppError` public mapping exposes full `message` for every code including `INTERNAL_ERROR`.** Operators use specific internal messages; clients receive them. `getSecret` throws `AppError.internal('SESSION_SECRET is required (min 32 chars) unless ENVIRONMENT is development\|test')` → any login/me path without secret returns that string in JSON. AGENTS §F: client message generic; detail only in logs. | ```49:60:packages/core/src/errors.ts``` · ```26:28:apps/example-api/src/lib/session-env.ts``` |
| ERR-BE-002 | **P1** | `apps/example-api/src/services/email.ts` | **SMTP failures are swallowed and reported as success.** Outer `try/catch` logs warn then falls through to log transport and returns `{ ok: true, transport: 'log' }`. Client cannot distinguish “SMTP failed” vs intentional log transport; ops may miss silent fallback under misconfigured `SMTP_HOST`. Error handling contract for demo email is **false success**, not mapped to `AppError`. | ```58:77:apps/example-api/src/services/email.ts``` |
| ERR-BE-003 | **P2** | `packages/core/src/errors.ts` · routes | **No shared Zod → `AppError.validation` mapper; dual-boundary ceremony duplicated.** Login/notes: `c.req.json().catch(() => null)` + `safeParse` + manual `fieldErrors: parsed.error.flatten().fieldErrors`. No `fromZodError` / `parseBody(schema)` in `@gosilex/core`. Risk: future route uses `schema.parse()` → uncaught `ZodError` → 500 `INTERNAL_ERROR` (not VALIDATION_ERROR). `parseWorkerStringEnv` already uses `.parse()` (tooling only today). | ```17:24:apps/example-api/src/routes/auth.ts``` · ```25:33:apps/example-api/src/routes/notes.ts``` · ```43:44:apps/example-api/src/env.schema.ts``` · core has only `AppError.validation` factory |
| ERR-BE-004 | **P2** | `apps/example-api/src/services/notes.ts` | **Bare `catch` on R2 delete swallows all failures.** Comment says “ignore missing object” but there is no error-type filter — permission, network, binding errors also disappear; DB row still deleted (orphan vs inconsistent observability). Prefer `deleteObject` best-effort with typed not-found or log+continue. | ```60:64:apps/example-api/src/services/notes.ts``` |
| ERR-BE-005 | **P2** | `packages/storage/src/index.ts` · notes service | **Path traversal throws bare `Error`, not `AppError`.** Becomes client `INTERNAL_ERROR` 500 (generic message — good) instead of `VALIDATION_ERROR` 400. Today keys use server UUID so path is rarely attacker-controlled; still wrong status semantics for kit clones that pass user path segments. | ```26:28:packages/storage/src/index.ts``` · notes `joinObjectKey('demo', id, …)` |
| ERR-BE-006 | **P2** | `packages/core/src/errors.ts` · AGENTS §F | **`AppError` incomplete vs kit SSoT sketch.** No `cause?` field; no `static rateLimited()` despite `ErrorCode.RATE_LIMITED` in `@gosilex/types`. Free-form `code: string` constructor (not `ErrorCodeName`) allows typos / non-SSoT codes. No public vs private message split (`publicMessage` / `internalMessage`). | ```4:39:packages/core/src/errors.ts``` · `packages/types` ErrorCode |
| ERR-BE-007 | **P2** | `apps/example-api/src/app.ts` · Hono default | **Unmatched routes are not `ApiErrorBody` + `requestId`.** `app.onError` only handles thrown errors; no `app.notFound`. Default Hono 404 is not the nested error envelope; clients that always parse `{ error, requestId }` break. Middleware still sets `x-request-id` header if request reached `requestIdMiddleware`. | `createApp` mounts `onError` only; no `notFound` |
| ERR-BE-008 | **P2** | `apps/example-api/src/middleware/error-handler.ts` | **`onError` types `err: Error` not `unknown`; non-Error throws / cause chain underused.** Hono can pass non-Error in edge cases; `toApiErrorBody` accepts `unknown` but handler assumes `Error` for `.message`/`.stack`. Logs message+stack but never `cause` / structured `details`. No distinction log-level 4xx vs 5xx (all `level: 'error'`). | ```7:21:apps/example-api/src/middleware/error-handler.ts``` |
| ERR-BE-009 | **P3** | `packages/mcp/src/index.ts` · `apps/mcp-example` | **MCP kit/boot asserts use bare `throw new Error(...)`.** Acceptable for process boot (stdio), not HTTP. No mapping to `AppError` / structured tool error envelope; FastMCP tools have no try/error wrapper beyond framework defaults. | ```8:23:packages/mcp/src/index.ts``` · mcp-example boot asserts |
| ERR-BE-010 | **P3** | `packages/auth/src/session.ts` | **`verifySession` bare `catch { return null }` on JSON parse.** Intentional “invalid token → null” (caller → 401). Swallow is correct for auth fail-closed; residual: no metric/log on malformed-but-signed edge cases; `payload.exp` compare can throw if `exp` missing/non-number (caught → null) — immortal-session class issues owned by security audit. | ```68:74:packages/auth/src/session.ts``` |
| ERR-BE-011 | **P3** | `apps/example-api/src/middleware/request-id.ts` | **Client-supplied `x-request-id` accepted unbounded.** Echoed in success JSON, error body, and logs → log injection / correlation pollution / oversized header. Prefer mint-always or strict `^req_[A-Za-z0-9_-]{8,64}$`. (Also SEC-P05-013.) | ```14:17:apps/example-api/src/middleware/request-id.ts``` |
| ERR-BE-012 | **P3** | `packages/db` · repos | **DB layer has no error taxonomy.** Drizzle/D1 failures bubble as raw `Error` → generic 500 (good for no SQL leak to client) but no constraint-violation → `CONFLICT` mapping, no typed repo errors. Fine at demo scale; product share will want unique-slug → 409. | `packages/db/src/index.ts` is factory-only; repos rethrow implicitly |
| ERR-BE-013 | **P3** | `packages/email` | **Email package never throws / never maps transport errors.** Templates only; all failure handling lives in app service (ERR-BE-002). Kit cannot standardize send failures until transport moves into package. | `packages/email/src/index.ts` |
| ERR-BE-014 | **P3** | success routes · DRY | **`requestId` on success is manual per handler** — easy to omit on new routes. Errors always get requestId via `toApiErrorBody`. Missing success requestId is P3 consistency, not security. | health/auth/me/notes/demo all hand-spread `requestId: c.get('requestId')` |
| ERR-BE-015 | **P3** | tests gaps | **No automated test that `AppError.internal` config messages are redacted on the wire.** Present: unknown Error → no secret in body (unit); unauthorized body has no stack (integration). Absent: production-like missing SESSION_SECRET → HTTP body must be generic `Internal error`; SMTP failure must not claim success; R2 delete failure visibility; Hono 404 envelope; ZodError via `.parse` path. | `errors.test.ts` maps `new Error('secret stack')`; `getSecret` only unit-throws, not via `app.request` |

### Non-findings (healthy)

| Area | Assessment |
|------|------------|
| Unknown error sanitization | **`toApiErrorBody(new Error(...))` → 500 + `INTERNAL_ERROR` + fixed `Internal error`**; unit-tested; no stack in body. |
| Nested error JSON | Matches AGENTS / FE contract: `{ error: { code, message, details? }, requestId }`. |
| Stack placement | Stacks only in `console.error` JSON in `onError` — not in response body. |
| Auth domain errors | `AppError.unauthorized` / generic “Invalid credentials” (no user enumeration message). |
| Not-found / IDOR | Cross-user note → `AppError.notFound` → 404 (no existence leak across subjects). |
| Zod body routes | Login + create-note use `safeParse` → `VALIDATION_ERROR` + `fieldErrors` (good pattern, just not DRY). |
| `json().catch(() => null)` | Intentional invalid-JSON → validation path (not empty swallow). |
| requestId on error path | Always set: middleware or `req_unknown` fallback. Header `x-request-id` exposed via CORS. |
| Package auth crypto | Failures return `false`/`null`, not throw — correct for verify APIs. |
| Product share leakage | No share-domain error codes in kit core. |

### Error flow (current)

```text
throw AppError / Error / other
        │
        ▼
app.onError → onError(err, c)
        │
        ├─ requestId = c.get('requestId') || 'req_unknown'
        ├─ toApiErrorBody(err, requestId)
        │     AppError → status=err.status, message=err.message, details?
        │     else     → 500 INTERNAL_ERROR "Internal error"
        ├─ console.error({ level, requestId, code, message, stack })
        └─ c.json(body, status)
```

### Throw / catch inventory (BE scope)

| Location | Pattern | Verdict |
|----------|---------|---------|
| `core` AppError factories | controlled throws | OK |
| `session-env` getSecret | `AppError.internal` specific msg | **Leak** (ERR-BE-001) |
| `require-auth` / auth service / notes service | `AppError.*` | OK |
| `routes/auth`, `routes/notes` | Zod → `AppError.validation` | OK (dup) |
| `storage` joinObjectKey | `throw new Error` | P2 status (ERR-BE-005) |
| `mcp` asserts | `throw new Error` | P3 boot (ERR-BE-009) |
| `notes` removeNote | bare `catch {}` | Swallow (ERR-BE-004) |
| `email` sendDemoEmail | catch → log → ok true | False success (ERR-BE-002) |
| `auth` verifySession | catch → null | OK fail-closed |
| routes `json().catch` | → null → validation | OK |
| `seed-local` / scripts | process exit on catch | OK CLI |
| `db` / repos | no catch (bubble) | OK + no taxonomy (ERR-BE-012) |

## Metrics

- **Files analyzed (prod TS):** ~30  
  - core: `errors.ts`, `index.ts`  
  - auth: `session.ts`, `keys.ts`, `index.ts`  
  - db/storage/email/mcp: package entry (+ email template)  
  - example-api: app, env, routes×5, middleware×4, services×3, repos×2, lib, seed surfaces (error-relevant)  
- **Test files consulted:** `packages/core/src/errors.test.ts`, `apps/example-api/src/app.test.ts`, storage/mcp tests  
- **Issues:** **15** total · **P0: 0** · **P1: 2** · **P2: 6** · **P3: 7**  
- **Bare / empty catch (prod BE):** 3 meaningful (`verifySession` OK; `removeNote` swallow; `email` fallback) + intentional `json().catch`  
- **`throw new Error` in BE packages/apps (non-AppError):** storage×1, mcp×2, mcp-example boot×1  
- **`AppError` throw sites (example-api + session-env):** auth/login/require/notes/getSecret — consistent domain use  
- **Central Zod mapper:** **0**  
- **Hono `notFound` handler:** **0**  
- **Client stack leak (known paths):** **0** (tests cover unauth path)  
- **requestId on AppError responses:** **yes** (middleware + fallback)

## Recommendations

1. **P1 — Split public vs internal messages in `toApiErrorBody`:** for `status >= 500` (or all `INTERNAL_ERROR`), always emit fixed/i18n-safe client message; put real `err.message` only in `onError` logs. Optionally `AppError.internal({ publicMessage, cause })`.  
2. **P1 — Email:** either surface `{ ok: false, transport, errorCode }` / throw `AppError` when SMTP attempted and failed, or document intentional best-effort and return `transport: 'log'` only when connect is unavailable (not when SMTP dialogue threw).  
3. **P2 — Add `@gosilex/core` helpers:** `fromZodError(err)` / `parseJson(c, schema)` → `AppError.validation` with stable `fieldErrors`; use in all body routes.  
4. **P2 — Storage:** throw `AppError.validation('path traversal rejected')` **or** keep package free of core dep via custom `StoragePathError` mapped in app services to 400.  
5. **P2 — R2 delete:** log warn on failure; only silence known not-found if detectable.  
6. **P2 — `app.notFound`:** return same `ApiErrorBody` with `NOT_FOUND` + requestId + 404.  
7. **P2 — Complete AppError kit:** `cause?`, `rateLimited()`, typed `code: ErrorCodeName`, 4xx vs 5xx log levels.  
8. **P3 — requestId:** mint server-side always, or validate inbound format/length.  
9. **P3 — Tests:** wire missing-secret through `app.request` (expect generic internal body); SMTP fail contract; 404 envelope; optional ZodError path.

## Residual risks / not covered

- FE `ApiError` / toast mapping (→ Errors FE audit).  
- Better Auth swap may change exception types (HTTPException / Response) — not present yet.  
- CF Workers runtime unhandled rejections outside Hono `fetch` path.  
- D1 constraint messages content (could theoretically include schema names if ever stringified into AppError.details — not done today).  
- Rate-limit package absent → no live `RATE_LIMITED` path.  
- Product `share-*` private_key → 404 rule not implementable yet (no product routes).  
- Overlap with Security P05 (SESSION_SECRET message, requestId injection) — kept here for error-contract ownership.
