---
title: "B-account — Account self-service (password / profile / sessions)"
issue: 60
status: approved
tier: F-lite
date: 2026-08-02
spark: 130
---

## Problem

Login, forgot-password, and reset-password are live; `/app/settings` shows a **read-only** account card (email, subject, platformRole, orgs) plus theme/locale. A logged-in user still **cannot**:

1. Change password while authenticated (must fall back to email reset)
2. Edit minimal profile (display name if BA fields allow)
3. Sign out cleanly from settings or revoke other sessions when compromised

**Why now:** BA-only sessions (ADR-0002), shells A4, password reset + invites, and B-users provisioning (#58) are shipped. The missing half of the account lifecycle is **self-service** for the authenticated end user — every product will invent the same page if the kit does not own it.

**Observable impact:** Dogfood and staging demos force the forgot-password email loop for routine credential rotation; no dogfoodable path for “I’m logged in and want a new password”; no session hygiene surface.

## Who

- **Primary:** Authenticated end user on the app plane (`/app/settings` or `/settings/account`) managing their own account
- **Secondary:** Product engineers composing kit patterns in `apps/<product>-*`; staff/demo operators who need a safe dogfood story without SQL

## Constraints

- **Better Auth only** for password change / sessions (ADR-0002) — session cookie path; dual credential cookie **|** Bearer `sk_` remains; MCP/API keys out of this surface
- Prefer BA built-ins (`change-password`, session list/revoke if available) over new custom crypto
- Extend existing `/app/settings` **or** add `/settings/account` (or nested account section) — do not invent a second settings shell
- **i18n FR/EN** catalogs in example-web (engine `@gosilex/i18n` already live)
- Security bar: no session tokens / raw passwords in logs or UI; rate-limit path already lists `change-password` on auth routes
- Depends shipped: BA sessions B2, shells A4; complementary (not blocker): B-users #58 BO provisioning
- `validate:full` green; smoke + security tests for the new surface
- Kit extractibility: 0 product-domain strings; only example-* dogfood UI

## Out of Scope

- 2FA / passkeys / WebAuthn
- Avatar upload to R2
- Email change with verification (follow-up)
- Shared team API keys or sk_ management (keys page already separate)
- GitHub OAuth product path
- Admin-side password force-reset UX (B-users / reset flows cover staff-driven paths)

## Premise Validity

**Success in 6 months:** Logged-in users self-serve password + profile in-kit. Every GOSILEX product inherits a dogfoodable account settings surface (change password, see/edit profile, sign out / optional revoke other sessions) without reimplementing BA change-password UI.

**Failure in 6 months:** After this epic plus one follow-up cycle, users still have no authenticated change-password path and must use the forgot-password email loop while already logged in — premise failed; reframe or abort.

**Simplest alternative:** Add only a CTA from settings to the existing forgot-password email flow.

**Why not simplest:** User is already authenticated; email round-trip is worse UX for routine rotation, and it does not cover profile display/edit or multi-session revoke — the JTBD is self-service account hygiene, not another link to recovery.

## Complexity

**Tier: F-lite** — clear, bounded scope (settings UI + BA password/session APIs + i18n + smoke/sec tests); multi-file but single product concern (account self-service); no new architecture or multi-tenant redesign.

Signals:

- Issue body already lists JTBD, DoD, out-of-scope
- Existing `/app/settings` account card is the natural extension point
- BA `emailAndPassword` + rate-limit allowlist already include `change-password`
- Neighbor epic #58 (B-users) is complementary BO provisioning, not a substitute
- Security-sensitive but well-known patterns (session cookie mutations, no secret leakage)
