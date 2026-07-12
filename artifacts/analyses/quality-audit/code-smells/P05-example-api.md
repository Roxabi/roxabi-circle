# Code Smells — P5

**Date:** 2026-07-12  
**Partition:** `apps/example-api/**`  
**Focus:** god files, duplicated `createDb`, DRY middleware, complexity in routes/services  
**Excluded:** `node_modules/`, `coverage/` (metrics only), product `share-*` (absent)

## Summary

`example-api` is a **small, well-layered kit demo**: no production god files, routes stay thin, notes path respects routes → services → repos, and middleware modules are tiny single-purpose files. The main smells are **wiring repetition** (`createDb` ×6 on the request path, imperative `await requireAuth(c)` ×6), **auth service layer inconsistency** (login runs Drizzle + dynamic imports instead of a users repo), and **duplicated D1/SQLite shims** (test vs seed CLI). Services are short; the densest prod module is `services/auth.ts` (~111 LOC). Complexity risk is process/copy-paste debt for the next API clone, not unreadable modules today.

## Findings

| ID | Severity | File | Finding | Evidence |
|----|----------|------|---------|----------|
| SMELL-P5-001 | P1 | `src/routes/{me,notes,demo}.ts` · `middleware/require-auth.ts` | **Auth guard is imperative per-handler, not mounted Hono middleware (DRY + fail-open).** | Six handlers each start with `await requireAuth(c)`. Zero `route.use(...)` / `app.use` for auth. New route without the first line ships unauthenticated. Same pattern as ARCH/SEC-P05-002; as a **code smell** it is repeated ceremony that should be one middleware composition. |
| SMELL-P5-002 | P1 | `routes/{auth,notes,me}.ts` · `middleware/require-auth.ts` | **`createDb(c.env.DB, schema)` reconstructed at ≥6 request call sites.** | Call sites: `require-auth` L11, `auth` login L26, `me` keys L23, notes GET/POST/GET:id/DELETE L20/34/41/53. No `c.set('db', …)` middleware. Every handler re-binds schema; clone of this app multiplies the paste. Notes alone has **four** identical lines. |
| SMELL-P5-003 | P1 | `src/services/auth.ts:42–69` | **Auth service owns SQL for users (no `repos/users`); layer shape inconsistent with keys/notes.** | `loginWithPassword` does `db.select().from(demoUsers).where(eq(...))` after dynamic `import('../db/schema')` + `import('drizzle-orm')`. Keys correctly go through `repos/keys`. AGENTS secondary axis: *services → repos*. One-off ORM in service is the main **complexity / consistency** smell in this partition. |
| SMELL-P5-004 | P2 | `src/test/memory-env.ts` · `scripts/seed-local.ts` | **Near-duplicate D1-shaped SQLite adapters (test + seed CLI).** | Both implement `prepare/bind/first/run/all/raw` + `batch`/`exec` over SQLite (`better-sqlite3` vs `bun:sqlite`). ~40–50 LOC each of structural clone. N×M cost when `share-api` or more CLIs appear. Prefer `@gosilex/db/test` or `tooling/d1-sqlite-shim`. |
| SMELL-P5-005 | P2 | `src/services/email.ts` | **SMTP dialogue + log fallback live in the app (~78 LOC single function); package only supplies template text.** | `sendDemoEmail` builds MIME, probes `globalThis.connect`, writes EHLO/MAIL/RCPT/DATA/QUIT, catches and falls back to `console.log`. Dense single concern, under god-file bar, but **wrong ownership** for kit DRY (also ARCH-P05-009). Second Worker will fork the TCP block. |
| SMELL-P5-006 | P2 | `src/routes/notes.ts` · `src/routes/auth.ts` | **Repeated request-boundary ceremony: parse JSON → safeParse → AppError.validation → createDb → service.** | Login and create-note handlers share the same skeleton (`c.req.json().catch(() => null)` + `safeParse` + `fieldErrors`). Fine twice; a third body-validated route should extract `parseJsonBody(c, schema)` helper. |
| SMELL-P5-007 | P2 | all success handlers under `routes/*` | **Response envelope `requestId: c.get('requestId')` hand-spread on every JSON success.** | Health, auth×2, me×2, notes×4, demo×1 — same field. Errors already go through `toApiErrorBody`. Mild DRY; a `c.jsonWithId(data, status?)` helper or middleware that injects envelope would remove noise (and avoid forgetting `requestId` on a new route). |
| SMELL-P5-008 | P3 | `src/services/auth.ts:15–16,37–40,111` · package.json | **Dead / deprecated surface on the auth service + unused workspace dep.** | `export { hashApiKey, verifyApiKey }` — no app import of those re-exports (only internal `hashApiKey` use). `ensureDemoUser` marked `@deprecated` with **zero** call sites (login uses `ensureDemoUsers` directly). `@gosilex/types` in `package.json` dependencies with **no** `import` under `src/` or `scripts/`. |
| SMELL-P5-009 | P3 | `src/services/auth.ts:50–51` | **Dynamic import of schema/ORM inside login obscures static layer graph.** | `await import('../db/schema')` + `await import('drizzle-orm')` — no meaningful bundle win on this Worker; repos use static imports. Prefer static + users repo (closes SMELL-P5-003). |
| SMELL-P5-010 | P3 | `src/repos/{keys,notes}.ts` · `services/{auth,notes}.ts` · `seed/seed-db.ts` | **`type Db = DrizzleD1Database<typeof schema>` copy-pasted in 5 modules.** | Identical local alias in keys repo, notes repo, auth service, notes service, seed-db. Export `export type AppDb = …` from `db/schema.ts` (or a `db/types.ts`) once. |
| SMELL-P5-011 | P3 | `src/routes/{me,notes}.ts` | **Non-null assertions on `c.get('subject')!` after imperative auth.** | Six uses of `!` assume requireAuth ran and set subject. Correct today if call order held; brittle under refactor. Real middleware + narrowed `Variables` (`subject: string` on protected sub-app) removes `!`. |
| SMELL-P5-012 | P3 | `src/services/notes.ts:15–17` | **Anemic passthrough: `listNotes` service only calls repo.** | `return notesRepo.listNotes(db, subject)` — no policy/mapping. Acceptable for axis demo; if more thin wrappers appear, call repo from a richer service or drop the hop for read-only. Not a layer violation. |
| SMELL-P5-013 | P3 | `src/services/notes.ts:60–64` | **Empty `catch` swallows R2 delete failures.** | `try { await deleteObject(...) } catch { // ignore missing object }` — hides non-missing errors (permission, network). Prefer delete-if-exists helper or narrow “not found” detection. |
| SMELL-P5-014 | P3 | `src/services/auth.ts:61` · route Zod limits | **Magic numbers without named constants.** | Session TTL `60 * 60 * 24 * 7`; note title `max(200)`, body `10_000`, attachment `50_000`; secret min length `32` in `getSecret`. Readable enough; name `SESSION_TTL_SEC`, `MAX_NOTE_*` if product reuses. |
| SMELL-P5-015 | P3 | `src/app.test.ts` (~398 LOC) · `scripts/seed-local.ts` (~126) | **Large test suite file (near threshold); CLI seed is long but single-purpose.** | `app.test.ts` approaches ~400 LOC god-test threshold (health, auth, notes, CORS, IDOR, env helpers in one file). Not prod god-file; split by concern when next scenarios land. Seed CLI length is adapter + logging, not domain complexity. |
| SMELL-P5-016 | P3 | `src/app.test.ts:8–16` | **Scratch-file helper with hard-coded `/tmp/grok-goal-…` path.** | `SCRATCH = process.env.SCRATCH \|\| '/tmp/grok-goal-c818b205ecce/implementer'` + silent write failures. Goal-session residue in kit tests; noise for extract and other machines. Prefer omit or pure `os.tmpdir()` without session id. |

