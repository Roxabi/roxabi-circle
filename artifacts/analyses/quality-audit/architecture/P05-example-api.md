# Architecture — P5 example-api

**Date:** 2026-07-12  
**Partition:** `apps/example-api/**`  
**Scope:** Hono composition, middleware stack, env schema, secondary axis **routes → services → repos**, package composition vs local reimplementation, god files, extractibility (no share product domain)  
**Excluded:** `node_modules/`, `coverage/` (metrics only), generated Wrangler state  
**Refs:** AGENTS.md layers §K · stack §A/D/F · ADR-0001 · P03 (db/storage/email) · goal Chemin A boilerplate

## Summary

`@gosilex/example-api` is a **credible kit reference app**: small surface, factory `createApp()`, layered folders, dual auth (session cookie + `sk_`), D1/R2 demo notes, and **zero product-share domain** in schema/keys/copy (R2 prefix `demo/`, tables `demo_*`). Package composition is correct on the happy path — `@gosilex/core` errors, `@gosilex/auth` crypto/cookies, `@gosilex/db` factory, `@gosilex/storage` object keys, `@gosilex/email` template only.

Architecture debt clusters around **secondary-axis purity and wiring**, not domain leakage:

1. **Auth service SQL bypasses repos** (`demo_users` queried in `services/auth.ts`) while notes/keys follow repos.  
2. **Routes own `createDb` + schema** on every handler; no `c.set('db')` / middleware DI.  
3. **`requireAuth` is imperative** (`await requireAuth(c)` per handler), not `route.use(middleware)` — omit once → open endpoint.  
4. **SMTP/log transport lives entirely in the app** (~60 LOC) while `@gosilex/email` only builds text (P03-009 echo).  
5. **Env Zod schema is inventory/SSoT for tooling**, not a runtime Worker gate.

No god production modules, no cycles, extractibility for kit demos is **strong**. Severity: **no P0**; fix layer holes and auth middleware shape before cloning this app as the product spine.

## Findings

