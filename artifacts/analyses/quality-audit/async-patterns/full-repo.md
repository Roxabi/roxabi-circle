# Async Patterns — full repo

**Date:** 2026-07-12  
**Repo:** `go-silex/silex-share`  
**Scope:** all `packages/**` + `apps/**` TypeScript/TSX source (exclude `node_modules/`, `coverage/`, generated Wrangler)  
**Focus:** floating promises, missing `await`, race conditions, Workers streaming leaks, unhandled rejections, blocking sleep, AbortSignal absence, concurrent state races  
**Stack context:** Bun monorepo · Hono Workers · D1/R2 · TanStack Query SPA · FastMCP stdio · no product `share-*` apps yet

## Summary

Async health of the Chemin A kit is **generally sound for current surface area**. API handlers almost always `await` services/repos; crypto helpers are properly async (`crypto.subtle`); CLI entrypoints use `main().catch(...)`; React event handlers that fire promises use intentional `void` (not bare floating promises); UI effect cleanups remove `matchMedia` / `keydown` listeners.

There is **no classic `Atomics.wait` / busy-loop / blocking sleep** on the Worker path. The main risks are **cross-store non-atomicity (D1 then R2)**, an **SMTP `connect()` writer path without `finally` cleanup** (streaming leak pattern), **client `fetch`/Query not wired to AbortSignal**, **render-time `queueMicrotask(navigate)` races**, and a few **voided promises without rejection handlers** (clipboard, form submit). No P0 (no production share traffic, no durable multi-tenant store races proven in prod). Severity is kit-template debt that becomes production-grade when `apps/share-*` reuses these patterns.

## Findings

