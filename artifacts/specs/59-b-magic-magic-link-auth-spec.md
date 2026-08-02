---
title: "B-magic — Magic link auth (BA plugin + EmailPort)"
issue: 59
status: approved
tier: F-lite
date: 2026-08-02
spark: 129
promoted-from: artifacts/frames/59-b-magic-magic-link-auth-frame.md
---

## Context

- **Issue:** [#59](https://github.com/go-silex/silex-boilerplate/issues/59) · Spark #129
- **Frame:** `artifacts/frames/59-b-magic-magic-link-auth-frame.md` (approved, F-lite)
- **Analysis:** skipped (F-lite)
- **Depends:** EmailPort / B-email #21 ✅ · BA-only sessions ADR-0002 ✅ · B-users #58 ✅ · B-account #60 ✅ (complementary)
- **Neighbor (out):** B-auth-harden #61 durable rate-limit + audit BO
- **ADRs:** 0002 BA-only · 0004 email transports · dual credential cookie **|** Bearer `sk_` unchanged

## Intent

Login is password-only. The kit already owns BA sessions + EmailPort (`sendResetPassword` pattern) but not passwordless. Products will re-fork the same `magicLink` wiring unless the kit ships it with fail-closed signup, generic responses, and dogfood UX.

## Goal

An existing user can request a magic link from `/login`, receive email via EmailPort (log/Mailpit local), open the one-shot link, and land in a BA session — without public signup and without user enumeration — with tests + auth matrix docs green under `validate:full`.

## Users

| Actor | Role |
|-------|------|
| **End user (known email)** | Primary: sign in via one-shot magic link without password |
| **Unknown / non-user email** | Same generic “check your email” UI; no account created when signup disabled |
| **Product engineer** | Copies BA plugin + template + login toggle into `apps/<product>-*` |
| **API-key client (`sk_`)** | Out of scope (no cookies; magic is session-UI path only) |

## Locked decisions

| Topic | Decision |
|-------|----------|
| Plugin | Better Auth **`magicLink`** from `better-auth/plugins` inside `createBetterAuth` plugins array (alongside `organization`) |
| `sendMagicLink` | Mirror `sendResetPassword`: build template via `@gosilex/email` → `resolveEmailPort(env).send(...)` |
| Template | New `packages/email` template + `buildMagicLinkEmailText` (kit copy only; FR-first subject/body ok in kit EN strings like reset) |
| `expiresIn` | **300s (5 min)** — BA default; document in auth matrix |
| `storeToken` | BA default (`plain` or kit pin if docs recommend hashed — prefer **hashed** if one-line config; else default) |
| `disableSignUp` (magic) | **`true` when `!allowPublicSignup(env)`** — same flag as `emailAndPassword.disableSignUp`. Magic must **not** mint public users by default |
| Request endpoint | BA **`POST /api/auth/sign-in/magic-link`** body `{ email, name?, callbackURL? }` — FE sends `email` + `callbackURL` → app origin home (or `next` safe path) |
| Verify endpoint | BA **`GET /api/auth/magic-link/verify`** (browser navigation from email) — existing `auth.handler` catch-all |
| Rate limit (kit) | Extend `BA_SENSITIVE` to include `sign-in/magic-link` and `magic-link/verify` (IP bucket, same 20/15m as other auth) |
| Rate limit (BA plugin) | Keep BA plugin defaults (5 / 60s on those paths) unless they conflict — dual layer OK (kit + plugin) |
| No enumeration | FE always shows “check your email” success state after request (mirror forgot-password). Server: do not leak existence in client-visible errors when possible |
| Login UX | **Toggle or tabs** on `/login`: Password \| Magic link. Magic mode: email field + submit → success panel (not redirect). Password mode unchanged |
| Callback after verify | Prefer `callbackURL` to SPA origin `/app` or safe `next`; fail paths surface BA error query → i18n message on login |
| First-access magic | **Out of this slice** — optional later config after B-users; password set-password remains first-login default |
| Schema migration | **None expected** — uses BA verification table already present |
| i18n | All new copy in `messages/fr.ts` + `en.ts` |
| Docs | AGENTS / README auth matrix: Password \| Magic \| cookie \| sk_ |
| Secrets | Never log raw token, magic URL query token, or full email body secrets in tests/logs (redact like email package) |

## Expected Behavior

1. User opens `/login`, switches to **Magic link**, enters email of an **existing** user → Submit.
2. Client `POST /api/auth/sign-in/magic-link` with `{ email, callbackURL }` (credentials include if needed; cookie not required for request).
3. BA generates token (TTL 5m), calls `sendMagicLink` → EmailPort sends kit template (log/Mailpit in local).
4. UI shows generic **check your email** (same whether or not account exists / whether email sent).
5. User opens link → BA `magic-link/verify` → session cookie set → redirect to callback (`/app` or safe next).
6. Unknown email + `disableSignUp: true` → no user created; request still looks success to client; verify of crafted token fails safely.
7. `ALLOW_PUBLIC_SIGNUP=true` → magic **may** create users only if BA `disableSignUp` is false for the plugin (document; default remains off).
8. Rate limit exceeded → 429 + toast; do not claim “sent”.
9. Password tab remains fully functional (regression).
10. MCP / `sk_` paths unchanged.

## File touch list (planner)

| Path | Change |
|------|--------|
| `apps/example-api/src/lib/better-auth.ts` | Add `magicLink({ sendMagicLink, expiresIn, disableSignUp })` |
| `apps/example-api/src/routes/auth.ts` | Extend `BA_SENSITIVE` for magic-link paths |
| `packages/email/src/templates/magic-link.ts` | New template |
| `packages/email/src/index.ts` | Export `buildMagicLinkEmailText` |
| `packages/email` tests | Template + builder smoke |
| `apps/example-web/src/routes/login.tsx` | Password \| Magic toggle + sent state |
| `apps/example-web/src/lib/schemas.ts` | Magic email schema (reuse email rules) |
| `apps/example-web/src/messages/fr.ts` + `en.ts` | Magic copy |
| `apps/example-api` tests | Integration: request magic (seeded user), disableSignUp no create, rate-limit path, no token leak in assertions |
| `AGENTS.md` and/or `docs/*` auth matrix | Document magic path |

## Data Model & Consumers

**Data structure:** [Data model](../visuals/59-b-magic-magic-link-auth-data-model.html)  
**Consumer map:** [Consumers](../visuals/59-b-magic-magic-link-auth-consumers.html)

| Consumer | Fields / contract | When | Status |
|----------|-------------------|------|--------|
| Login Magic UI | email, callbackURL | V1–V2 | this issue |
| `POST /api/auth/sign-in/magic-link` | email, callbackURL? | V1 | this issue (BA) |
| `GET /api/auth/magic-link/verify` | token (+ redirect) | V1 | this issue (BA) |
| `sendMagicLink` → EmailPort | to, magic URL, expiresHint | V1 | this issue |
| `baVerification` | stored token / expiry | V1 | existing BA |
| Session cookie | session_token | after verify | existing BA |
| Product apps | same plugin + UX pattern | later | future |
| First-access magic instead of set-password | product config | — | **out / follow-up** |

### API contracts

**`POST /api/auth/sign-in/magic-link`** — BA handler, rate-limited (`BA_SENSITIVE` + BA plugin).

```ts
// request (wire names — Better Auth magicLink plugin)
{
  email: string
  callbackURL?: string  // SPA origin path after verify
  name?: string         // only relevant if signup allowed — kit default: ignore / omit
}

// success: ~200; FE shows generic check-email (do not branch on body for existence)
// error: 429 rate limit → toast; validation → field error
// disableSignUp + unknown email: still prefer non-enumerating client UX
```

**`GET /api/auth/magic-link/verify`** — browser navigation from email (BA).

```ts
// query: token (+ error redirect variants)
// success: Set-Cookie session + redirect callbackURL
// failure: redirect with error (expired, used, new_user_signup_disabled, …) → login i18n
```

**Email template** — kit:

```ts
buildMagicLinkEmailText({
  to: string
  magicUrl: string
  expiresHint?: string  // e.g. "about 5 minutes"
})
```

## Breadboard

| ID | Affordance | Handler | Data |
|----|------------|---------|------|
| U1 | Login tab/toggle Password \| Magic | `login.tsx` local state | mode enum |
| U2 | Magic email field + submit | TanStack Form + schema | email |
| U3 | Check-email success panel | local `sent` state | — |
| U4 | Password form (existing) | existing onSubmit | email+password |
| N1 | `POST …/sign-in/magic-link` | BA handler + rate limit | email, callbackURL |
| N2 | `sendMagicLink` | EmailPort + template | magicUrl, to |
| N3 | `GET …/magic-link/verify` | BA handler + rate limit | token → session |
| S1 | D1 baVerification / baUser / baSession | BA adapter | existing tables |
| D1 | AGENTS/README auth matrix row | docs | — |

## Slices

| # | Slice | Demo | Affordance IDs |
|---|-------|------|----------------|
| **V1** | Server: `magicLink` plugin + template + `BA_SENSITIVE` + tests (request path, disableSignUp, no token leak) | curl/integration: seeded user gets email log; unknown email no signup | N1, N2, N3, S1 |
| **V2** | Client: login toggle + check-email UX + i18n + callbackURL | Dogfood local: request → Mailpit/log → click → session | U1–U4, N1, N3 |
| **V3** | Docs auth matrix + residual polish (error query on verify failure) | README/AGENTS row Password \| Magic | D1 |

## Edge cases

| Case | Handling |
|------|----------|
| Unknown email + signup off | No user create; client still check-email; verify of fake token fails |
| Expired / reused token | BA error redirect → i18n on login |
| Rate limit | 429 toast; no success claim |
| `ALLOW_PUBLIC_SIGNUP=true` | Plugin `disableSignUp: false`; document; tests cover default-off |
| Open redirect via callbackURL | Use BA trusted origins + kit safe path helper if FE builds callback from `next` |
| Email transport failure | Prefer generic client success still when BA swallows; log server-side; 5xx only if BA surfaces hard error |
| Password regression | Existing login tests stay green |

## Success Criteria

- [ ] **SC1** `magicLink` registered in `createBetterAuth` with `sendMagicLink` → EmailPort + kit template
- [ ] **SC2** Magic `disableSignUp` tracks `allowPublicSignup` (default **off** — no public account mint via magic)
- [ ] **SC3** `expiresIn` = 300s (5 min) documented
- [ ] **SC4** `BA_SENSITIVE` covers magic-link request + verify paths
- [ ] **SC5** Login UI has Password \| Magic modes; magic path shows generic check-email after submit
- [ ] **SC6** Integration test: existing seeded user can complete magic request path (email port mock/log assertion without leaking raw token in expect dumps)
- [ ] **SC7** Integration/unit: unknown email does not create user when signup disabled
- [ ] **SC8** Rate-limit path exercised or covered by BA_SENSITIVE allowlist test pattern
- [ ] **SC9** i18n FR/EN for magic copy
- [ ] **SC10** AGENTS/README auth matrix documents magic vs password vs sk_
- [ ] **SC11** `validate:full` green
- [ ] **SC12** No product-domain strings in packages; example-* only for UX

## χ — clarifications

none (frame + BA docs sufficient; first-access magic explicitly deferred)