| ID | Severity | File | Finding | Evidence |
|----|----------|------|---------|----------|
| ARCH-P05-001 | — | `src/app.ts`; `src/index.ts` | **Positive:** Hono app composition is a single factory; Worker entry is thin | `createApp()` wires global middleware + `app.route` for five route modules; `index.ts` only `export default { fetch: app.fetch }` + re-export. Tests import the **same** `createApp` (no test-only app). |
| ARCH-P05-002 | — | `src/routes/*` → `services/*` → `repos/*` | **Positive (notes path):** notes stack respects secondary axis | `routes/notes.ts` → `notesService.*` → `repos/notes.ts`; R2 only in service via `@gosilex/storage`. Routes never import `repos/*`. |
| ARCH-P05-003 | — | schema · R2 · tests · seed comments | **Positive: extractibility / no share product domain** | Tables `demo_notes` / `demo_users` / generic `api_keys`; R2 `joinObjectKey('demo', id, …)`; `app.test.ts` asserts keys never `share/`; `demo-data.ts` documents “No product/share domain”. Grep of src: only meta comments / test ban, no slug/ACL/artifact product types. |
| ARCH-P05-004 | — | `middleware/error-handler.ts`; `@gosilex/core` | **Positive:** centralized errors; no local `AppError` reimplementation | `onError` → `toApiErrorBody` + structured `console.error` with stack **server-side only**; JSON body nested `{ error, requestId }`. |
| ARCH-P05-005 | — | `lib/session-env.ts`; `app.test.ts` | **Positive:** SESSION_SECRET fail-closed; cookie Secure env-aware | Missing/production/staging without secret throws `AppError.internal`; Secure cookie true outside explicit `development`\|`test`. Covered by unit tests in `app.test.ts`. |
| ARCH-P05-006 | — | `app.ts` CORS | **Positive:** credentials CORS with **allowlist**, no origin reflect | `corsAllowlist` + callback returns `null` for unknown Origin; test “CORS rejects unknown Origin”. |
| ARCH-P05-007 | P1 | `src/services/auth.ts:49–56` | **Layer breach: service runs Drizzle against `demoUsers` (no users repo)** | `loginWithPassword` does `db.select().from(demoUsers).where(eq(...))` with dynamic `import('drizzle-orm')` / `import('../db/schema')`. Keys path correctly uses `repos/keys`; users path is inconsistent. AGENTS: *services → repos; repos may use `@gosilex/db`*. |
| ARCH-P05-008 | P1 | `src/routes/{me,notes,demo}.ts` · `middleware/require-auth.ts` | **Auth is not Hono middleware — per-handler `await requireAuth(c)`** | Zero `app.use` / `route.use` for auth. Six protected handlers must each remember the call. New route copy-paste without `requireAuth` ships **unauthenticated** (silent fail mode for humans/agents). Prefer `notesRoutes.use('/api/notes/*', requireAuthMw)` or equivalent. |
| ARCH-P05-009 | P1 | `src/services/email.ts` · `@gosilex/email` | **Transport reimplemented in app; package only supplies template** | App: raw Workers `connect()` SMTP dialogue + log fallback (~60 statements). Package: `buildDemoEmailText` only. Matches P03-009; second Worker app will fork this block. AGENTS H2: abstract behind `@gosilex/email`. |
| ARCH-P05-010 | P2 | `routes/auth.ts`, `routes/notes.ts`, `routes/me.ts`, `middleware/require-auth.ts` | **`createDb(c.env.DB, schema)` reconstructed at ≥6 request call sites** | No middleware that `c.set('db', createDb(...))`. Every handler re-binds schema. Secondary axis still “works” (SQL in repos/services) but **wiring debt** multiplies on clone (also P03-016). |
| ARCH-P05-011 | P2 | `src/env.schema.ts` · `src/index.ts` · `src/app.ts` | **Env Zod SSoT is not a runtime gate on Worker bootstrap** | Schema all-optional; `parseWorkerStringEnv` only re-exported. Live fail-closed is `getSecret` only. Tooling: `scripts/check-env-sync.ts` imports `WORKER_STRING_ENV_KEYS` — good inventory, weak request-time validation for SMTP/CORS typos. |
| ARCH-P05-012 | P2 | `package.json` | **Dead workspace dependency `@gosilex/types`** | Declared in `dependencies` but **no** `import` from `@gosilex/types` under `src/` or `scripts/`. Types flow via `@gosilex/core` re-exports if needed. Inflates graph / extract noise. |
| ARCH-P05-013 | P2 | `middleware/security-headers.ts` | **Security headers incomplete vs AGENTS checklist (no HSTS)** | Sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `X-XSS-Protection: 0`. No `Strict-Transport-Security` (AGENTS I / ShipFast extras). Acceptable for pure local HTTP demo; staging/prod kit template should env-gate HSTS. |
| ARCH-P05-014 | P2 | routes mutations · AGENTS §D CSRF | **No Origin/CSRF check on state-changing routes** | Relies on cookie `SameSite=Lax` + CORS allowlist. AGENTS: “SameSite + vérif Origin sur mutations”. Cross-site form POSTs from allowlisted siblings still need product policy; kit demo under-documents the gap. |
| ARCH-P05-015 | P2 | `src/test/memory-env.ts` · `scripts/seed-local.ts` | **D1-shaped SQLite adapters duplicated (test + seed CLI)** | Near-identical `prepare/bind/run/all/raw` shims vs package db tests (P03-006). N×M cost when `share-api` appears. Promote shared test helper under `@gosilex/db/test` or `tooling/`. |
| ARCH-P05-016 | P2 | `middleware/request-id.ts` | **Client-supplied `x-request-id` accepted without format/length bound** | `incoming?.trim() \|\| newRequestId()` — untrusted ID echoes into logs/JSON. Risk is log injection / length abuse more than auth. Prefer allowlist `^req_[a-zA-Z0-9_-]{8,64}$` or always mint server-side and only *accept* if valid. |
| ARCH-P05-017 | P3 | `package.json` zod · AGENTS | **Zod major drift vs stack SSoT** | App depends on `zod@^3.25.0`; AGENTS freezes **Zod 4**. Functional OK; extract/docs claim mismatch. |
| ARCH-P05-018 | P3 | `services/auth.ts:50–51` | **Dynamic import of ORM/schema inside login** | `await import('../db/schema')` + `await import('drizzle-orm')` — no tree-shaking win on Workers bundle of this size; obscures static layer graph and type edges. Prefer static imports like repos. |
| ARCH-P05-019 | P3 | `seed/seed-db.ts` | **Seed writes tables via Drizzle directly (bypasses repos)** | Acceptable for bootstrap, but means insert/delete semantics for users/notes/keys exist in **two** places (repos vs seed). Prefer seed → repo helpers when repos grow. |
| ARCH-P05-020 | P3 | AGENTS Better Auth · this app | **Auth demo is custom `@gosilex/auth` primitives, not Better Auth** | Password + HMAC session + sk_ mint — intentional kit demo (B3). Document as *pre–Better Auth composition proof* so agents don’t “fix” by bolting Clerk/Better Auth incorrectly later without replacing this path deliberately. |
| ARCH-P05-021 | P3 | coverage · `services/email.ts` · `routes/demo.ts` | **Demo email path almost untested (architecture residual)** | Coverage summary: email service **~1.7%** lines; demo route **~56%**. Architecture of dual transport (smtp/log) is unproven in CI — risk of silent rot when extracting Mailpit story. |

