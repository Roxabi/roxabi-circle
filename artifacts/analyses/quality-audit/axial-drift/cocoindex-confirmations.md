# Cocoindex / semantic confirmation — axial & high-signal findings

**Date:** 2026-07-12  
**Repo:** `/home/mickael/projects/gosilex/silex-share`  
**Write scope:** `artifacts/analyses/quality-audit/axial-drift/` (+ cross-domain note sibling)  
**Primary axial report:** [`axial-adr-review.md`](./axial-adr-review.md)  
**Structural:** [`importlinter-report.md`](./importlinter-report.md)

---

## Method

| Step | Result |
|------|--------|
| `ccc` CLI | **Unavailable** in this subagent (no shell execution surface) |
| cocoindex MCP | Listed as connected in session metadata; **not invocable** via available function tools (no MCP call schema exposed to this worker) |
| Index on disk | **Present:** `.cocoindex_code/` (`settings.yml`, `cocoindex.db/`, `target_sqlite.db`) — index exists but was **not queried** |
| Fallback | **Multi-file ripgrep** + full source reads of package/app surfaces for the 8 priority themes |
| Similarity heuristic | **>0.85** = confirmed-drift · **0.7–0.85** = probable · **<0.6** = discard |
| Note | Similarity scores below are **structural / token-shape estimates** (shared symbols, near-identical adapters, call-site multiplicity), not embedding cosine from `ccc search` |

**Re-run (human/agent with shell):**

```bash
cd ~/projects/gosilex/silex-share
ccc index   # if stale
ccc search "D1 better-sqlite3 adapter prepare bind run all raw"
ccc search "dual auth bearer session cookie resolveAuth"
ccc search "AppError toApiErrorBody path traversal joinObjectKey"
ccc search "SMTP email transport Mailpit sendDemoEmail"
ccc search "ApiError apiFetch credentials include"
ccc search "Hono request id security headers onError middleware"
```

---

## Summary

Prior axial + domain audits are **largely upheld** by multi-file pattern confirmation:

| Theme | Verdict | Score (est.) |
|-------|---------|--------------|
| 1. Duplicated createDb / D1 adapter | **Confirmed-drift** (adapter ×3); createDb factory itself is single kit SSoT | 0.92 adapters · 0.80 wiring |
| 2. Duplicated requireAuth / dual-auth | **Confirmed** dual-path + imperative guard; **discard** “multi-copy requireAuth” | 0.88 path · 0.35 copy |
| 3. AppError vs bare Error | **Confirmed** core SSoT + bare Error in storage/mcp | 0.95 |
| 4. Password/session/API key crypto | **Confirmed** package-only composition; security gaps in package also confirmed | 0.95 compose · 0.90 gaps |
| 5. joinObjectKey / path traversal | **Confirmed** prefix hole + I/O bypass | 0.93 |
| 6. Email transport location | **Confirmed** transport-in-app / templates-in-package | 0.94 |
| 7. ApiError / apiFetch FE | **Confirmed** app-local client; missing kit helpers | 0.90 |
| 8. Middleware package-worthy | **Probable** N×M trap (1 API app today, 0 Hono in packages) | 0.78 |

**Axial ADR takeaway stands:** primary axis is **healthy for extract** (no three-strikes product clones yet); residual is **forward-looking package promotion** before `share-*`, plus one **already-met three-strikes** on the D1 test/seed adapter.

---

## Confirmed (similarity > 0.85)