| ID | Severity | File | Finding | Evidence |
|----|----------|------|---------|----------|
| ASYNC-001 | P1 | `apps/example-api/src/services/notes.ts:19–40` | **D1+R2 create is non-atomic — orphan DB row if R2 fails** | `createNote` awaits `notesRepo.createNote` then, if attachment present, `putObject`. R2 throw leaves a note without attachment (or half-written key). No compensating delete / transaction / outbox. Kit demo is small-text only; **frame product** (zip/video/presign) will copy this ordering unless fixed. |
| ASYNC-002 | P1 | `apps/example-api/src/services/notes.ts:57–65` | **R2-then-D1 delete race / partial failure** | `removeNote`: `deleteObject` (errors swallowed) then `notesRepo.deleteNote`. If D1 delete fails after R2 success, attachment is gone while note remains. Inverse of ASYNC-001; same multi-store consistency class. |
| ASYNC-003 | P1 | `apps/example-api/src/services/email.ts:40–66` | **Workers SMTP stream leak on error: no `finally` / no `releaseLock`** | On success: `getWriter()` → writes → `writer.close()` → `socket.close()`. On any mid-write throw, `catch` logs and falls through to log transport **without** releasing the writer or closing the socket. `readable` is never drained (SMTP replies ignored). Pattern: streaming resource leak under Workers `connect()`. |
| ASYNC-004 | P1 | `apps/example-web/src/components/app-shell.tsx:256–280` | **Navigate side-effect during render (AuthGate / AdminGate)** | `AdminGate` / `AuthGate` call `queueMicrotask(() => { void navigate(...) })` **while rendering** when unauthorized, not in `useEffect`. StrictMode + re-renders queue multiple navigations; race with concurrent `me` refetch. Classic concurrent React anti-pattern. |
| ASYNC-005 | P2 | `apps/example-web/src/lib/api.ts:21–30` · all `queryFn`s | **AbortSignal not threaded from TanStack Query → `fetch`** | `apiFetch` accepts `RequestInit` (so `signal` works if passed) but every `queryFn` is `() => apiFetch(...)` — never `({ signal }) => apiFetch(path, { signal })`. Cancelled queries / unmount leave in-flight Worker requests; late responses still hit Query cache (usually OK) but waste edge CPU and can race optimistic UI later. **Zero** `AbortSignal` / `AbortController` usages in packages/apps source. |
| ASYNC-006 | P2 | `apps/example-api/src/seed/seed-db.ts:38–56` · `services/auth.ts:49` | **Concurrent `ensureDemoUsers` TOCTOU on cold start** | Lazy login path: `select all users` → insert missing. Concurrent logins before seed completes can both see empty set and insert same `id`/`email` (UNIQUE) → one path 500s. No transaction / `INSERT OR IGNORE` / unique-conflict → idempotent recovery. Demo-only but pattern for any “lazy bootstrap” on Workers. |
| ASYNC-007 | P2 | `apps/example-web/src/routes/login.tsx:97–139` | **Login submit not de-duplicated (`isPending` / disabled)** | Form `onSubmit` → `void form.handleSubmit()`; submit button has **no** `disabled` during async login. Double-click races two `loginWithPassword` + two session cookies (last `Set-Cookie` wins). Contrasts with notes/keys/email mutations that use `isPending`. |
| ASYNC-008 | P2 | `apps/example-web/src/routes/keys.tsx:32–36,66` | **`void copy()` — clipboard reject = unhandledrejection** | `copy` is `async` and `await navigator.clipboard.writeText` with **no try/catch**; invoked as `onClick={() => void copy()}`. Permission denial / insecure context rejects → unhandled rejection (void only marks intentional fire-and-forget, does not catch). |
| ASYNC-009 | P2 | `apps/example-web/src/routes/login.tsx:102` · `notes.tsx:154` | **`void form.handleSubmit()` without outer rejection boundary** | Login `onSubmit` has try/catch (safe). Notes `onSubmit` awaits `mutateAsync` only; mutation `onError` toasts, but if `handleSubmit` rejects outside that path, `void` still leaves a microtask rejection surface. Prefer `void form.handleSubmit().catch(...)` or disable double submit. |
| ASYNC-010 | P2 | `apps/example-web/src/main.tsx:11–18` · query usages | **No global Query/Mutation error handler; list errors look like empty** | `QueryClient` defaults: `staleTime` / `refetchOnWindowFocus` only — no `QueryCache`/`MutationCache` `onError`. Mutations on notes/keys/dashboard toast on error; **`notes` list query has no `isError` UI** (`notes.tsx:94–108`) so network/auth failure presents as empty list (async UX race with “no data”). |
| ASYNC-011 | P2 | `packages/auth/src/keys.ts:45–91` · login path | **PBKDF2 100k iterations on every login (CPU-bound async, not sleep)** | `verifyPassword` / `hashPassword` use PBKDF2-SHA-256 @ 100_000 iters via `crypto.subtle.deriveBits` (async, non-blocking event loop, but **CPU-heavy** on Workers isolate). Concurrent login storms burn wall-clock / subrequest budget. Not a sync loop; flag for rate-limit + cost when kit hits real traffic. |
| ASYNC-012 | P2 | `apps/example-api/src/services/notes.ts:49–54` · `packages/storage` | **No streaming for object bodies — full `text()` load** | `getNoteWithAttachment` always `await obj.text()`. Kit limits attachment to 50k chars (route Zod) so OK today. Product frame (≤500 MiB video) **must not** copy this; no range/stream/presign helper in `@gosilex/storage` yet. Residual streaming risk class. |
| ASYNC-013 | P3 | `apps/mcp-example/src/index.ts:54–56` | **Possible floating promise on `server.start`** | `if (import.meta.main) { server.start({ transportType: 'stdio' }) }` — result not `await`ed / `.catch`ed. If FastMCP `start` returns a Promise, boot failure is an unhandled rejection (CLI process may still hang on stdio). Scripts that wrap the process use `main().catch` (`stdio-smoke.mjs`). |
| ASYNC-014 | P3 | `biome.json` · no ESLint | **No static gate for floating promises / misused promises** | Biome `recommended` only; no TypeScript-ESLint `@typescript-eslint/no-floating-promises` / `no-misused-promises`. Relying on human review + intentional `void`. Easy regression when agents add fire-and-forget calls. |
| ASYNC-015 | P3 | `apps/example-web/src/components/app-shell.tsx:191–200` | **Intentional `void navigate` / `void logout` in click handlers** | Pattern is correct for React `onClick` (not floating). `logout` internally try/catches API failure then clears cache — **good**. Document as kit convention so agents don’t “fix” by removing `void` or adding bare promises. |
| ASYNC-016 | P3 | packages UI / theme / mobile | **Positive: effect cleanups present** | `use-mobile.ts`, `theme.tsx`, `sidebar.tsx` all `removeEventListener` in effect teardown. No timer leaks in UI kit sources reviewed. |
| ASYNC-017 | P3 | API routes · middleware | **Positive: request path is fully awaited** | `routes/{auth,notes,me,demo}.ts` await `requireAuth`, JSON, services. `requestIdMiddleware` / `securityHeaders` `await next()`. Hono `onError` covers thrown rejections from async handlers. No `waitUntil` background work (nothing to leak post-response yet). |
| ASYNC-018 | P3 | `scripts/check-env-sync.ts` · `seed-local.ts` · smoke | **Positive: CLI entrypoints handle rejection** | `main().catch((err) => { … process.exit(1) })` pattern on tooling scripts. |
| ASYNC-019 | P3 | `apps/example-api/src/index.ts` | **No `waitUntil` / scheduled / queue handlers** | Worker export is `{ fetch: app.fetch }` only. No streaming `Response` bodies from R2. Streaming-leak surface is limited to demo SMTP (ASYNC-003). |

### Cross-cutting map (by concern)

| Concern | Status | Primary locations |
|---------|--------|-------------------|
| Floating promises | Mostly intentional `void`; gaps on clipboard + MCP start | web UI, mcp-example |
| Missing `await` | None found on critical API paths | — |
| Race / concurrent state | Seed TOCTOU, login double-submit, render navigate, D1↔R2 | auth seed, login, gates, notes service |
| Workers streaming leaks | SMTP writer/socket without `finally` | `services/email.ts` |
| Unhandled rejections | Clipboard; potential form/MCP | keys, login/notes, mcp |
| Blocking sleep | **None** | — |
| AbortSignal | **Absent** on all client fetches | `api.ts` + queryFns |
| Concurrent React state | Render-time navigate microtasks | AuthGate / AdminGate |