### Non-findings (healthy)

| Area | Assessment |
|------|------------|
| God files (prod) | **None.** Max ~111 LOC (`services/auth.ts`); threshold ~400. |
| Long functions (prod) | **None ≥80 LOC.** Longest: `sendDemoEmail` ~70 body LOC; `seedDemoDatabase` ~55; `loginWithPassword` ~25. |
| Deep nesting | **Low.** Max ~2–3 (`if bearer` / `if token`; SMTP try/connect). |
| Routes → repos | **0 imports.** Notes/me/auth go through services (except auth SQL hole above). |
| Middleware cohesion | Each of 4 middleware files is single-purpose (~10–20 LOC). Not a god middleware stack. |
| `createApp` composition | Thin factory: 3 global middlewares + CORS + `onError` + 5 route mounts. Readable spine. |
| Domain leakage | No product share strings in prod routes/services (demo_* / kit only). |
| Repos complexity | keys/notes repos are pure Drizzle, small, subject-scoped predicates. |
| Index / entry | `index.ts` is 9 LOC Worker fetch export — ideal. |

## Metrics

| Metric | Value |
|--------|------:|
| Files analyzed (src + scripts + package config, excl. node_modules) | **~30** |
| Prod TS modules under `src/` (excl. `*.test.ts`, excl. `test/`) | **22** |
| Test modules | **2** (`app.test.ts`, `seed/seed-db.test.ts`) + `test/memory-env.ts` helper |
| Scripts | **1** (`scripts/seed-local.ts`) |
| Approx. prod source LOC (excl. tests) | **~750–850** |
| Max prod file LOC | **~111** (`services/auth.ts`) |
| Max prod function LOC | **~70** (`sendDemoEmail`) |
| God files (>400 LOC prod) | **0** |
| Functions >80 LOC | **0** |
| `createDb` request-path sites | **6** |
| `await requireAuth(c)` sites | **6** |
| Duplicated D1 SQLite shims | **2** (memory-env, seed-local) |
| `type Db = DrizzleD1Database<…>` copies | **5** |
| Routes → repos imports | **0** |
| Issues total | **16** |
| P0 | **0** |
| P1 | **3** |
| P2 | **4** |
| P3 | **9** |
| Dead/deprecated symbols | **3** (`ensureDemoUser`, re-export `verifyApiKey` unused externally, `@gosilex/types` dep) |
| Nested depth max (prod) | **~3** |