| ID | Prior IDs | Finding | Similarity | Evidence (multi-file) |
|----|-----------|---------|------------|------------------------|
| CC-001 | SMELL-P3-001 · ARCH-P03-006 · ARCH-P05-015 | **D1-shaped better-sqlite3 adapter triplicated** | **0.92** | Near-identical `prepare` → `bind` / `run` / `all` / `raw` / `first` + `batch` + `exec` in: `packages/db/src/index.test.ts` (`d1FromSqlite` L13–49) · `apps/example-api/src/test/memory-env.ts` (`makeStatement`/`makeD1` L18–66) · `apps/example-api/scripts/seed-local.ts` (`makeStatement`/`openLocalD1` L31–84). Not exported from `@gosilex/db`. **Three-strikes already met** inside monorepo (test package + app harness + CLI). |
| CC-002 | ARCH-P03-016 · ARCH-P05-010 | **`createDb(c.env.DB, schema)` reconstructed on every protected request path** | **0.88** (pattern multiplicity; not source-fork of factory) | Single factory: `packages/db/src/index.ts` L5–7. Request-path call sites: `require-auth.ts` · `routes/auth.ts` · `routes/me.ts` · `routes/notes.ts` ×4 handlers → **≥6** live paths. No `c.set('db')` middleware. |
| CC-003 | ARCH-P05-008 · AX-SEM-OK-01 (compose half) | **Dual-auth is real and single-sourced; guard is imperative not `route.use`** | **0.88** | `resolveAuth` (`services/auth.ts` L88–108): Bearer → `parseBearer` + `hashApiKey` + keys repo; else cookie → `parseCookie` + `verifySession`. `requireAuth` (`middleware/require-auth.ts`) creates DB then calls resolve; thrown `AppError.unauthorized`. Callers: `me.ts`×2, `notes.ts`×4, `demo.ts`×1 — **zero** `app.use`/`route.use` auth mount (`app.ts` only requestId + securityHeaders + cors + onError). |
| CC-004 | AX-SEM-OK-02 · ERR-BE · SMELL-P3-011 · ARCH-P03-017 | **One `class AppError` in kit; domain HTTP throws use it; packages still throw bare `Error`** | **0.95** | `class AppError` only `packages/core/src/errors.ts`. App throws: `AppError.unauthorized/validation/notFound/internal` in session-env, require-auth, auth service, notes, routes. Bare `throw new Error`: `packages/storage` path traversal; `packages/mcp` allowlist asserts; `apps/mcp-example` boot; FE `api.ts` non-envelope HTTP; React context guards (expected). **No local AppError under apps.** |
| CC-005 | AX-SEM-OK-01 · SEC-P02-* | **Crypto lives only in `@gosilex/auth`; app composes; payload/KDF gaps present** | **0.95** compose / **0.90** gaps | Package: `hashPassword` PBKDF2 100k · `hashApiKey` SHA-256 · `signSession`/`verifySession` HMAC · cookie HttpOnly/SameSite=Lax. App `services/auth.ts` imports all crypto from package (no reimplementation). Gaps re-read: `verifySession` only compares `exp` (no typeof/`sub` schema) L68–71; `verifyPassword` accepts `iterations < 1` only (no max) L74–77; `Secure` cookie opt-in L79–85. |
| CC-006 | SEC-P03-001/002 · ERR-BE-005 · AX-SEM-OK-03 | **`joinObjectKey` rejects `..` in parts only; I/O accepts any key** | **0.93** | `packages/storage/src/index.ts` L19–33: prefix = strip slashes only; `..` check only inside `parts` split. L35–50: `putObject`/`getObject`/`deleteObject` pass-through. Consumer `notes.ts` always `joinObjectKey('demo', id, 'attachment.txt')` — safe call site, package hole remains. |
| CC-007 | AX-SEM-004 · ARCH-P03-009 · ARCH-P05-009 · ERR-BE-002 · SMELL-P3-003 | **Email transport in app; package = templates + unused `EmailTransport` type** | **0.94** | Package: `buildDemoEmailText` + `EmailTransport = 'smtp'\|'log'\|'resend'` (`packages/email/src/index.ts`) — **no send function**. App: `sendDemoEmail` ~70 LOC SMTP `connect()` + catch → log + **`ok: true`** (`services/email.ts` L8–77). Compose Mailpit: root `docker-compose.yml`. Env: `SMTP_*` only in example-api schema. |
| CC-008 | AX-SEM-003 · ERR-FE-001…008 | **FE `ApiError` + `apiFetch` only under example-web; incomplete AGENTS §F spine** | **0.90** | Sole `export class ApiError` / `apiFetch` in `apps/example-web/src/lib/api.ts` (credentials include, nested envelope). `isUnauthorized` exported in `lib/auth.ts` L24–26 — **zero call sites**. No `apiErrorToMessage`. Mutations: 4× identical `toast.error(…, { description: String(e) })` (notes×2, keys, dashboard). No QueryCache global onError. No ErrorBoundary. |
| CC-009 | ERR-BE-001 | **`toApiErrorBody` exposes full `AppError.message` including INTERNAL** | **0.91** | `packages/core/src/errors.ts` L49–60 maps `err.message` for all `AppError`. `getSecret` throws `AppError.internal('SESSION_SECRET is required…')` → client body can carry config detail. Unknown `Error` → fixed `"Internal error"` (OK path). |

### Confirmed non-drift / praise (also >0.85 confidence)

