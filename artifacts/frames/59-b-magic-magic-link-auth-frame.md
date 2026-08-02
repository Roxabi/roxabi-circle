---
title: "B-magic — Magic link auth (BA plugin + EmailPort)"
issue: 59
status: approved
tier: F-lite
date: 2026-08-02
spark: 129
---

## Problem

Login is **email/password only**. The kit has Better Auth sessions (ADR-0002), EmailPort with reset/invite/welcome templates (B-email #21), BO user provisioning + first-login set-password (B-users #58), and account self-service (B-account #60) — but no **passwordless** path.

Product consumers and dogfood operators cannot:

1. Sign in via a one-shot email link (or OTP) without a password
2. Offer first-access by magic link instead of (or as alternative to) set-password — later config option after B-users
3. Match ShipFast / Better Auth baseline “magic links” without inventing a custom token stack

**Why now:** EmailPort + BA-only sessions + disableSignUp defaults are shipped. Magic link is the missing baseline SaaS login surface; every product will invent the same BA plugin wiring if the kit does not own it.

**Observable impact:** Demo and staging logins force password knowledge; no dogfoodable passwordless path; no template for “check your email” after magic request.

## Who

- **Primary:** End user signing in on the public login plane (`/login`) who prefers or only has a magic link
- **Secondary:** Product engineers composing kit auth; staff/demo operators who need passwordless dogfood (Mailpit / log transport); provisioned users who later may get first-access magic instead of set-password

## Constraints

- **Better Auth only** — plugin `magicLink` inside `createBetterAuth` (ADR-0002); no custom JWT/HMAC magic stack
- **`sendMagicLink` → EmailPort** + new template in `packages/email` (mirror reset-password pattern)
- **Respect `disableSignUp` / `ALLOW_PUBLIC_SIGNUP`** — magic must **not** create public accounts by default (fail closed when signup disabled)
- **No user enumeration** — generic “check your email” response whether or not the address exists
- **TTL short + single-use** (BA plugin defaults / kit config); rate limit IP + email (abuse)
- Login UX: tabs or toggle **Password | Magic link** + “check your email” feedback; deep-link callback uses existing BA `/api/auth/*` handler
- **i18n FR/EN** catalogs in example-web
- Depends shipped: EmailPort #21, BA sessions, login page password path; complementary: B-users first-login (optional magic first-access = later / config)
- `validate:full` green; unit + integration tests for plugin wire, disableSignUp, rate-limit, generic responses
- Kit extractibility: 0 product-domain strings; only example-* dogfood UI
- Doc: AGENTS / README auth matrix update

## Out of Scope

- SMS OTP
- Passkeys / WebAuthn (other epic)
- OAuth Google/GitHub product path
- Durable rate-limit / audit BO (B-auth-harden #61)
- Replacing password login (password remains first-class)
- First-access-via-magic product config as hard dependency of this slice (optional follow-up after B-users)

## Premise Validity

**Success in 6 months:** Kit dogfood and every GOSILEX product can offer passwordless magic-link login with Mailpit/CF email, signup still off by default, and no per-product BA plugin fork.

**Failure in 6 months:** After this epic plus one follow-up cycle, login remains password-only and products still reimplement magic tokens or leave passwordless out — premise failed; reframe or abort.

**Simplest alternative:** Document “call BA magicLink yourself” in AGENTS without shipping plugin wire + template + login UX.

**Why not simplest:** Without kit-owned `sendMagicLink` → EmailPort, disableSignUp coupling, rate-limit, i18n login toggle, and tests, every product re-solves the same security/UX surface — the JTBD is a dogfoodable kit pattern, not a doc pointer.

## Complexity

**Tier: F-lite** — clear, bounded scope (BA magicLink plugin + email template + login toggle + rate-limit + tests + short docs); multi-file but single product concern (passwordless login); known BA + EmailPort patterns (same shape as password-reset).

Signals:

- Issue body lists JTBD, server/client scope, DoD, non-goals
- `createBetterAuth` already wires `sendResetPassword` → EmailPort — copy path for magic
- Login page is password-only today (`/login`); natural extension point
- Neighbor #61 (auth-harden) owns durable rate-limit; this epic needs a minimal abuse bar only
- Security-sensitive but well-known (TTL, single-use, no enumeration)