**Inventory:**

```text
apps/example-api/
  package.json, wrangler.toml, tsconfig.json, vitest.config.ts
  migrations/0001_init.sql
  scripts/seed-local.ts          (~126 LOC — D1 shim + seed CLI)
  src/
    index.ts (~9)  app.ts (~47)  app.test.ts (~398)
    env.ts  env.schema.ts  types.ts
    db/schema.ts
    lib/session-env.ts
    middleware/
      error-handler.ts  request-id.ts  require-auth.ts  security-headers.ts
    routes/
      health.ts  auth.ts  me.ts  notes.ts  demo.ts
    services/
      auth.ts (~111)  notes.ts (~67)  email.ts (~78)
    repos/
      keys.ts  notes.ts
    seed/
      demo-data.ts  seed-db.ts  seed-db.test.ts
    test/
      memory-env.ts  (~128 — D1/R2 test doubles)
```

**Coverage signal (context only):** total lines ~**85%**; `services/email.ts` ~**1.7%** — smell of unexercised complexity, not structure. Own domain: test quality.

## Recommendations

1. **Inject DB once + mount auth as middleware (SMELL-P5-001/002, P1)**  
   - Middleware: `c.set('db', createDb(c.env.DB, schema))` with typed `Variables.db`.  
   - `requireAuthMiddleware`: resolve auth, `c.set('subject' | 'authMethod')`, `await next()`.  
   - Mount on protected groups (`notesRoutes.use('*', …)`, `meRoutes`, `demoRoutes`).  
   - Handlers become: parse body → call service with `c.get('db')` / `c.get('subject')` — no `!`, no repeated createDb.

2. **Add `repos/users.ts` and static imports (SMELL-P5-003/009, P1)**  
   - `findByEmail(db, email)` (and optional `findById`).  
   - `loginWithPassword` only orchestrates seed-gate (if kept) + verify + signSession.  
   - Removes dynamic import smell and aligns with keys/notes.

3. **Promote D1 SQLite shim once (SMELL-P5-004, P2)**  
   - Shared helper under `packages/db` test export or monorepo `tooling/`.  
   - seed-local + memory-env import it; raw() differences (bun vs better-sqlite3) parameterized.

4. **Move SMTP/log send into `@gosilex/email` (SMELL-P5-005, P2)**  
   - App: config + `sendEmail(...)`. Shrinks densest network-ish function; kit reuses for share/mailpit.

5. **Small DRY helpers when the third copy appears (SMELL-P5-006/007, P2)**  
   - `parseJsonBody(c, zodSchema)` → throws `AppError.validation`.  
   - Optional `jsonOk(c, data, status?)` adding `requestId`.  
   - Do not abstract after two copies only (A8).

6. **Hygiene pass (P3)**  
   - Drop `ensureDemoUser`, stop re-exporting unused crypto, remove `@gosilex/types` dep or import deliberately.  
   - Export `AppDb` once; name session TTL / body limits if product reuses.  
   - Narrow R2 delete catch; remove session-id scratch path from tests; split `app.test.ts` when next suite lands.

## Residual risks

| Risk | Notes |
|------|--------|
| Clone-as-template multiplies wiring | Without db middleware + auth middleware, every new route re-pastes createDb + requireAuth (highest process smell). |
| Auth SQL hole trains the wrong pattern | Agents/humans copy `loginWithPassword` style into product services instead of repos. |
| Email service rot | Almost untested + app-local SMTP → silent breakage when Mailpit story is dogfooded. |
| Empty catch on R2 delete | Missing object OK; other failures become “success delete” with orphaned rows if DB delete proceeds. |
| Test file growth | IDOR + auth + CORS + env in one file will become a god-test without splits. |
| Envelope forgetfulness | Manual `requestId` on success is easy to omit; clients that require it break unevenly. |
| Cross-domain overlap | Auth middleware fail-open and seed-on-login are also **security** / **architecture** findings — fix once, closes multiple audits. |

**Overall code-smell score for P5:** solid structure, **no god-file emergency**. Treat **P1 wiring/auth-layer** items as the bar before using this app as the `share-api` spine; P2–P3 are cheap polish and extract hygiene.
