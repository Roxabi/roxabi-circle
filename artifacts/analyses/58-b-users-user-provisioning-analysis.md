---
title: "B-users — User provisioning BO + first login + roles/orgs"
description: "Technical analysis: kit admin create-user + welcome token vs BA admin plugin vs invite-only bootstrap"
issue: 58
status: approved
tier: F-full
date: 2026-08-01
frame: artifacts/frames/58-b-users-user-provisioning-frame.md
---

## Source

GitHub **#58** · Spark **#128** · Frame `artifacts/frames/58-b-users-user-provisioning-frame.md` (approved, F-full).

> En tant que super_admin/staff, je provisionne un utilisateur, il reçoit un mail, il set son mot de passe, il land sur /app ou /admin selon son plane, avec les bonnes memberships.

## Problem

Today the kit supports:

| Capability | Status |
|------------|--------|
| Org invite for **existing** BA user | Live (`services/invitations.ts` + email + accept) |
| Password reset (known email) | Live (BA `emailAndPassword` + `/reset-password` UI) |
| Platform roles | **Seed only** (`seed-tenancy` → `platformRolesRepo.setPlatformRole`) |
| Public signup | **Off** by default (`disableSignUp: !ALLOW_PUBLIC_SIGNUP`) |
| BA org invite / member mutations | **DENY** at `/api/auth/organization/*` (ADR-0003 D10) |
| BO create user + multi-org + plane | **Missing** |
| Welcome / first-login email | **Missing** (invite assumes account exists for accept) |

Invite path explicitly looks up `findBaUserByEmail` only to reject already-members; accept requires a **session** whose email matches the invite — no account bootstrap.

`users` repo is read-only (find by id/email). User insert pattern lives only in seed (`hashPassword` from `better-auth/crypto` + `baUser` + `baAccount`).

## Outcome

Staff/super_admin can provision users from the BO with correct plane and memberships; provisioned users complete first login via email without public signup; security suite proves IDOR/escalation/token/email-fail paths. Products compose the same kit APIs without inventing SQL seed rituals.

## Appetite

**1–2 week cycle** for S1 + S2 + S5 core in one vertical; S3 (invite without account) and S4 (list/resend/disable UI) in the same epic PR if capacity allows, else thin follow-up on the same branch/plan.

## Codebase anchors (as-is)

| Area | Path | Note |
|------|------|------|
| BA factory | `apps/example-api/src/lib/better-auth.ts` | `disableSignUp`, reset email via EmailPort |
| Invite service | `apps/example-api/src/services/invitations.ts` | rate limit, email-fail → cancel invite |
| Platform roles | `apps/example-api/src/repos/platform-roles.ts` | `get` / `set` — no HTTP write today |
| Users repo | `apps/example-api/src/repos/users.ts` | find only |
| Seed create user | `apps/example-api/src/seed/seed-tenancy.ts` | insert `baUser` + credential `baAccount` |
| Authz helpers | `packages/auth/src/org-roles.ts` | `PLATFORM_ROLES`, invite ceilings |
| `/api/me` | `apps/example-api/src/routes/me.ts` | exposes `platformRole` |
| Plane home | `apps/example-web/src/lib/auth.ts` | `defaultHomePath` |
| Reset UI | `apps/example-web/src/routes/reset-password.tsx` | BA token flow |
| Admin shell | `apps/example-web` `/admin/*` | orgs, modules — **no users page** |
| Email templates | `packages/email/src/templates/{invite,reset-password}.ts` | no welcome template yet |
| Rate limit | `apps/example-api/src/lib/rate-limit.ts` | in-memory (invite pattern) |

## Shapes

**Diagram:** [Shapes comparison](../visuals/58-b-users-user-provisioning-shapes.html)

### Shape 1: Kit admin routes + EmailPort (recommended)

New kit-owned service + routes under `/api/admin/users` (and related), guarded by platform actor (`staff` | `super_admin`) with **ceiling** on assigning platform roles (only `super_admin` assigns `staff`/`super_admin`).

Create path (logical transaction; D1 has limited multi-statement TX — order + compensating rollback like invites):

1. Normalize email; reject conflict if BA user exists (or define idempotent “already exists → 409”).
2. Insert `baUser` + credential `baAccount` with **random password hash** (never returned); `emailVerified` policy TBD (recommend `true` after set-password or on create for BO-provisioned).
3. Optional `platformRole` via `setPlatformRole`.
4. Optional `memberships[]` via existing member insert + role assignability checks (platform actor may attach any active org — document scoping: super_admin all orgs; staff only orgs they can see? **default: super_admin all; staff membership-scoped orgs only** unless product overrides).
5. Mint welcome set-password: **prefer reuse BA reset verification** (`request-password-reset` internal or direct `baVerification` insert with same identifier scheme as tests) so `/reset-password` UI works; welcome **email template** differs from reset copy.
6. `EmailPort.send` welcome; on failure → compensate (delete token / mark user disabled / delete memberships+user as defined) — **no orphan usable account without mail** if DoD requires “mail received”.
7. Rate limit `admin-user-create:{actorId}`.

S2: thin UX — extend reset-password route with `purpose=welcome` query or dedicated `/first-login` that calls same BA reset API, then `defaultHomePath` after session.

S3: when invite email has no BA user → call shared `provisionUserShell` (no platform role) + send welcome **or** keep pending invite and send combined “create password then accept” link. **Do not** open `ALLOW_PUBLIC_SIGNUP`.

S4: `/admin/users` list/search + create form + resend welcome + minimal disable (BA `banned` if available, or kit `status` table — prefer BA account disable if present, else kit flag).