| ID | Prior | Statement | Evidence |
|----|-------|-----------|----------|
| CC-OK-01 | AX-SEM-OK-01 | Auth service **does not** reimplement crypto | Only `@gosilex/auth` imports in `services/auth.ts` |
| CC-OK-02 | AX-SEM-OK-02 | No app-local `class AppError` | rg `class AppError` → core only; FE `ApiError` is different class |
| CC-OK-03 | AX-SEM-OK-03 | R2 demo prefix via package join | `joinObjectKey('demo', …)` only; no `share/` product path in storage consumers |
| CC-OK-04 | AX-SEM-OK-04 | MCP tools via package handlers | `packages/mcp` + `mcp-example` registration |
| CC-OK-05 | AX-SEM-OK-05 · importlinter | Packages ↛ apps | rg under `packages/` for `apps/` / example imports → 0 |
| CC-OK-06 | importlinter · ARCH-P03-001 | Hono **absent** from packages (by design today) | rg `from 'hono` under `packages/` → 0 |

---

## Probable (0.7–0.85)

| ID | Prior IDs | Finding | Similarity | Why not confirmed-drift |
|----|-----------|---------|------------|-------------------------|
| CC-P01 | AX-SEM-001 | Platform Hono middleware (request-id, security-headers, onError) is app-local and package-worthy | **0.78** | Only **one** API app today → sibling count 1/3 (not three-strikes). Implementation is thin adapters over `@gosilex/core`, not a full fork. Forward N×M when `share-api` lands. |
| CC-P02 | AX-SEM-002 | `session-env` secret/CORS/Secure cookie policy lives in deployable | **0.76** | Single file under example-api; no second copy. High clone risk, not drift yet. |
| CC-P03 | ARCH-P05-007 · importlinter secondary | Auth login SQL bypasses users repo | **0.82** | One layer breach (`loginWithPassword` dynamic import + `db.select` on `demoUsers`); keys/notes use repos. Secondary axis partial, not multi-app copy. |
| CC-P04 | SMELL-P3-005 · ARCH-P03-012 | MCP exact allowlist triple-checked (package assert + app list + equality) | **0.80** | Over-constraint / DRY smell; not a three-app product fork. |
| CC-P05 | ERR-BE-003 | Zod → validation hand-rolled at each body route | **0.74** | Two routes (login, create-note) same ceremony; no third copy; no shared `fromZodError` in core. |
| CC-P06 | ERR-BE-004 | Bare `catch {}` on R2 delete | **0.80** | Single site (`removeNote`); swallow is real, not multi-file drift. |
| CC-P07 | AX-SEM-005 | `KitRole` mirrored FE/BE | **0.72** | Two independent type aliases (`demo-data.ts`, `example-web/lib/auth.ts`); weak type-level only. |
| CC-P08 | ARCH-P05-013 | Security headers missing HSTS | **0.75** | Single middleware; AGENTS checklist gap, not duplication. |

---

## Discarded (<0.6 or refuted)

| Claim (if implied by scans/audits) | Why discarded | Score |
|------------------------------------|---------------|------:|
| “requireAuth is copy-pasted across apps/packages” | **One** implementation; multiple **call** sites only | 0.30 |
| “Local `class AppError` under apps” | False — only `@gosilex/core` | 0.05 |
| “createDb reimplemented outside package” | Factory only in `@gosilex/db`; apps **call** it | 0.15 |
| “Password/API-key crypto reimplemented in apps” | App only imports package primitives | 0.10 |
| “Three-strikes on FE ApiError / Hono middleware” | Only one SPA + one API app; traps are **probable**, not confirmed three-strikes | 0.40 |
| “Product share domain implemented under packages” | Only ban/guard strings in MCP (`share_`, `artifact`) | 0.20 |
| “Email package fully owns transport” | Opposite of evidence | 0.05 |
| “FE fully implements AGENTS §F (global onError, apiErrorToMessage, fieldErrors)” | Spine half-built only | 0.25 |

---

## Mapping: axial reports ↔ cocoindex/rg support

### [`axial-adr-review.md`](./axial-adr-review.md)

| Axial ID | Supported? | CC ID | Notes |
|----------|------------|-------|-------|
| AX-SEM-001 middleware package-worthy | **Probable** | CC-P01 | 0 Hono in packages; middleware only under example-api |
| AX-SEM-002 session-env | **Probable** | CC-P02 | Single call-site cluster |
| AX-SEM-003 FE ApiError | **Confirmed** (as trap surface) | CC-008 | App-only client class |
| AX-SEM-004 email transport | **Confirmed** | CC-007 | App SMTP vs package template |
| AX-SEM-005 KitRole mirror | **Probable/weak** | CC-P07 | Type-level only |
| AX-SEM-006 test capture helpers | **Not re-scored** | — | Test-only parallel path |
| AX-SEM-OK-01…06 | **Confirmed** | CC-OK-* | Auth compose, AppError SSoT, storage join, MCP, DAG, banlist |