## Metrics

| Metric | Value |
|--------|------:|
| Source areas analyzed | `packages/{core,auth,db,storage,email,mcp,types,ui}`, `apps/{example-api,example-web,mcp-example}` |
| Approx. production TS/TSX modules reviewed | ~90 (src only; tests spot-checked for patterns) |
| `async function` / awaited I/O call sites | ~50+ across apps/packages |
| Issues total | **19** (incl. positives as P3 documentation) |
| P0 | **0** |
| P1 | **4** (ASYNC-001…004) |
| P2 | **8** (ASYNC-005…012) |
| P3 | **7** (ASYNC-013…019; several are positive notes) |
| Actionable defects (P1+P2, exclude pure positives) | **12** |
| `AbortSignal` / `AbortController` occurrences in packages+apps src | **0** |
| `waitUntil` / scheduled / queue usage | **0** |
| Blocking `sleep` / busy-wait / `Atomics.wait` | **0** |
| Intentional `void` promise sites (web) | **~10** (navigate, logout, form submit, copy) |
| Multi-store (D1+R2) mutating services | **2** (`createNote`, `removeNote`) |
| Effect listener cleanups reviewed | **3** (theme, mobile, sidebar) — all correct |

## Recommendations

1. **P1 — Multi-store notes (001–002):** Fix kit template before product share:
   - Prefer **R2 first then D1** for create with compensating R2 delete on DB failure, **or** D1-first with compensating delete + status column `attachment_pending`.
   - For delete: D1 soft-delete / tombstone first, then R2, then hard-delete (or queue worker). Document ordering in `@gosilex/storage` ADR when share M0 lands.
2. **P1 — SMTP cleanup (003):** Wrap connect path in `try/finally`; `try { await writer.close() } catch {}`; `try { writer.releaseLock() }`; `await socket.close()`. Optionally read/drain `socket.readable` or cancel it. Move transport into `@gosilex/email` with the same finally contract.
3. **P1 — Auth/Admin gates (004):** Move redirects into `useEffect` deps on `me.status` / `isAdmin`; never schedule navigation during render. Consider TanStack Router `beforeLoad` auth check to avoid flash + race.
4. **P2 — AbortSignal (005):**  
   ```ts
   queryFn: ({ signal }) => apiFetch('/api/notes', { signal })
   ```  
   Document in kit: all `apiFetch` call sites from Query/mutations should forward `signal` when available.
5. **P2 — Seed / login races (006–007):** `INSERT OR IGNORE` or catch UNIQUE → re-select; disable login button while `form.state.isSubmitting` / local `pending` flag.
6. **P2 — Unhandled void (008–009):**  
   `onClick={() => { void copy().catch(() => toast.error(...)) }}`  
   Same for form submit if not fully covered by mutation handlers.
7. **P2 — Query errors (010):** Global `QueryCache({ onError })` toast for 5xx; notes list branch `notes.isError` ≠ empty state; 401 → shared sign-out path.
8. **P2 — PBKDF2 / streaming (011–012):** Keep async KDF; add auth rate-limit (AGENTS P1 package). Storage: add stream/presign helpers before any large-object product path — ban `obj.text()` for unbounded keys.
9. **P3 — Tooling (013–014):** `void server.start(...).catch(...)` or top-level await in MCP entry; evaluate `typescript-eslint` floating-promise rule in CI or Biome equivalent when available.
10. **Convention (015–018):** Keep intentional `void` for React handlers; keep `main().catch`; keep effect cleanups — encode in AGENTS “async kit rules” so agents do not regress.

## Residual risks / not covered

| Residual | Why |
|----------|-----|
| Product `apps/share-*` (M0–M6) | Not present; zip unpack, presign commit, concurrent slug 409/replace, private_key races **not audited** — re-run this domain when share lands. |
| Better Auth / session rotation | Interim HMAC only; no concurrent session-list / revoke races. |
| CF Queues / Cron recheck keys | Not implemented (M3+). |
| Real R2 streaming / multipart upload | Kit only stores tiny demo attachments. |
| Browser multi-tab session races | Two tabs mint keys / logout simultaneously — not tested. |
| FastMCP internal concurrency / HTTP transport | stdio-only example; EdgeFastMCP Workers not scaffolded. |
| D1 transaction semantics under multi-statement batch | Drizzle `.run()` per statement; no multi-step TX helpers audited for isolation levels. |
| Dependency internals | Hono / TanStack Query / FastMCP / Wrangler runtime async behavior assumed correct. |
| E2E flakiness (`waitForTimeout` in Playwright smoke) | Script-only; not app runtime. |
| Coverage of email service | Nearly untested (~1.7% in architecture report) — async leak (003) may ship unnoticed. |

**Bottom line:** Kit async correctness is **good enough for demos** with **four P1 template defects** (multi-store ordering, SMTP finally, render-time navigate) that should be fixed before the share product or any second Worker app clones these paths. No floating-promise epidemic; main gap is **cancellation + multi-resource consistency + gate races**, not missing `await` on Hono handlers.