S5: CP-IDOR ≥ 8 covering create, escalate, wrong-org membership, token reuse/expiry, email-fail cancel.

**Trade-offs:**

- Pro: Matches invites D7 / ADR-0002–0004; BA org surface stays DENY; full control of ceiling + multi-membership; product-composable APIs.
- Pro: Reuses seed insert + reset UI patterns already tested.
- Con: Kit must carefully match BA password hash format (`better-auth/crypto.hashPassword` — already used in seed).
- Con: Compensating rollback without full D1 TX needs careful ordering (email last; reverse on fail).

**Rough scope:** L (epic S1–S5)

### Shape 2: Better Auth admin plugin

Enable BA `admin` plugin for user CRUD; still implement platform roles, multi-membership, ceilings, and EmailPort around it.

**Trade-offs:**

- Pro: Less custom user-row code; BA-maintained user list APIs.
- Con: Frame marks **eval only**; couples kit to admin plugin API and permissions model; may conflict with `disableSignUp` and dual cookie/sk_ model; still need all kit tables for MT; harder zero-edit product story if BA admin UI assumptions leak.
- Con: Security review surface larger (admin plugin endpoints must be locked to platform actors).

**Rough scope:** L–XL (integration + lock-down)

### Shape 3: Invite-only bootstrap (no BO users API)

Only extend org invite so unknown emails create users + welcome; skip dedicated admin users API.

**Trade-offs:**

- Pro: Smallest delta on invite service; S3-shaped.
- Con: **Fails JTBD** — no multi-org + plane from BO in one shot; no staff-driven client onboarding list; platform roles remain seed-only.
- Con: Invite ceiling is org-role based, not platform-role based.

**Rough scope:** M (but wrong problem)

## Fit Check

**Diagram:** [Shape 1 data flow](../visuals/58-b-users-user-provisioning-data-flow.html)

| Constraint | Shape 1 | Shape 2 | Shape 3 |
|------------|---------|---------|---------|
| Kit owns APIs (like invites) | ✓ | partial | partial |
| No public signup | ✓ | risk | ✓ |
| BA org invite DENY | ✓ | ✓ | ✓ |
| Atomic multi-org + platformRole | ✓ | needs kit wrap | ✗ |
| EmailPort + rollback | ✓ (pattern exists) | custom | ✓ on invite |
| Reuse first-login UX | ✓ reset path | ✓ | partial |
| JTBD BO provision | ✓ | ✓ | ✗ |

**Recommendation: Shape 1.**

Eliminated: Shape 3 (wrong problem). Shape 2 deferred to optional spike only if BA crypto/account insert proves fragile — seed already proves Shape 1 insert path.

### Open design points (for `/spec`)

1. **Staff org scope on membership attach** — all orgs vs membership-visible only (recommend: super_admin all; staff only orgs where they are member **or** platform policy table — start with super_admin-only multi-org + staff single-org of membership for v1 if simpler).
2. **Welcome token = BA reset vs kit-owned table** — recommend BA reset identifier for UI reuse; welcome template + redirectTo distinguish copy.
3. **emailVerified** on BO create — true immediately vs after set-password.
4. **Disable/suspend** minimal model — BA ban vs soft flag.
5. **S3 UX** — single link that sets password then auto-accepts invite vs two steps.
6. **Idempotency** — 409 on existing email vs “resend welcome if never logged in”.

## Files impacted (expected ≥3)

| Path | Change |
|------|--------|
| `apps/example-api/src/repos/users.ts` | insert BA user/account helpers |
| `apps/example-api/src/services/admin-users.ts` (new) | provision + resend + list |
| `apps/example-api/src/routes/admin-users.ts` (new) | HTTP surface |
| `apps/example-api/src/app.ts` | mount routes |
| `apps/example-api/src/services/invitations.ts` | S3 unknown-email branch |
| `packages/email/src/templates/welcome-set-password.ts` (new) | template + builder |
| `packages/email/src/index.ts` | export |
| `apps/example-web/src/routes/admin/users.tsx` (new) | BO UI |
| `apps/example-web/src/routes/reset-password.tsx` or `first-login.tsx` | land plane |
| `apps/example-web/src/routeTree.tsx` + i18n catalogs | wiring |
| `apps/example-api/src/*admin-users*.test.ts` (new) | IDOR + happy path |
| optional ADR amend | user lifecycle if stack decision needs it |

## Risks

| Risk | Mitigation |
|------|------------|
| Password hash mismatch with BA login | Use `better-auth/crypto.hashPassword` only (seed path) |
| Orphan user if email fails mid-way | Email last; compensate deletes; tests for cancel |
| Privilege escalation via platformRole | Ceiling check + IDOR tests; never trust client for self-promote |
| Wrong-org membership attach | Org existence + actor scope + tests |
| Token reuse | BA single-use verification; test expiry |
| God route file | Service layer; routes thin Zod + guard |
| Product dual-edit | APIs in kit examples only; products compose, not patch |

## Expert review notes (inline)

- **Product:** Outcome stays solution-free; JTBD matches Shape 1; S4 is the operator-visible proof.
- **Architect:** Shape 1 aligns axial kit-owns-tenant-mutations; avoid BA admin plugin as spine.
- **Security:** Treat as authz-critical; CP-IDOR floor; no password in logs/email; no enumeration on resend where applicable.

## Unresolved concerns

- Exact staff org-scoping policy for multi-membership create (needs product confirm in `/spec`).
- Whether disable/suspend is in MVP slice S4 or post-MVP minimal stub.

## Next

`/spec --issue 58` — acceptance criteria, data model, API contracts, breadboard S1→S5.