### [`importlinter-report.md`](./importlinter-report.md)

| Structural claim | Supported? | Notes |
|------------------|------------|-------|
| packages compose apps | **Yes** | Workspace deps + import direction |
| packages ↛ apps | **Yes** | rg 0 |
| routes ↛ repos | **Yes** | notes/keys path |
| services → repos partial (users) | **Yes** | CC-P03 |
| no import-linter automation | **Yes** | process/scripts only |
| banlist / extract tree clean | **Assumed prior** | not re-executed scripts (no shell) |

---

## Priority themes (task checklist)

### 1. Duplicated createDb / D1 adapter

```text
@gosilex/db createDb  ── single factory (OK)
        │
        ├── example-api routes/middleware  ── N× createDb per request (wiring debt)
        │
        └── D1 shims ×3 (CONFIRMED-DRIFT):
              packages/db test d1FromSqlite
              example-api memory-env makeD1
              seed-local makeStatement
```

**Action:** export `createMemoryD1` / `d1FromSqlite` from `@gosilex/db/test` (or tooling); optionally `c.set('db')` middleware in API template.

### 2. requireAuth / dual-auth

- Dual-auth **confirmed** and correctly package-composed for crypto.  
- Imperative guard **confirmed** (omit-once risk).  
- **Not** multi-file duplicated auth middleware.

### 3. AppError vs bare Error

- HTTP domain: AppError — good.  
- storage/mcp: bare Error — confirmed style fragmentation (maps to 500 if ever on HTTP path).

### 4. Crypto patterns

- Composition axis aligned.  
- Security package findings (immortal session if no `exp`, unbounded PBKDF2 iters, Secure default off) **confirmed by source read**.

### 5. joinObjectKey / traversal

- Prefix bypass + raw-key I/O **confirmed**.

### 6. Email transport location

- App owns send; package owns template + dead type **confirmed**.

### 7. ApiError / apiFetch FE

- App-local, credentials include OK; missing mapper / 401 / global Query onError **confirmed**.

### 8. Middleware package-worthy

- **Probable** promote-before-share-api: `requestIdMiddleware`, `securityHeaders`, `onError` (+ optional auth middleware + db-on-context).

---

## Metrics

| Metric | Value |
|--------|------:|
| Priority themes | 8 |
| Confirmed findings | 9 (+ 6 OK/praise) |
| Probable | 8 |
| Discarded claims | 8 |
| Three-strikes already met | **1** (D1 sqlite adapter) |
| Confirmed three-strikes platform apps | **0** (insufficient siblings) |
| `ccc` searches executed | **0** (fallback) |
| Source files read for confirmation | ~20 |
| rg multi-pattern sweeps | 8 themes |

---

## Recommendations (confirmation-backed only)

1. **Before second API app:** promote D1 memory adapter (**CC-001** already three-strikes).  
2. **Before share-api:** promote Hono platform middleware + session-env policy (**CC-P01/P02**) or ADR-accept debt.  
3. **Before share-web:** promote `apiFetch`/`ApiError`/`apiErrorToMessage` (**CC-008**).  
4. **Email:** move transport behind `@gosilex/email` when second send path appears (**CC-007**); fix false-success SMTP fallback.  
5. **Security harden (not axial but confirmed):** joinObjectKey prefix (**CC-006**); verifySession shape + PBKDF2 bounds (**CC-005**); redact INTERNAL messages (**CC-009**).  
6. **Auth guard:** convert `requireAuth` to `route.use` middleware (**CC-003**) so new routes cannot ship open.  
7. **When shell available:** re-run `ccc search` block in Method and replace estimated scores with real embedding similarities if any diverge.

---

## Residual / method limits

- No embedding similarity numbers from cocoindex — treat **0.7x/0.9x** as code-structure proxies.  
- Did not re-run banlist/extract-dry-run/CI.  
- Did not index-refresh `.cocoindex_code/`.  
- Product `share-*` apps still absent → most N×M traps remain **prospective**.  
- Companion: [`../cocoindex-cross-domain.md`](../cocoindex-cross-domain.md) for security/DRY cross-cuts.
