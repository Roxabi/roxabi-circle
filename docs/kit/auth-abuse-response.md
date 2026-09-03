# Auth abuse response (kit)

**Issue:** B-auth-harden
**Audience:** platform super_admin / on-call kit operators

## What protects auth endpoints

| Control | Store | Notes |
|---------|--------|--------|
| Rate limit | **D1** `rate_limit_buckets` | Floor-aligned fixed window; **shared across Workers isolates** |
| Audit trail | **D1** `audit_events` | Append-only; list API super_admin only |

In-memory Maps are **not** used. Multi-isolate safety = shared D1 counters.

### Fixed window + ~2× burst

Counters use `windowStartMs = floor(now / windowMs) * windowMs`.  
Across a window boundary, a client may briefly send up to **~2×** the configured limit (end of window + start of next). This is expected for MVP; escape hatches: Cloudflare Rate Limiting binding or shorter windows.

### Defaults (code constants)

| Surface | Typical key | Limit / window |
|---------|-------------|----------------|
| BA sensitive auth | `ba-auth:{ip}` | 20 / 15 min |
| Admin create user | `admin-user-create:{actor}` | 20 / 1 h |
| Invite create | `invite-create:{orgId}` | 20 / 1 h |
| Invite accept | `invite-accept:{rateKey}` | 30 / 1 h |
| API key mint | `mint:{subject}` | (see me.ts) |
| Demo email / feedback | subject keys | (see routes) |

Tighten by changing constants in `apps/example-api` (no env overrides in this epic).

### Fail-closed

If D1 is unavailable during a rate-limit check, the request fails with **500 `INTERNAL_ERROR`** — the limit is never skipped.

## Audit events

| Action | When |
|--------|------|
| `user.created` | Admin create-user; invite-path shell provision |
| `platform_role.set` | Platform role assigned on create |
| `membership.add` | Membership insert (admin create / invite accept) |
| `first_login` | First BA session create (password, magic, or set-password) — idempotent per user |
| `invite.accept` | Invitation accepted |

Payloads use **allowlisted meta** only (no passwords, tokens, Authorization, cookie bodies).

### List recent events

```http
GET /api/admin/audit-events?limit=50&cursor=
```

- **Auth:** session cookie **or** `sk_` Bearer with platform role `super_admin`
- **401** unauthenticated · **403** authenticated non-super
- Cursor format: `{createdAt}:{id}`

### Residual risk: best-effort write

Audit insert runs **after** the domain mutation. If audit write fails, the domain change stays committed and a structured log is emitted:

```json
{ "level": "error", "msg": "audit_append_failed", "action": "...", "requestId": "..." }
```

Alert on elevated `audit_append_failed` rate. Full outbox / SIEM is out of scope.

## Response playbook

1. **Identify spray** — 429 spikes on auth; note `cf-connecting-ip` / client IP.
2. **Confirm limits** — same IP should share D1 counter across isolates (if not, check D1 binding / migration applied).
3. **Inspect audit** — `GET /api/admin/audit-events` as super_admin for create-user, role, invite, first_login anomalies.
4. **Contain** — rotate compromised passwords (account self-service / reset); revoke API keys; disable public signup (`ALLOW_PUBLIC_SIGNUP` off).
5. **Tighten** — lower code constants and redeploy; optional CF WAF / Rate Limiting for edge volume.
6. **Product forks** — `assertRateLimit` is **async** and requires `db`; copy-paste sync Map helpers will not match kit.

## Related

- ADR-0002 Better Auth only  
- Frame/spec: product tracker  
- Environments / staging: [`docs/kit/environments.md`](./environments.md) · example-* checklist: [`docs/kit/staging-examples.md`](./staging-examples.md)