### Layer map (as implemented)

```text
index.ts          → createApp().fetch
app.ts            → middleware stack + mount routes
middleware/       → requestId, securityHeaders, cors (global);
                    requireAuth (imperative helper, not mounted);
                    onError
routes/           → Zod at boundary · createDb · services · requireAuth
services/         → repos (notes/keys) · storage · auth package · email package
                    ⚠ auth login: direct SQL on demo_users
repos/            → drizzle-orm + schema only (no services/routes)
db/schema.ts      → demo domain tables (kit-generic)
seed/             → fixtures + seedDemoDatabase (direct SQL)
lib/session-env   → env policy helpers (secret/cors/cookie)
```

### Middleware stack (order)

| # | Middleware | Scope | Notes |
|---|------------|-------|--------|
| 1 | `requestIdMiddleware` | `*` | Accepts client `x-request-id` or mints `newRequestId()` |
| 2 | `securityHeaders` | `*` | Post-`next()` header mutation |
| 3 | `cors(...)` | `*` | Allowlist + `credentials: true` |
| 4 | `onError` | app-level | `@gosilex/core` mapping |
| — | `requireAuth` | **not global** | Manual per protected handler |

### Package composition vs local code

| Concern | Kit package | App-local | Assessment |
|---------|-------------|-----------|------------|
| AppError / requestId / wire body | `@gosilex/core` | thin middleware | **Compose** ✓ |
| Session sign/cookie / sk_ hash / password | `@gosilex/auth` | orchestration in `services/auth` | **Compose** ✓ |
| Drizzle D1 factory | `@gosilex/db` | schema + repos + multi `createDb` | **Compose** + wiring debt |
| R2 put/get/delete/key join | `@gosilex/storage` | notes service only | **Compose** ✓ |
| Email template | `@gosilex/email` | full SMTP/log send | **Local reimplementation** ✗ |
| ErrorCode types | `@gosilex/types` | unused direct import | **Dead dep** |
| Security headers / CORS policy / env fail-closed | — | local middleware/lib | OK for app (could promote later) |
| D1 memory / seed SQLite shim | — | `test/` + `scripts/` | OK short-term; promote on 2nd app |

### God files

| File | Approx. LOC / coverage lines | God? |
|------|------------------------------|------|
| `services/auth.ts` | ~111 / 100 stmts | No |
| `services/email.ts` | ~78 / 60 | No (dense, single concern) |
| `services/notes.ts` | ~67 / 51 | No |
| `routes/notes.ts` | ~57 / 49 | No |
| `app.test.ts` | ~400+ | Test suite — out of god-file product rule |
| `scripts/seed-local.ts` | ~126 | CLI glue — acceptable |
| All other prod modules | ≪ 50 | No |

**Threshold used:** >400 LOC production module = god candidate. **None** in prod `src/`.

## Metrics

| Metric | Value |
|--------|------:|
| Prod TS modules under `src/` (excl. tests) | **24** (app, index, env×2, types, schema, session-env, 4 middleware, 5 routes, 3 services, 2 repos, 2 seed, memory-env is test-only) |
| Route modules | **5** (health, auth, me, notes, demo) |
| Service modules | **3** |
| Repo modules | **2** (keys, notes — **no users repo**) |
| Middleware modules | **4** |
| Migrations | **1** (`0001_init.sql`) |
| Workspace runtime deps used in src | `auth`, `core`, `db`, `email`, `storage` |
| Workspace runtime deps unused | **`types`** |
| `createDb` request-path call sites | **6** (1 middleware + 1 auth + 1 me + 3 notes handlers; notes has 4 handlers with createDb on 4) |
| Routes → repos imports | **0** |
| Services → routes imports | **0** |
| Packages → this app | **0** (axial clean) |
| Share product domain strings (prod) | **0** (meta/test only) |
| God prod files (>400 LOC) | **0** |
| Coverage (existing summary, lines) | **85.14%** total · email **1.66%** · index **0%** |
| Issues total (excl. pure positives) | **15** |
| P0 | **0** |
| P1 | **3** |
| P2 | **7** |
| P3 | **5** |

