# Security — P5 example-api

**Partition:** `apps/example-api/**` (src, migrations, seed, scripts, wrangler)  
**Date:** 2026-07-12  
**Scope:** Authz on every route · session cookies CSRF/CORS/Origin · API key handling · IDOR · SQL via Drizzle · R2 path abuse · seed credentials · error leakage · security headers · rate limits · demo auth strength  
**Out of scope:** Package-level crypto internals (→ Security P2); product `share-*`; SPA CSRF UX (→ P6) except where API contract is involved  
**Auditor posture:** read-only on sources; write only this report  
**Threat model note:** App is the **kit demo Worker**, not production share. Findings still treat “deploy this Worker as-is on the public Internet” as a realistic footgun for a template.

## Summary

`@gosilex/example-api` implements a **small dual-auth demo** (HttpOnly `gosilex_session` cookie **or** Bearer `sk_`) over Hono on Cloudflare Workers with D1 notes + R2 attachments under prefix `demo/`. Core access control on notes is **correct**: every mutating/read note path calls `requireAuth`, repos filter by `subject`, missing/cross-user notes return **404 NOT_FOUND** (no existence leak across tenants), and integration tests cover IDOR isolation (A vs B). CORS uses an **explicit origin allowlist** with `credentials: true` and does not reflect arbitrary `Origin`. Client error bodies go through `@gosilex/core` `toApiErrorBody` (no stack to clients). SQL is Drizzle-parameterized; R2 keys go through `joinObjectKey` (traversal rejected at package level). Session secret policy is **fail-closed** outside explicit `development`|`test`.

There is **no P0 remote crypto break** in isolation (forging sessions still needs `SESSION_SECRET`; API keys are high-entropy hashed). The highest-impact issues are **process / template footguns and missing app-layer controls**:

1. **Known demo users + passwords are auto-seeded on every login** (`ensureDemoUsers`), with **no `ENVIRONMENT` gate** — any public deploy of this app yields fixed admin credentials.  
2. **Auth is imperative per-handler**, not mounted middleware — one omitted `await requireAuth(c)` ships an open route.  
3. **No rate limiting** on login / key mint / email / write paths (auth brute-force + mint spam).  
4. **No Origin verification on mutations** despite AGENTS cookie/CSRF guidance (relies almost entirely on `SameSite=Lax`).  
5. **API keys never expire; mint is unlimited; no revoke/list API** despite `revoked_at` column.  
6. **Security headers baseline incomplete** (no HSTS/CSP/Permissions-Policy).  
7. **RBAC role is cosmetic on the API** (`roleForSubject` from seed map only; no server gate).

**Bottom line:** IDOR and dual-auth happy paths are solid for a kit demo. Harden **demo seed gating**, **auth middleware shape**, **login rate limits**, **Origin on mutations**, and **key lifecycle** before treating this Worker as a production-shaped spine.

## Findings

