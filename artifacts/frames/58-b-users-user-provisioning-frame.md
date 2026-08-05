---
title: "B-users — User provisioning BO + first login + roles/orgs"
issue: 58
status: approved
tier: F-full
date: 2026-08-01
spark: 128
---

## Problem

Post Goal 002 multi-tenant spine, the kit can invite an **already logged-in** user into an org and reset passwords — but **cannot provision a new account from the back-office**. Platform roles remain **seed-only**. Operators (and product consumers building B2B onboarding) cannot:

1. Create a user from the BO without a clear password path
2. Send a first-connection email (set password / welcome)
3. Atomically assign org memberships (1..N) **and** plane (`platformRole` → `/admin` vs `/app`)

**Why now:** MT + invites (#15) + email transports (#21) + RBAC Phase B (#22) are live; the remaining gap is the **user lifecycle** that ShipFast-style B2B kits expect and that every GOSILEX product will re-invent if the kit does not own it.

**Observable impact:** Staging/demo still relies on seed users; client onboarding requires D1/SQL or ad-hoc BA admin; no audited, rate-limited, IDOR-tested path for staff to create multi-org users.

## Who

- **Primary:** `super_admin` / `staff` provisioning users from `/admin/users` (BO plane)
- **Secondary:** Newly provisioned end users (first login → set password → land on `defaultHomePath`); product engineers composing kit APIs in `apps/<product>-*`

## Constraints

- **Kit owns APIs** (same pattern as org invites D7) — do **not** open Better Auth org-invite-native as the primary path; eval BA admin plugin only as option, preference = kit routes + `EmailPort`
- **Do not** open `ALLOW_PUBLIC_SIGNUP` globally
- Depends already shipped: B3 invites + reset (#15), CF email (#21), Phase B roles (#22)
- Create user: **no clear password** communicated at create; welcome **set-password** token (short TTL, single-use)
- `platformRole` ceiling: only `super_admin` assigns `staff` / `super_admin`
- `memberships[]` atomic with user create (0..N)
- Email send failure → **rollback** invitation/token (no orphan half-created state)
- Rate limit admin create + resend
- Security bar: CP-IDOR ≥ 8; IDOR create / escalate / wrong-org membership / token reuse-expiry / email-fail cancel
- Dual credential remains cookie session **|** Bearer `sk_` — first-login is **session** path
- ADRs: 0002 BA-only · 0003 RBAC · 0004 email; amend if stack decision warrants (user lifecycle ADR optional)

## Out of Scope

- Magic links (dedicated epic)
- OAuth social
- Billing
- Soft multi-step product onboarding (métier)
- Opening public self-signup
- Shared team API keys

## Scope (slices)

| Slice | Intent |
|-------|--------|
| **S1** | `POST /api/admin/users` — BA user + optional `platformRole` + `memberships[]` + welcome token + `@gosilex/email` welcome-set-password template + rate limit + email-fail rollback |
| **S2** | First-login UI — `/first-login` or token type on `/reset-password` → set password → BA session → `defaultHomePath` |
| **S3** | Org invite when email has no account — create user + welcome **or** invite token that bootstraps account; align accept-invite + first-login; no public signup |
| **S4** | BO UI `/admin/users` — list/search, create form (email, name, plane, multi-org+roles, send email), resend welcome, minimal disable/suspend |
| **S5** | Security tests — IDOR, escalate, wrong-org, token reuse/expiry, email fail cancels |

## Premise Validity

**Success in 6 months:** Staff/super_admin provision any user end-to-end from `/admin/users` (create + orgs + plane); welcome email lands (log local / `cf`); user sets password and lands on the correct plane. At least one product consumer (or dogfood) uses this kit path instead of seed/SQL.

**Failure in 6 months:** After this epic ships (or within 2 sprints past merge), it is still impossible to create a non-seed user from the BO without manual D1/BA hacks, **and/or** the first-login mail path is unused in staging.

**Simplest alternative:** Operators seed users in D1 and send BA reset-password links by hand.
**Why not simplest:** Not multi-org atomic, no plane assignment UI, not audit/rate-limited, does not scale for B2B client onboarding, and fails the kit JTBD for products that must own a controlled provisioning path without public signup.

## Complexity

**Tier: F-full** — multi-domain epic (auth lifecycle, email, admin API, admin SPA, security suite); new kit API surface + token type + UI shells; architecture unknowns (BA admin plugin vs kit routes; invite-without-account vs first-login alignment).

Signals:

- Multiple domains: API, email templates, session/first-login, admin SPA, IDOR tests
- Cross-package: `@gosilex/auth`, `@gosilex/email`, `example-api`, `example-web`
- New patterns: welcome set-password token, atomic multi-membership create, platform-role ceiling
- Security-critical (authz + token lifecycle)
- Epic / Spark P0 · 5 slices S1–S5