**Inventory (source tree):**

```text
apps/example-api/
  package.json, wrangler.toml, tsconfig.json, vitest.config.ts
  migrations/0001_init.sql
  scripts/seed-local.ts
  src/
    index.ts, app.ts, app.test.ts
    env.ts, env.schema.ts, types.ts
    db/schema.ts
    lib/session-env.ts
    middleware/{error-handler,request-id,require-auth,security-headers}.ts
    routes/{auth,demo,health,me,notes}.ts
    services/{auth,email,notes}.ts
    repos/{keys,notes}.ts
    seed/{demo-data,seed-db,seed-db.test}.ts
    test/memory-env.ts
```

## Recommendations

1. **Close the users repo hole (ARCH-P05-007, P1)**  
   - Add `repos/users.ts` (`findByEmail`, optional `findById`) and call it from `loginWithPassword`.  
   - Static-import drizzle/schema like other repos (also ARCH-P05-018).

2. **Promote `requireAuth` to real Hono middleware (ARCH-P05-008, P1)**  
   - `export const requireAuthMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => { …; await next() }`.  
   - Mount on route groups: `meRoutes.use('/api/me', …)`, `notesRoutes.use('/api/notes/*', …)`, etc.  
   - Keeps handlers free of the forgettable first line.

3. **Move SMTP/log send into `@gosilex/email` (ARCH-P05-009 / P03-009, P1)**  
   - App should pass env transport config + call `sendEmail(...)`.  
   - Unblocks Mailpit demo test without app-level TCP dialogue.

4. **Inject DB once per request (ARCH-P05-010, P2)**  
   - Middleware: `c.set('db', createDb(c.env.DB, schema))` with typed `Variables`.  
   - Routes/services take `c.get('db')` — still no route→repo jump.

5. **Hygiene pass (P2–P3)**  
   - Drop unused `@gosilex/types` dep or import `ErrorCode` explicitly for wire docs.  
   - Optional HSTS when `ENVIRONMENT` is production/staging.  
   - Bound/validate incoming `x-request-id`.  
   - Align Zod major with monorepo when core upgrades.  
   - Cover `POST /api/demo/email` (log transport path) in `app.test.ts`.

6. **Document CSRF posture for kit consumers**  
   - SameSite=Lax is the demo bar; product APIs under separate origins need Origin check middleware before copy-paste.

## Residual risks

| Risk | Notes |
|------|--------|
| Unauthenticated route on feature add | Imperative `requireAuth` + agent/human speed → highest process risk until middleware-mounted. |
| SMTP best-effort without full dialogue parse | Workers `connect` path does not read server replies; works against lenient Mailpit, may fail stricter MTAs. |
| Lazy `ensureDemoUsers` on every login | Demo-only; must not ship as product user provisioning. |
| Session secret fallback in development | Documented; wrong `ENVIRONMENT` on a public deploy would still fail closed if not `development`\|`test`. |
| `api_keys` table is kit-generic name | Fine for extract; product apps may share naming — consider prefix later if multi-tenant D1 shared (not current design). |
| Better Auth later | Replacing custom session with Better Auth will rewrite `services/auth` + cookie shape; keep `@gosilex/auth` primitives as low-level or migrate package. |
| Client `x-request-id` in logs | Correlate carefully; treat as untrusted label until sanitized. |
| Extract of monorepo | Dropping `apps/share-*` only: this app stays as kit proof — already free of share strings; dead `@gosilex/types` dep is the main package.json noise. |

**Overall architecture score for P5:** **solid kit spine** with clear Hono composition and clean notes vertical; **secondary axis incomplete on auth**, **auth mounting is footgun-prone**, and **email transport is the largest package-vs-local gap**. Ready as extractible example once P1 items are closed or explicitly accepted as demo debt in AGENTS.