| ID | Severity | File | Finding | Evidence |
|----|----------|------|---------|----------|
| SEC-P05-001 | **P1** | `src/services/auth.ts` · `src/seed/seed-db.ts` · `src/seed/demo-data.ts` | **Demo users with known passwords are inserted on every successful login path, regardless of `ENVIRONMENT`.** `loginWithPassword` always `await ensureDemoUsers(db)` → `seedDemoDatabase({ notes: false })`, which inserts `SEED_USERS` if missing. Passwords are fixed public strings (`demo-password-change-me`, `demo-password-b-change-me`); primary user is **admin**. Staging/prod deploy without wiping seed still allows login with published credentials. Seed is intentional for local DX, but **unconditional runtime seed is a deploy footgun**. | ```42:49:apps/example-api/src/services/auth.ts``` · ```86:89:apps/example-api/src/seed/seed-db.ts``` · ```23:35:apps/example-api/src/seed/demo-data.ts``` |
| SEC-P05-002 | **P1** | `src/middleware/require-auth.ts` · `src/routes/{me,notes,demo}.ts` | **Authorization is not Hono middleware — each handler must remember `await requireAuth(c)`.** Six protected handlers; zero `route.use(...)`. Omission fails open (unauthenticated access). Architecture audit ARCH-P05-008; security impact is **default-open on human/agent copy-paste**. | Imperative calls in me/notes/demo only; `app.ts` mounts no auth middleware. |
| SEC-P05-003 | **P1** | login · `POST /api/keys` · notes write · demo email | **No rate limiting / lockout / backoff on auth-sensitive or abuse-prone endpoints.** Login is pure password verify (PBKDF2 cost only); mint has no per-subject cap; notes/email unbounded beyond body Zod sizes. AGENTS lists rate-limit as P1 package; app has **zero** integration. Enables credential stuffing against demo (and any future real users) and key-table growth DoS. | No imports of rate-limit; routes have no counter/KV/D1 throttle. |
| SEC-P05-004 | **P1** | `src/routes/me.ts` · `src/services/auth.ts` · `src/repos/keys.ts` | **API key lifecycle incomplete: mint only; no expiry; no revoke/list; mint allowed with existing `sk_`.** Schema has `revoked_at` and repo filters `isNull(revokedAt)`, but nothing sets revoke. Keys live forever. Bearer auth can call `POST /api/keys` → stolen key multiplies. Acceptable for tiny demo; **unsafe pattern to clone into product** without TTL + revoke + session-only mint policy. | ```21:30:apps/example-api/src/routes/me.ts``` · ```75:86:apps/example-api/src/services/auth.ts``` · ```14:20:apps/example-api/src/repos/keys.ts``` |
| SEC-P05-005 | **P2** | mutations on cookie session · `app.ts` · AGENTS §D | **No Origin (or CSRF token) check on state-changing routes.** Stack relies on `SameSite=Lax` + CORS allowlist. AGENTS: “SameSite + vérif Origin sur mutations”. SameSite blocks most cross-site cookie **sends** on POST, but: (1) lax gaps / older browsers / non-browser clients; (2) **login CSRF** can still force a victim browser into attacker session via cross-site form POST (response `Set-Cookie` applies); (3) any future `SameSite=None` multi-subdomain setup is unprotected. | CORS only in `app.ts`; auth/notes/keys/demo routes never inspect `Origin`/`Referer`. |
| SEC-P05-006 | **P2** | `src/middleware/security-headers.ts` | **Security headers incomplete vs AGENTS / ShipFast baseline.** Present: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `X-XSS-Protection: 0` (correct modern choice). **Missing:** `Strict-Transport-Security` (env-gated), CSP (API JSON may be light, still useful for mistake HTML), `Permissions-Policy`, `Cross-Origin-Resource-Policy` / `Cross-Origin-Opener-Policy`. | ```3:8:apps/example-api/src/middleware/security-headers.ts``` |
| SEC-P05-007 | **P2** | `src/seed/demo-data.ts` · `scripts/seed-local.ts` · `services/auth` re-exports | **Demo auth strength is intentionally weak and public.** Fixed emails/passwords in source; seed CLI prints plaintext passwords; `DEMO_PASSWORD*` re-exported for tests. Combined with SEC-P05-001, this is not “secret knowledge”. Kit-OK only if **runtime seed is env-gated** and deploy docs say “never public without replace”. Password policy on login Zod is `min(1)` only (verify path — fine). | ```23:35:apps/example-api/src/seed/demo-data.ts``` · seed-local logs passwords · `export { DEMO_EMAIL, DEMO_PASSWORD, ... }` |
| SEC-P05-008 | **P2** | `src/seed/demo-data.ts` · `routes/me.ts` | **“RBAC” is client-informative only — no server-side role enforcement.** `roleForSubject` maps seed IDs (`user_demo` → admin) or default `user`; returned on `GET /api/me`. No route checks `admin`. Any subject with valid session/key has full note + key-mint + demo-email power. Risk: SPA may trust `role` for UI gates while API is flat; product clone must not assume API RBAC exists. | ```65:68:apps/example-api/src/seed/demo-data.ts``` · me route returns role only. |
| SEC-P05-009 | **P2** | `src/lib/session-env.ts` · `middleware/error-handler` · `toApiErrorBody` | **Misconfiguration errors can leak operational detail to clients.** `getSecret` throws `AppError.internal('SESSION_SECRET is required (min 32 chars)…')`. `toApiErrorBody` exposes `AppError.message` as public JSON. Fail-closed is correct; message should be generic for clients (`Internal error`) with detail only in logs. | ```19:28:apps/example-api/src/lib/session-env.ts``` · core `toApiErrorBody` AppError branch. |
| SEC-P05-010 | **P2** | `src/services/auth.ts` (`resolveAuth`) · package P2 | **Session acceptance inherits package gaps (payload shape / immortal session if `exp` missing after valid HMAC).** App trusts `verifySession` → `payload.sub` without re-validating `exp` type, user still exists in D1, or email match. Package SEC-P02-001 applies at app boundary. No server-side session store → **no logout revocation** until cookie Max-Age / `exp` (logout only clears client cookie). | ```102:106:apps/example-api/src/services/auth.ts``` · logout is Set-Cookie clear only. |
| SEC-P05-011 | **P2** | `src/services/email.ts` · `routes/demo.ts` | **Authenticated email spam path with weak transport controls.** Any authed subject can `POST /api/demo/email` unbounded. Recipient fixed to `DEMO_USER_EMAIL` (good — not user-controlled RCPT). SMTP uses Workers `connect()` without SMTP AUTH; falls back to logging full body. Fine for Mailpit; mis-set `SMTP_HOST` in a real env could talk to unintended SMTP. Almost **untested** (~1.7% lines) → regressions invisible. | ```8:11:apps/example-api/src/routes/demo.ts``` · email service SMTP/log. |
| SEC-P05-012 | **P2** | `src/app.test.ts` coverage gaps | **Security-relevant negative tests incomplete at app layer.** Present: unauth notes 401, bad password, bad Bearer, CORS reject, IDOR A/B, Secure cookie staging, getSecret fail-closed, no stack in error JSON, validation 400. **Absent:** Origin/CSRF on mutations; rate-limit (N/A); ensureDemoUsers gated off in production-like env; key mint flood; revoke; session without exp; logout clears cookie flags; bearer-wins-over-cookie precedence; short SESSION_SECRET rejected; health not requiring auth (document); malformed JSON login; oversized attachment; path-traversal note id. | Test file cases through IDOR; no production seed-gate test. |
| SEC-P05-013 | **P3** | `src/middleware/request-id.ts` | **Client-controlled `x-request-id` accepted without format/length bound.** Echoed in headers, JSON bodies, and error logs → log injection / correlation pollution / huge header DoS. Prefer mint always, or allowlist `^req_[A-Za-z0-9_-]{8,64}$`. | ```14:17:apps/example-api/src/middleware/request-id.ts``` |
| SEC-P05-014 | **P3** | `src/app.ts` CORS | **Missing `Origin` → callback returns first allowlist entry as ACAO.** Unusual for non-browser clients; not classic CORS misconfig (unknown origins return `null`). Document that credentialed browser cross-origin always sends Origin. | ```26:29:apps/example-api/src/app.ts``` |
| SEC-P05-015 | **P3** | `src/services/auth.ts` login | **User enumeration via timing / flow.** Missing user returns 401 after DB miss; existing user runs PBKDF2. Same generic message (`Invalid credentials`) — good for content oracle; timing still differs. Acceptable for demo; product should pad. | ```52:56:apps/example-api/src/services/auth.ts``` |
| SEC-P05-016 | **P3** | `src/services/notes.ts` · `@gosilex/storage` | **R2 path mostly safe; throw on traversal becomes 500 if ever hit.** Keys are `joinObjectKey('demo', id, 'attachment.txt')` with server UUID on create; id from URL only used after subject-scoped DB hit. Package rejects `..`. If throw escapes, client gets generic INTERNAL_ERROR (good) but ops see raw Error. Prefer AppError.validation for bad ids. | ```35:38:apps/example-api/src/services/notes.ts``` · storage `joinObjectKey` |
| SEC-P05-017 | **P3** | `wrangler.toml` · `env.schema.ts` | **Prod secret inventory is optional at type/schema level; runtime only hard-gates SESSION_SECRET.** `ENVIRONMENT=development` default in wrangler vars; CORS defaults to localhost. Deploy without secrets.yml discipline may run with dev fallback if someone sets ENVIRONMENT wrong. Document CF secrets checklist. | wrangler `[vars]` · getSecret rules |
| SEC-P05-018 | **P3** | `migrations/0001_init.sql` · schema | **No DB-level index on `demo_notes.subject` / `api_keys.subject` (perf); `key_hash` UNIQUE is good.** Not direct vuln. `password_hash` stored as PBKDF2 string (package). No soft-delete audit on keys. | SQL migration |
| — | (positive) | notes repos + service + tests | **IDOR isolation: list/get/delete filter `id AND subject`; cross-user → 404.** Test “notes are subject-scoped (IDOR: B cannot read A note)”. | ```7:17:apps/example-api/src/repos/notes.ts``` · app.test.ts IDOR |
| — | (positive) | `app.ts` CORS | **Credentials + allowlist; evil Origin not reflected.** Tested. | cors callback returns `null` |
| — | (positive) | `session-env.ts` | **SESSION_SECRET fail-closed** when ENVIRONMENT missing/production/staging without ≥32 secret; Secure cookies outside development\|test. Unit tests. | getSecret / useSecureCookie |
| — | (positive) | `error-handler` + core | **Stacks only in `console.error` JSON; client body nested `{ error: { code, message }, requestId }`.** Unknown errors → generic Internal error. | onError · toApiErrorBody |
| — | (positive) | SQL surface | **All app queries via Drizzle `eq`/`and`/`isNull` — no string-concat SQL.** | repos/* · auth login select |
| — | (positive) | API keys at rest | **Only SHA-256 hash stored; plaintext returned once at mint.** Lookup by hash + non-revoked. | mintApiKey · findApiKeyByHash |
| — | (positive) | Cookie flags (app wiring) | **HttpOnly + SameSite=Lax; Secure when not development\|test.** Login/logout use `useSecureCookie`. | auth routes · session package |
| — | (positive) | Route inventory | **Public by design:** `GET /health`, `POST /api/auth/login`, `POST /api/auth/logout`. **Protected:** `/api/me`, `/api/keys`, all `/api/notes*`, `/api/demo/email`. | routes/* |
| — | (positive) | Secrets hygiene | **`.dev.vars` gitignored; only `.dev.vars.example` placeholders.** No live secrets in partition sources. | `.gitignore` · example file |
| — | (positive) | Zod bounds | **Note title/body/attachmentText max lengths** reduce payload DoS. Login email validated. | createNoteSchema · loginSchema |

### Route × authz matrix

| Method | Path | Auth | Authz / notes |
|--------|------|------|----------------|
| GET | `/health` | none | Public OK |
| POST | `/api/auth/login` | none | Seeds demo users; no rate limit; sets session cookie |
| POST | `/api/auth/logout` | none | Clears cookie; no session server invalidate |
| GET | `/api/me` | session **or** sk_ | Returns subject, method, seed role (informational) |
| POST | `/api/keys` | session **or** sk_ | Mint unbounded; returns plaintext key once |
| GET | `/api/notes` | required | Filtered by subject |
| POST | `/api/notes` | required | Subject ownership on create; R2 `demo/{uuid}/…` |
| GET | `/api/notes/:id` | required | Subject + id; 404 if other user |
| DELETE | `/api/notes/:id` | required | Same; R2 best-effort delete |
| POST | `/api/demo/email` | required | Fixed recipient; no rate limit |

### Auth resolution order

```text
Authorization: Bearer <token>
  → parseBearer → hashApiKey → findApiKeyByHash (revoked_at IS NULL)
  → hit: { subject, api_key }
  → miss: 401 (does not fall through to cookie)
Cookie gosilex_session
  → verifySession(HMAC) → { subject: payload.sub, session }
else → null → requireAuth → 401
```

## Metrics

| Metric | Value |
|--------|--------|
| App source surface (approx.) | ~525 statements (coverage inventory); routes 5 modules + 4 middleware + 3 services + 2 repos + seed |
| Protected handlers | **6** (all use imperative `requireAuth`) |
| Public handlers | **3** (health, login, logout) |
| Auth methods | session cookie HMAC · Bearer `sk_` |
| Session TTL | **7 days** (`exp` + cookie Max-Age) |
| API key TTL | **none** |
| API key revoke API | **none** (column ready) |
| Rate limits | **0** |
| Origin/CSRF on mutations | **0** |
| CORS | allowlist + credentials; no `*` |
| Security headers set | 4 (nosniff, DENY, no-referrer, XSS=0) |
| HSTS / CSP | **absent** |
| IDOR tests | **yes** (A vs B notes) |
| Demo users auto-seed on login | **yes** (all envs) |
| Coverage snapshot (app) | lines **~85%**; email service **~1.7%**; demo route **~56%** |
| Findings | **18** · P0: **0** · P1: **4** · P2: **8** · P3: **6** · positives: **10** |

### Threat model (app boundary)

| Asset | Threat | Control today | Residual |
|-------|--------|---------------|----------|
| Note rows / R2 attachments | IDOR cross-user | subject predicate + 404 | Handler omit requireAuth (SEC-P05-002) |
| Session integrity | Cookie forge | HMAC + secret policy | Package exp validation (P2); no revoke |
| Session theft | XSS on SPA | HttpOnly | CSP/XSS on web partition |
| CSRF | Cross-site cookie use | SameSite=Lax | No Origin check; login CSRF (SEC-P05-005) |
| API keys | Leak / abuse | SHA-256 at rest; high entropy | No TTL/revoke/cap (SEC-P05-004) |
| Demo accounts | Cred stuffing / default login | PBKDF2 only | **Public passwords + auto-seed** (SEC-P05-001/007) |
| Login | Brute force | none | SEC-P05-003 |
| Config | Missing secret | fail-closed throw | Message leak (SEC-P05-009) |
| SQL | Injection | Drizzle binds | Low |
| R2 | Path traversal | joinObjectKey + fixed segments | Low |
| Email | Open relay / spam | Fixed RCPT; auth required | No rate limit; SMTP host config |

## Recommendations

1. **P1 — Gate demo seed by environment (SEC-P05-001 / 007)**  
   - Call `ensureDemoUsers` only when `ENVIRONMENT` is `development`|`test` (or explicit `ALLOW_DEMO_SEED=1`).  
   - In staging/production: never insert seed users; document that `db:seed` is local-only.  
   - Add test: `ENVIRONMENT=production` + `SESSION_SECRET` set → login with demo password fails **and** `demo_users` stays empty if not pre-provisioned.  
   - Optionally refuse start if seed emails exist while `ENVIRONMENT=production` (assert/migration guard).

2. **P1 — Mount auth as middleware (SEC-P05-002)**  
   - e.g. `notesRoutes.use('/api/notes/*', requireAuthMw)` and same for `/api/me`, `/api/keys`, `/api/demo/*`.  
   - Prefer fail-closed default: public routes opt out, not protected routes opt in.  
   - Lint/rule or test inventory: every `/api/*` except auth/health requires subject.

3. **P1 — Rate limit auth & mint (SEC-P05-003)**  
   - Per-IP (and per-email) limits on `POST /api/auth/login`; per-subject on `POST /api/keys` and `POST /api/demo/email`.  
   - Until `@gosilex/rate-limit` exists: CF rate limiting rules or simple D1/KV counter is enough for the kit example.  
   - Cap keys per subject (e.g. 5) even before full package.

4. **P1 — Key lifecycle (SEC-P05-004)**  
   - `POST /api/keys` session-only (reject `authMethod === 'api_key'`) **or** document machine mint.  
   - Add `DELETE /api/keys/:id` (subject-scoped) setting `revoked_at`.  
   - Optional `expires_at`; list endpoint returns metadata never plaintext.  
   - Audit log mint/revoke (stub OK).

5. **P2 — Origin check on mutations (SEC-P05-005)**  
   - Middleware for POST/PUT/PATCH/DELETE: if `Cookie` session will be used, require `Origin` (or `Referer`) ∈ `corsAllowlist` (or same-host).  
   - Skip for pure Bearer API-key clients (no cookie CSRF).  
   - Document login CSRF residual; optional anti-login-CSRF (POST + custom header only from SPA).

6. **P2 — Headers (SEC-P05-006)**  
   - When `useSecureCookie`/non-local env: add `Strict-Transport-Security: max-age=31536000; includeSubDomains`.  
   - Minimal API CSP e.g. `default-src 'none'; frame-ancestors 'none'`.  
   - Keep existing nosniff / DENY / referrer.

7. **P2 — Sanitize AppError.internal client messages (SEC-P05-009)**  
   - Map 500 AppErrors to generic public message; log full reason server-side (already have structured log).

8. **P2 — Session hardening at app boundary (SEC-P05-010)**  
   - After `verifySession`, require `typeof sub === 'string' && sub.length > 0`.  
   - Optional: load user by id; reject if missing (deleted account).  
   - Product path: Better Auth + server sessions (ADR-0002) for revoke.

9. **P2 — Tests (SEC-P05-012)**  
   - Production seed gate; Origin middleware; key revoke; bearer does not mint (if adopted); logout Set-Cookie Max-Age=0 + flags; request-id allowlist.

10. **P3 — Hygiene**  
    - Bound/ignore client `x-request-id` (SEC-P05-013).  
    - Timing pad on login (SEC-P05-015).  
    - Map storage traversal to 400.  
    - Do not treat `role` from `/api/me` as authorization without server checks (SEC-P05-008).  
    - Cover demo email path in tests before relying on it in CI demos.

## Residual risks

| Risk | Why it remains | Owner |
|------|----------------|-------|
| **Example Worker is not a hardened multi-tenant SaaS** | Intentional kit surface; no WAF/bot rules in repo | Ops / product apps |
| **Stateless sessions not revocable server-side** | Logout clears cookie only; HMAC valid until `exp` | Better Auth swap / denylist |
| **Package crypto gaps** (exp shape, PBKDF2 bounds) | Live under `@gosilex/auth` | Security P2 fixes |
| **SPA XSS steals nothing from HttpOnly cookie but can drive CSRF-same-site actions** | Cookie still sent on same-site XHR | example-web CSP + sanitization (P6) |
| **Known demo passwords in git history** | Fixture strings | Never reuse outside local; rotate if ever used “for real” |
| **No branch protection / Free private GH limits** | Process (AGENTS) | Org plan / merge-on-green |
| **CF account mis-binding** (wrong R2/D1) | Deploy config | Wrangler env separation |
| **RBAC illusion** | Role returned but unused | Product authz design |

---

**Bottom line:** Treat **IDOR + dual-auth + CORS allowlist + fail-closed secrets** as already demo-correct. Before any public or staging exposure of `example-api`, fix **SEC-P05-001 (seed gate)**, **SEC-P05-002 (auth middleware)**, **SEC-P05-003/004 (limits + key lifecycle)** — those are the findings that turn a good kit sample into an accidental open appliance.
