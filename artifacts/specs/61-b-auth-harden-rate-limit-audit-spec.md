---
title: "B-auth-harden — Rate limit durable + audit BO"
issue: 61
status: approved
tier: F-lite
date: 2026-08-02
spark: 131
promoted-from: artifacts/frames/61-b-auth-harden-rate-limit-audit-frame.md
---

## Context

- **Issue:** [#61](https://github.com/go-silex/silex-boilerplate/issues/61) · Spark #131
- **Frame:** `artifacts/frames/61-b-auth-harden-rate-limit-audit-frame.md` (approved, F-lite)
- **Analysis:** skipped (F-lite)
- **Depends:** B-users #58 ✅ · Magic #59 ✅ · B-account #60 ✅ (complementary rate-limit surfaces)
- **ADRs:** 0002 BA-only · dual credential cookie **|** Bearer `sk_` unchanged · axial 0001 packages compose apps
- **Neighbor (out):** Email OTP BA plugin (capacity option only); full SIEM / PostHog

## Intent

Auth and admin-sensitive routes already call `assertRateLimit`, but the store is an **in-memory Map** — ineffective across Cloudflare Workers isolates. Sensitive BO/auth actions leave **no append-only audit trail** for super_admin abuse response. Products will invent false controls or ad-hoc logs unless the kit owns durable limits + minimal audit.

## Goal

Durable D1-backed rate limits protect sign-in, magic, reset, invite create/accept, and admin create-user across isolates; ≥5 audit event types fire on critical paths with a super_admin-only recent list API; secrets never appear in audit payloads; short abuse-response runbook ships; `validate:full` green.

## Users

| Actor | Role |
|-------|------|
| **Platform super_admin** | Primary for audit read + abuse response; rate limits protect their BO tools too |
| **Staff / end users** | Secondary: effective 429 under abuse; no new UX beyond existing error handling |
| **Product engineer** | Inherits D1 rate-limit + audit patterns; no dual-edit of kit Map |
| **Attacker / abuse traffic** | Adversary model: multi-isolate spray must still hit shared counters |

## Locked decisions

| Topic | Decision |
|-------|----------|
| Rate-limit backend | **D1 only** (not KV). Rationale: existing `DB` + migrations + vitest pool; audit shares D1. Escape hatch (KV / CF Rate Limiting) = runbook note only, not dual impl |
| Rate-limit algorithm | **Floor-aligned fixed window** (not sliding Map). `windowStartMs = Math.floor(now / windowMs) * windowMs`. Document **~2× burst** across window boundary in module comment + runbook |
| Counter SQL | **Atomic** only: `INSERT … ON CONFLICT(bucket_key, window_start_ms) DO UPDATE SET count = count + 1 RETURNING count` (composite PK). **Ban** read-modify-write. After increment, if `count > limit` → 429 (do **not** accept undercount) |
| `retryAfterSeconds` | `Math.max(1, Math.ceil((windowStartMs + windowMs - now) / 1000))` |
| Fail-closed | **All** current call sites (auth, invite, admin, mint, email, feedback). On D1 throw → **`AppError.internal` (500 `INTERNAL_ERROR`)** — no silent skip, no Map fallback in prod path |
| Bucket GC | **Lazy**: ignore/delete rows with `window_start_ms + windowMs < now` best-effort on write or periodic; no separate retention job required |
| API shape | **`async assertRateLimit(db, key, limit, windowMs): Promise<void>`** only (no RateLimitPort this epic). All call sites `await`. Keep `clientIp`. `resetRateLimits(db)` clears D1 buckets in tests — **no Map** |
| Placement | **App-first** `apps/example-api`. No empty `@gosilex/rate-limit` / `@gosilex/audit` packages. AGENTS P1 rows = future promote |
| Surfaces (rate limit) | All existing `assertRateLimit` call sites + confirm `BA_SENSITIVE` still covers sign-in, magic-link request/verify, reset, change-password. No regression |
| Config | **Code constants only** this epic (existing `*_LIMIT` / `*_WINDOW_MS`). Env overrides = follow-up |
| Audit table | **`audit_events`**: `id`, `created_at`, `actor_user_id` nullable, `action`, `target_type`?, `target_id`?, `org_id`?, `ip`?, `meta_json` |
| Indexes | Rate limit PK `(bucket_key, window_start_ms)`. Audit: index `(created_at DESC, id)` for cursor; unique partial/unique on `(action, target_id)` **where action = first_login** (or app-level insert-if-absent with conflict ignore) |
| Event types (min 5) | `user.created` · `platform_role.set` · `membership.add` · `first_login` · `invite.accept` |
| Audit write | Best-effort **after** domain success: insert fail → **structured log** with `action` + `requestId` (when available) + **do not roll back** domain. Document residual risk in runbook |
| Secrets ban | **Allowlisted meta per action** (no free-form dump). Denylist keys `/token|password|secret|authorization|cookie|rawBody/i` + reject URL values with query tokens. Prefer user/org ids over emails |
| API read | `GET /api/admin/audit-events?limit=&cursor=` — `requireAuth` then **super_admin only**. **401** unauthenticated · **403** authenticated non-super. Newest-first. Cursor format: **`{createdAt}:{id}`** validated; invalid → 400. No write API. Cookie **and** `sk_` super_admin both allowed |
| UI | **No** audit BO UI this epic |
| Email OTP | **Out** (default) |
| Docs path | **`docs/auth-abuse-response.md`** — limits, fixed-window burst note, audit list, audit-write failure signal, credential rotation, when to tighten |
| Multi-isolate proof | Isolates share D1 → counters shared. Automated = D1 integration tests + atomic SQL + module/runbook note. **Not** live multi-isolate CF spray |
| Migration | Next free number under `apps/example-api/migrations/` (both tables in one migration ok) |
| Product forks | Async signature is a **breaking** change for any product that copied sync `assertRateLimit` — note in runbook |

### Audit emit hooks

| Action | When | Call site (concrete) |
|--------|------|----------------------|
| `user.created` | After successful user row create | `createAdminUser` success; invite-path shell provision |
| `platform_role.set` | When a non-null platform role is assigned on create (and any dedicated set-role path if already exists — **create-user role path is the required MVP**) | `createAdminUser` when `platformRole` set |
| `membership.add` | After membership insert | admin create memberships loop; invite accept membership |
| `first_login` | First successful **session establishment** for user: password sign-in **or** magic-link verify **or** reset-password (welcome/set-password) that yields a session. Prefer BA `databaseHooks.session.create.after` (or equivalent post-session hook); fallback = post-2xx on sensitive auth with resolved user id | BA session create hook (preferred) |
| `invite.accept` | After successful invite accept | `acceptInvitation` success path |

**`first_login` idempotency:** unique constraint / conflict-ignore on `(action, target_id)` for `first_login` — **not** check-then-insert only.

## Expected Behavior

1. Attacker sprays `POST /api/auth/sign-in/email` from one IP across many isolates → shared D1 counter → **429** after limit within window (same as single-isolate intent).
2. Legitimate user under limit continues to succeed; after window rolls, counter resets.
3. `createAdminUser` success → audit `user.created` (+ `platform_role.set` / `membership.add` if applicable).
4. Invite accept → `invite.accept` + `membership.add` (+ `user.created` if shell was provisioned on create).
5. First successful login / set-password for that user → single `first_login` (no duplicate on second login).
6. super_admin `GET /api/admin/audit-events` → recent events JSON, no secrets.
7. staff / client / unauthenticated → denied on audit list.
8. D1 unavailable during rate-limit check → **500 `INTERNAL_ERROR`** (fail closed); never skip limit via Map.
9. Product engineer reads `docs/auth-abuse-response.md` for abuse response steps.
10. Magic-link first session for a new user emits exactly one `first_login` (same as password path).

## File touch list (planner)

| Path | Change |
|------|--------|
| `apps/example-api/migrations/00xx_rate_limit_audit.sql` | Tables for rate-limit buckets + audit_events |
| `apps/example-api/src/db/schema.ts` (or equiv) | Drizzle tables |
| `apps/example-api/src/lib/rate-limit.ts` | Async D1 assertRateLimit; drop Map for prod path; test reset |
| `apps/example-api/src/routes/auth.ts` | await rate limit; pass `db` |
| `apps/example-api/src/services/admin-users.ts` | await RL; emit audit events |
| `apps/example-api/src/services/invitations.ts` | await RL; emit audit |
| `apps/example-api/src/services/audit.ts` (new) | append + list helpers |
| `apps/example-api/src/repos/audit.ts` (new) | D1 access |
| `apps/example-api/src/routes/admin-audit.ts` (new) | GET list super_admin |
| `apps/example-api/src/app.ts` (or router mount) | Mount admin-audit |
| Call sites using `assertRateLimit` | await + db |
| Tests (`app.test.ts`, `admin-users`, `invitations`, `magic-link`, new audit/rate-limit tests) | Cover DoD |
| `docs/auth-abuse-response.md` (or playbooks) | Runbook |
| `AGENTS.md` / auth matrix note | Optional one-liner: rate limit is D1 durable |
| `.dev.vars.example` | Only if new env vars added |

## Data Model & Consumers

### Rate limit bucket

```ts
// logical row
{
  bucketKey: string       // e.g. ba-auth:203.0.113.9
  windowStartMs: number   // floor(now / windowMs) * windowMs  OR first-hit start — lock floor-aligned
  count: number
}
```

**Window alignment:** floor-aligned windows (`windowStartMs = Math.floor(now / windowMs) * windowMs`) + atomic ON CONFLICT increment.

### Audit event

```ts
{
  id: string              // ulid/uuid kit helper
  createdAt: number       // ms
  actorUserId: string | null
  action: AuditAction     // enum of 5+ stable strings
  targetType?: string     // 'user' | 'org' | 'invitation' | …
  targetId?: string
  orgId?: string | null
  ip?: string | null
  meta?: Record<string, unknown>  // no secrets
}
```

| Consumer | Fields / contract | When | Status |
|----------|-------------------|------|--------|
| `assertRateLimit` | db, key, limit, windowMs | all sensitive routes | this issue |
| Audit emitters | action + actor + target | create/role/member/login/invite | this issue |
| `GET /api/admin/audit-events` | list + pagination | super_admin | this issue |
| Abuse runbook | ops steps | after ship | this issue |
| `@gosilex/rate-limit` package | — | — | **out / later promote** |
| Admin UI table | — | — | **out** |
| SIEM export | — | — | **out** |

### API contract — list audit

```ts
// GET /api/admin/audit-events?limit=50&cursor=<createdAt:id>
// Auth: session cookie or sk_ with super_admin platform role

// 200
{
  items: Array<{
    id: string
    createdAt: number
    actorUserId: string | null
    action: string
    targetType?: string
    targetId?: string
    orgId?: string | null
    ip?: string | null
    meta?: Record<string, unknown>
  }>
  nextCursor: string | null
  requestId: string
}
```

## Breadboard

### Network / server

| ID | Affordance | Handler | Data |
|----|------------|---------|------|
| N1 | D1 rate-limit UPSERT + check | `assertRateLimit(db, …)` | `rate_limit_buckets` |
| N2 | BA auth middleware rate limit | `auth.ts` | N1 + IP key |
| N3 | Invite create/accept RL | invitations service | N1 |
| N4 | Admin create-user RL | admin-users service | N1 |
| N5 | Audit append | `audit.append(db, event)` | `audit_events` |
| N6 | Emit on create user | admin-users / invite provision | N5 `user.created` |
| N7 | Emit on platform role set | admin-users | N5 `platform_role.set` |
| N8 | Emit on membership add | admin-users / invite accept | N5 `membership.add` |
| N9 | Emit first_login | BA session.create hook (password \| magic \| reset) | N5 unique (action, target_id) |
| N10 | Emit invite.accept | invitations accept | N5 |
| N11 | List audit | `GET /api/admin/audit-events` | N5 read, super_admin guard |
| N12 | Test reset | `resetRateLimits(db)` | wipe buckets in test |

### Docs / ops

| ID | Affordance | Handler | Data |
|----|------------|---------|------|
| D1 | Abuse response runbook | markdown | limits, audit query, rotation |
| D2 | Module comment multi-isolate | rate-limit.ts | D1 shared |

### UI

| ID | Affordance | Handler | Data |
|----|------------|---------|------|
| U1 | Existing 429 toasts | unchanged FE | RATE_LIMITED |

## Slices

| # | Slice | Demo | Affordance IDs |
|---|-------|------|----------------|
| V1 | D1 rate-limit store + migrate call sites + tests | Spray sign-in / create-user → 429; window docs | N1–N4, N12, U1 |
| V2 | Audit table + emit ≥5 types on hooks + tests | Create user / accept invite / first login → rows without secrets | N5–N10 |
| V3 | super_admin list API + deny tests | GET list as super vs staff | N11 |
| V4 | Runbook + multi-isolate strategy note + `validate:full` | Doc + green suite | D1–D2 |

## Success Criteria

- [ ] SC1: Production path uses **D1 only** for rate limit — **no** module-level Map branch; `resetRateLimits` is D1 wipe
- [ ] SC2: Exceeding limit on BA auth IP bucket returns **429** `RATE_LIMITED` with formula-based `retryAfterSeconds`
- [ ] SC3: Counter updates are **atomic** (ON CONFLICT increment); concurrent async callers on same key do not under-count vs RMW
- [ ] SC4: All existing call sites (incl. mint/email/feedback) **await** D1 assert; missing-await regressions covered by tests still throwing 429 when expected
- [ ] SC5: Documented multi-isolate strategy (D1 shared + atomic SQL + module/runbook); no false claim of live multi-isolate CF spray test
- [ ] SC6: Fixed-window **~2× boundary burst** documented in module comment + runbook
- [ ] SC7: ≥5 audit actions on critical paths: `user.created`, `platform_role.set`, `membership.add`, `first_login`, `invite.accept`
- [ ] SC8: `first_login` fires for **magic-link first session** as well as password / set-password; exactly one event per user
- [ ] SC9: `first_login` idempotency enforced by **unique constraint / conflict-ignore**, not check-then-insert alone
- [ ] SC10: Allowlisted meta + denylist; fixture with URL-with-token or password field is rejected/redacted (assert in tests)
- [ ] SC11: `GET /api/admin/audit-events` works for super_admin via **cookie and sk_**
- [ ] SC12: Unauthenticated → **401**; authenticated staff/client → **403** on audit list
- [ ] SC13: Forced audit-insert failure → domain mutation still succeeds **and** log includes `action` + `requestId` (or stable marker)
- [ ] SC14: Forced D1 throw on rate-limit check → **500 `INTERNAL_ERROR`**, request not allowed through
- [ ] SC15: `docs/auth-abuse-response.md` exists with abuse steps + residual risks
- [ ] SC16: `bun run validate:full` green
- [ ] SC17: Email OTP **absent** from this delivery

## Edge cases

| Edge | Handling |
|------|----------|
| D1 error on rate-limit check | Fail closed **everywhere** → 500 `INTERNAL_ERROR` |
| Audit insert fails | Structured log (`action`, `requestId`); domain stays; no user-facing 5xx for write path |
| Concurrent counter updates | Atomic ON CONFLICT increment only; ban RMW |
| Window boundary | Up to ~2× limit across floor boundary — documented, not a bug for MVP |
| Clock skew | `Date.now()` server-side only |
| Cursor tampering | Validate `{createdAt}:{id}`; invalid → 400 |
| Local dev D1 | Vitest pool / miniflare as today |
| Legacy Map tests | Delete Map path; async D1 helpers only |
| Product fork sync API | Runbook notes breaking async signature |

## Non-goals (repeat)

- Full SIEM / Datadog / Better Stack as store
- Legal retention product policies
- PostHog analytics
- Admin audit UI
- KV dual backend in same PR
- Email OTP (capacity option only)
