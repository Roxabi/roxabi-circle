---
title: "B-users — User provisioning BO + first login + roles/orgs"
issue: 58
status: approved
tier: F-full
date: 2026-08-01
spark: 128
promoted-from: artifacts/analyses/58-b-users-user-provisioning-analysis.md
shape: "Shape 1 — kit admin routes + EmailPort"
---

## Context

- **Issue:** [#58](https://github.com/go-silex/silex-boilerplate/issues/58) · Spark #128
- **Frame:** `artifacts/frames/58-b-users-user-provisioning-frame.md` (approved)
- **Analysis:** `artifacts/analyses/58-b-users-user-provisioning-analysis.md` (approved, Shape 1)
- **Depends:** #15 invites/reset ✅ · #21 email ✅ · #22 RBAC Phase B ✅
- **ADRs:** 0002 BA-only · 0003 RBAC · 0004 email

## Goal

Staff and super_admin provision users from the BO with plane + org memberships; users set a password via welcome email and land on the correct shell — without public signup.

## Users

| Actor | Role |
|-------|------|
| **super_admin** | Create any user; assign `staff`/`super_admin`; attach any active org memberships |
| **staff** | Create client users (`platformRole` null only); attach memberships only for orgs where staff already has a membership |
| **Provisioned user** | Opens welcome link, sets password, gets BA session, lands `/admin` or `/app` |
| **Org owner/admin** | Existing invite path; S3 when email has no account |

## Locked decisions (from analysis open points)

| Topic | Decision |
|-------|----------|
| Spine | Kit routes + services + EmailPort; BA admin plugin **not** spine |
| Public signup | Remains off (`ALLOW_PUBLIC_SIGNUP` unchanged default) |
| BA org invite surface | Stays DENY |
| Password at create | Random unusable hash via `better-auth/crypto.hashPassword`; never returned or emailed |
| Welcome token | Reuse BA `reset-password:` verification + `/reset-password` UI; **welcome email template** (distinct copy); `redirectTo` includes post-login home hint if needed |
| emailVerified | `true` on BO create (operator-trusted email) |
| Platform ceiling | Only `super_admin` may set `platformRole` to `staff` or `super_admin`; staff may only create `platformRole: null` |
| Membership scope | super_admin → any **active** org; staff → only orgs where actor is already a member |
| Create conflict | Existing BA email → **409** `USER_EXISTS` |
| Email fail | Compensate: no durable usable provision (delete memberships + platform role + verification + account + user, or ordered reverse of create); return 500 `EMAIL_SEND_FAILED` |
| Resend welcome | Allowed if user has never completed a successful password set after provision (no active session history required: if still using only random hash path / verification eligible); rate limited |
| Disable (S4 minimal) | Prefer BA ban/disable if schema exposes it; else skip hard disable and ship **resend only** in S4 rather than invent a status table in MVP |
| S3 unknown email | Create BA user shell (`platformRole` null) + pending invite + welcome email with link that sets password then returns to invite accept (or accept after login); **do not** open public signup |
| Product strings | Zero métier share strings; kit demo copy FR-first via i18n |

## Expected Behavior

1. **super_admin** opens `/admin/users`, creates `client@acme.test` with name, no platform role, memberships `[{orgId: org_acme, role: member}]`, checks send email.
2. API creates BA user + credential + membership; mints reset verification; sends welcome email via EmailPort (`log` local / `cf` staging).
3. Client opens link → `/reset-password?token=…` (welcome copy) → sets password → BA session cookie → `GET /api/me` → `defaultHomePath` → `/app`.
4. **super_admin** creates staff user with `platformRole: staff` + multi-org memberships → lands `/admin` after first login.
5. **staff** attempts `platformRole: super_admin` → **403**.
6. **staff** attempts membership on org they do not belong to → **403** or **404** (no leak).
7. Org admin invites unknown email → S3 creates shell + invite + welcome; after password + accept, membership active.
8. Email transport fails on create → no leftover member/platform/user usable state; client sees error.

## Data Model & Consumers

**Data structure:** [Data model](../visuals/58-b-users-user-provisioning-data-model.html)  
**Consumer map:** [Consumers](../visuals/58-b-users-user-provisioning-consumers.html)

| Consumer | Fields / contract | When | Status |
|----------|-------------------|------|--------|
| Admin BO UI | list users (id, email, name, platformRole, createdAt); create form body | S4 | this issue |
| `POST /api/admin/users` | email, name?, platformRole?, memberships[], sendEmail? | S1 | this issue |
| Welcome email | to, setPasswordUrl, expiresHint | S1 | this issue |
| Reset / first-login UI | token, new password → session | S2 | this issue |
| `GET /api/me` | platformRole, orgs → defaultHomePath | existing | this issue (consumer) |
| Invite create | email unknown → provision shell | S3 | this issue |
| Product apps | same admin APIs | later | future |

### API contracts (kit)

**`POST /api/admin/users`** — cookie session, platform actor required.

```ts
// request
{
  email: string
  name?: string
  platformRole?: null | 'staff' | 'super_admin'  // omit or null = client plane
  memberships?: { orgId: string; role: string }[]  // 0..N; role assignable keys
  sendEmail?: boolean  // default true
}

// 201 response (public)
{
  user: { id: string; email: string; name: string | null; platformRole: string | null }
  memberships: { organizationId: string; role: string }[]
  welcomeEmailSent: boolean
}
```

Errors: `401` · `403` (not platform / ceiling) · `404` (org) · `409` USER_EXISTS · `422` validation · `429` rate limit · `500` EMAIL_SEND_FAILED.

**`GET /api/admin/users`** — query `q?`, `limit?`, `cursor?` (simple limit+offset ok for kit demo).

**`POST /api/admin/users/:id/resend-welcome`** — rate limited; 404 if user missing or not eligible.

Guards: `requireAuth` session path; load `platformRole`; reject non-platform; ceiling helper in `@gosilex/auth` or service.

## Breadboard

### UI affordances

| ID | Affordance | Handler | Data |
|----|------------|---------|------|
| U1 | `/admin/users` list + search | Query `GET /api/admin/users` | users[] |
| U2 | Create user form (email, name, plane, multi-org+role, send) | Mutate `POST /api/admin/users` | form state |
| U3 | Resend welcome action | Mutate resend | user id |
| U4 | `/reset-password` welcome mode | BA reset password API | token + password |
| U5 | Post-login redirect | `defaultHomePath(me)` | `/api/me` |
| U6 | Invite accept (existing) + first-login if no session | existing + S3 | invitationId |

### API / service nodes

| ID | Node | Responsibility |
|----|------|----------------|
| N1 | `routes/admin-users.ts` | Zod + guards + HTTP |
| N2 | `services/admin-users.ts` | provision, list, resend, compensate |
| N3 | `repos/users.ts` | insert BA user/account; list users |
| N4 | `platform-roles` / `orgs` repos | set role; insert members |
| N5 | EmailPort + welcome template | send welcome-set-password |
| N6 | BA verification / reset | mint + consume token |
| N7 | `invitations` service | S3 unknown-email branch |
| N8 | Rate limit keys | admin-user-create / resend |

### System edges

| From | To | Event |
|------|-----|-------|
| U2 | N1→N2 | create |
| N2 | N3/N4/N6/N5 | ordered write + email last |
| U4 | N6 | set password |
| U4→U5 | session + me | land plane |
| U6 | N7→N2 | invite unknown |
| S5 tests | N1–N7 | IDOR matrix |

## Slices

| Slice | Demo | Includes | Depends |
|-------|------|----------|---------|
| **S1** | curl/staff session creates user; log email shows welcome URL; D1 has user+member+verification | N1–N6, template, tests happy+email-fail+ceiling | — |
| **S2** | Browser set password via token → session → correct home | U4, U5, i18n | S1 |
| **S3** | Invite unknown email → welcome → password → accept → member | N7 + tests | S1, S2 |
| **S4** | `/admin/users` list + create form + resend | U1–U3, GET list, nav link | S1, S2 |
| **S5** | CP-IDOR ≥ 8 green in CI | full security suite | S1–S3 (S4 optional for UI-only) |

**Ship order:** S1 → S2 → S5 (core security) → S3 → S4 (can parallel S3 after S2). Prefer one PR epic if green; else PR1 S1+S2+S5, PR2 S3+S4.

## Edge cases

| Case | Handling |
|------|----------|
| Duplicate email | 409 USER_EXISTS |
| Invalid membership role key | 422 |
| Inactive org | 404/403 consistent with orgs API |
| Token expired / reused | BA behavior; tests assert fail closed |
| Staff assigns platform role | 403 |
| Staff foreign org | 403/404 |
| `sendEmail: false` | Create without mail; no welcome token required? **Decision:** still mint token but skip send only if `sendEmail:false` **and** actor is super_admin (ops/debug); default true |
| sk_ Bearer on admin users | **403** — BO mutations session-only (align invites pattern for mutations) |
| Concurrent create same email | DB unique email → 409 |

## Success Criteria

- [ ] SC1: `super_admin` session `POST /api/admin/users` with memberships creates BA user + members + optional platformRole; 201 body has no password.
- [ ] SC2: Only `super_admin` can set `platformRole` to `staff` or `super_admin`; staff creating with non-null platformRole → 403.
- [ ] SC3: Staff cannot attach membership to an org they do not belong to → 403 or 404.
- [ ] SC4: Welcome email sent via EmailPort on success when `sendEmail` true; failure rolls back provision (no usable orphan).
- [ ] SC5: Welcome token allows exactly one password set; expired/reused token fails.
- [ ] SC6: After set password, user has BA session and lands `/admin` iff platform actor else `/app`.
- [ ] SC7: Existing email create → 409; unknown-email org invite (S3) creates shell without public signup.
- [ ] SC8: Rate limits apply on create and resend (429 after threshold).
- [ ] SC9: `sk_` cannot create admin users (403).
- [ ] SC10: CP-IDOR suite ≥ 8 cases green covering escalate, wrong-org, token, email-fail, non-platform actor.
- [ ] SC11: `/admin/users` UI can list and create (S4); FR/EN i18n keys present.
- [ ] SC12: `bun run validate:full` green; zero product métier strings in packages.

## Out of Scope

- Magic links, OAuth social, billing, multi-step product onboarding
- Opening `ALLOW_PUBLIC_SIGNUP`
- Better Auth admin plugin as primary API
- Full user lifecycle audit log product (P1 later)
- Hard multi-tenant SSO

## Test plan (map to CP)

| ID | Case |
|----|------|
| CP-IDOR-1 | Non-auth create → 401 |
| CP-IDOR-2 | Client-only session create → 403 |
| CP-IDOR-3 | Staff assign super_admin → 403 |
| CP-IDOR-4 | Staff foreign org membership → 403/404 |
| CP-IDOR-5 | Cross-user resend → 404 |
| CP-IDOR-6 | Token reuse after set password → fail |
| CP-IDOR-7 | Expired token → fail |
| CP-IDOR-8 | Email fail → no member row / no platform role |
| (+ happy paths) | create multi-org, land plane, S3 invite unknown |

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| BA hash mismatch | Only `better-auth/crypto.hashPassword` |
| Partial writes without TX | Email last + compensate reverse |
| Scope creep disable table | S4 resend-first; ban only if BA field free |

## Ambiguities

None blocking (`[NEEDS CLARIFICATION]` count = 0). Staff org-scoping and disable policy locked above.

## Next

`/plan --issue 58` — micro-tasks, file map, agent split for S1→S5.
