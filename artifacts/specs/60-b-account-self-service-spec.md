---
title: "B-account — Account self-service (password / profile / sessions)"
issue: 60
status: approved
tier: F-lite
date: 2026-08-02
spark: 130
promoted-from: artifacts/frames/60-b-account-self-service-frame.md
---

## Context

- **Issue:** [#60](https://github.com/go-silex/silex-boilerplate/issues/60) · Spark #130
- **Frame:** `artifacts/frames/60-b-account-self-service-frame.md` (approved, F-lite)
- **Analysis:** skipped (F-lite)
- **Depends:** BA-only sessions ADR-0002 ✅ · shells A4 ✅ · password reset + forgot-password ✅ · B-users #58 complementary (BO provision, not self-service)
- **ADRs:** 0002 BA-only (no HMAC) · dual credential cookie **|** Bearer `sk_` unchanged

## Goal

Authenticated users change password, update display name, and manage session hygiene from `/app/settings` — dogfoodable in example-web, i18n FR/EN, no secrets in logs/UI.

## Users

| Actor | Role |
|-------|------|
| **End user (session cookie)** | Primary: change password, edit name, sign out; compromise hygiene via revoke-other-sessions **on password change** |
| **Platform actor (staff / super_admin)** | Same self-service for own account via `/app/settings` (not BO admin-of-others). MVP discoverability: URL or switch to app plane (no `/admin` account settings shell) |
| **Product engineer** | Copies BA endpoint + form patterns into `apps/<product>-*` |
| **API-key client (`sk_`)** | Out of scope for this surface (no cookies; no change-password via key) |

## Locked decisions

| Topic | Decision |
|-------|----------|
| Surface | **Extend** existing `/app/settings` Account card — no new top-level shell; optional hash/section anchors `#password` / `#profile` |
| Admin plane | **No** duplicate `/admin/settings/account` in MVP — platform users use `/app/settings` for self-service (BO settings remain integrations-only) |
| Change password | BA **`POST /api/auth/change-password`** body `{ currentPassword, newPassword, revokeOtherSessions? }` — already on `BA_SENSITIVE` rate-limit allowlist |
| Profile | BA **`POST /api/auth/update-user`** for **name only** (trim; min 1; max **80** FE). Email change **out of scope**. `update-user` stays **off** `BA_SENSITIVE` (name-only) |
| `GET /api/me` | Add **`name: string`** from `baUser.name` (omit empty if needed; prefer non-null string). No separate get-session call |
| “Sign out everywhere” MVP | **Only** via `revokeOtherSessions: true` on **change-password** (checkbox default **on**). **Not** a standalone revoke-all control. Session list / revoke-one **out of MVP** |
| Sign-out current | Reuse shell logout (`POST /api/auth/sign-out`) + **CTA on settings** for discoverability |
| Session list UI | **Out of MVP** — multi-session plugin or token-safe list endpoint = follow-up |
| Auth method gate | Forms require session cookie path; page is AuthGate-protected |
| Min password | Align with reset-password (kit: ≥ 8 chars) |
| Wrong current password | Map by **HTTP status / BA category** → **i18n catalog key** (mirror login/forgot-password toast style). Do **not** require kit `ApiError.code` from BA body (BA envelope ≠ kit). Never echo password |
| Session freshness | BA `sensitiveSessionMiddleware` + default `freshAge` (~1 day on `session.createdAt`). **MVP keeps BA default** (no `freshAge: 0` override). Edge: if BA rejects as not-fresh / re-auth required → dedicated i18n toast (not “wrong password”) + CTA re-login or forgot-password |
| Secrets | Never log or render raw password, password hash, or session token in UI / server logs for these flows / tests. FE **discards** any BA success payload fields it does not need (ignore `token` if present). Do **not** require wire body empty of all token-like keys if BA returns session/user objects |
| Schema migration | **None** — `user.name` already in BA D1 schema |
| i18n | All new copy in `messages/fr.ts` + `en.ts` |
| File length | If `settings.tsx` approaches quality `max_lines: 300`, extract `AccountPasswordForm` / `AccountProfileForm` components in example-web (no new package) |
| Tests | See Success Criteria SC8–SC10 |

## Expected Behavior

1. User opens `/app/settings` (session cookie). Account card shows **email** (read-only), **display name** (editable), **subject** (read-only mono), roles/orgs as today.
2. User edits name → Save → `POST /api/auth/update-user` `{ name }` → success toast → `useMe` refetch shows new name via `GET /api/me`.
3. User submits Change password: current + new + confirm + checkbox **Revoke other sessions** (default checked) → `POST /api/auth/change-password` with `revokeOtherSessions` wire name → success toast; if true, **other** devices lose session; **current** session remains valid. Form fields cleared after success.
4. Wrong current password → i18n error toast (catalog key); keep current password field; **clear new+confirm only**.
5. Session not fresh / BA rejects sensitive change → i18n “re-authenticate” (or generic cannot-change); **do not** label as wrong password if distinguishable; CTA login or forgot-password.
6. User clicks **Sign out** on settings → same as shell logout → `/login`.
7. Unauthenticated visit → AuthGate → `/login`.
8. Compromise story for “sign out everywhere”: **change password with revoke other sessions checked** (default). Standalone session list remains out of scope.

## File touch list (planner)

| Path | Change |
|------|--------|
| `apps/example-web/src/routes/settings.tsx` | Account forms (or extract sibling components) |
| `apps/example-web/src/lib/schemas.ts` (+ tests) | `changePasswordSchema`, `profileNameSchema` |
| `apps/example-web/src/lib/auth.ts` | `MeResponse.name` |
| `apps/example-web/src/messages/fr.ts` + `en.ts` | All new strings |
| `apps/example-web/src/components/app-shell.tsx` | Optional extract shared `logout()` for settings CTA |
| `apps/example-api/src/routes/me.ts` | Return `name` from `baUser.name` |
| `apps/example-api` tests (app / auth paths) | change-password smoke + wrong password; no password leak in assertions/logs |
| `apps/example-api/src/routes/auth.ts` | **No change expected** — `change-password` already rate-limited |

## Data Model & Consumers

**Data structure:** [Data model](../visuals/60-b-account-self-service-data-model.html)  
**Consumer map:** [Consumers](../visuals/60-b-account-self-service-consumers.html)

| Consumer | Fields / contract | When | Status |
|----------|-------------------|------|--------|
| Settings Account UI | email, name, subject, platformRole, orgs | S1–S2 | this issue |
| `POST /api/auth/change-password` | currentPassword, newPassword, revokeOtherSessions? | S1 | this issue (BA) |
| `POST /api/auth/update-user` | name | S2 | this issue (BA) |
| `GET /api/me` | + name | S2 | this issue (kit) |
| Shell NavUser logout | sign-out | existing | this issue (CTA mirror) |
| Product apps | same BA endpoints + form patterns | later | future |
| Session list UI | session metadata | — | **out / follow-up** |

### API contracts

**`POST /api/auth/change-password`** — BA handler, session cookie required, rate-limited (`BA_SENSITIVE`).

```ts
// request (wire names — Better Auth 1.6.x emailAndPassword)
{
  currentPassword: string
  newPassword: string
  revokeOtherSessions?: boolean  // UI default true
}

// success: ~200; may include user and optional token when revokeOtherSessions
//   → FE discards token; never display; never log password fields
// error: wrong password / validation / not-fresh → map status → i18n catalog key
//   (same toast path style as login/forgot-password; BA body may lack kit error.code)
```

**`POST /api/auth/update-user`** — BA handler, session cookie. Not on `BA_SENSITIVE`.

```ts
// request
{ name: string }  // trim; min 1 after trim; max 80 kit FE

// success — may return user object; UI uses success toast + me refetch only
```

**`GET /api/me`** — kit (extend).

```ts
// response addition
{
  subject: string
  email?: string
  name?: string  // NEW — from baUser.name
  authMethod: string
  platformRole: ...
  orgs: ...
  requestId: string
}
```

## Breadboard

### UI affordances

| ID | Affordance | Handler | Data |
|----|------------|---------|------|
| U1 | Account card — email (read-only) | render | `me.email` |
| U2 | Display name field + Save | `onSubmitProfile` | `update-user` + invalidate `me` |
| U3 | Change password form | `onSubmitPassword` | `change-password` |
| U4 | Revoke other sessions checkbox | form state | `revokeOtherSessions` (default true) |
| U5 | Sign out button (settings) | `logout()` shared helper | `sign-out` |
| U6 | Validation errors (Zod) | field errors | local schemas |
| U7 | Success / error toasts | sonner | i18n keys |

### Network / server

| ID | Endpoint / unit | Role |
|----|-----------------|------|
| N1 | `POST /api/auth/change-password` | BA — hash verify + update + optional revoke |
| N2 | `POST /api/auth/update-user` | BA — name update |
| N3 | `GET /api/me` | kit — include `name` |
| N4 | `POST /api/auth/sign-out` | BA — existing |
| N5 | Rate limit `BA_SENSITIVE` | existing — keep `change-password` |

### Shared (FE units — IDs `SH*`, not slice ids)

| ID | Unit | Role |
|----|------|------|
| SH1 | `changePasswordSchema` / `profileNameSchema` | FE Zod (mirror reset-password min length) |
| SH2 | i18n catalog keys FR/EN | all new strings |
| SH3 | extract `logout` helper | optional DRY between shell + settings |

### System edges

| Flow | Steps |
|------|--------|
| Change password | U3+U4 → N1 (N5) → U7; optional other sessions dead |
| Profile name | U2 → N2 → N3 invalidate → U1 |
| Sign out | U5 → N4 → `/login` |

## Slices

| Slice | Demo | Affords | Depends |
|-------|------|---------|---------|
| **S1** Change password | Logged-in user rotates password; revoke other sessions default on | U3, U4, U6, U7, N1, N5, SH1, SH2 | — |
| **S2** Profile name + me.name | Edit display name; me returns name | U1, U2, N2, N3, SH1, SH2 | parallel OK with S1 |
| **S3** Sign-out CTA + smoke/sec tests | Settings logout; tests green; secret hygiene | U5, N4, SH3, tests | S1 |

Vertical increments: **S1 alone** is dogfoodable DoD for “change password” (must not block behind S2). S2+S3 complete JTBD.

## Edge cases

| Case | Handling |
|------|----------|
| Wrong current password | i18n toast; keep current; clear new+confirm |
| Session not fresh / re-auth required | i18n re-auth toast (not wrong-password); CTA login or forgot-password; MVP keeps BA default `freshAge` |
| New password too short / mismatch confirm | FE Zod before network |
| Empty / whitespace name | FE reject (min 1 after trim) |
| Network / 429 rate limit | Toast generic rate-limit or mapped message |
| BA returns user + optional token when `revokeOtherSessions` | **Never** display or log token; discard in FE |
| User has no password credential (OAuth-only future) | Out of MVP; generic cannot-change toast |
| Concurrent tabs after revoke | Other tabs fail next `/api/me` → 401 → login |
| CSRF / Origin | Existing origin-guard + SameSite on BA POSTs |
| XSS in name | React text nodes; max 80; no HTML |
| sk_ / no session | AuthGate; no key-based password form |

## Success Criteria

- [ ] **SC1** Authenticated user can change password from `/app/settings` with current + new password (S1)
- [ ] **SC2** Checkbox `revokeOtherSessions` defaults **true**, is sent under that wire name, and is documented as the MVP “sign out other devices” path (S1)
- [ ] **SC3** Wrong current password shows i18n catalog toast (status-mapped; not raw BA / not password echo) (S1)
- [ ] **SC4** User can update display **name** from settings (S2)
- [ ] **SC5** `GET /api/me` returns `name` after update (API assert) (S2)
- [ ] **SC6** Email remains read-only (no email-change flow) (S2)
- [ ] **SC7** Settings includes Sign out CTA that clears session and lands on `/login` (S3)
- [ ] **SC8** All new UI strings exist in FR and EN catalogs (S1–S3)
- [ ] **SC9** Automated tests: change-password happy path + wrong current password (S3)
- [ ] **SC10** Secret hygiene: tests assert no raw password in responses/logs of covered paths; UI never renders session token; FE ignores BA `token` if present (S3)
- [ ] **SC11** `bun run validate:full` green on the feature branch (S3)
- [ ] **SC12** No new BA plugins (multi-session / admin) required for MVP (all slices)

## Out of scope (restated)

- 2FA / passkeys / WebAuthn  
- Avatar upload R2  
- Email change + verification  
- Session list / revoke-one-session UI / standalone revoke-all without password  
- Admin force password reset of another user (B-users / existing reset)  
- Public signup changes  
- Duplicate `/admin` account settings shell (optional deep-link follow-up only)

## Open follow-ups (non-blocking)

- Session list UI (multi-session plugin or kit metadata-only endpoint)  
- Email change with verification  
- Admin NavUser deep-link → `/app/settings`  
- Optional `freshAge` kit policy if dogfood friction is high  

## Expert review notes (incorporated)

| Source | Incorporated |
|--------|----------------|
| Architect F1–F3 | BA→toast mapping; freshness edge + keep default; secret assert split UI/log vs wire |
| Doc-writer | SH* ids; file touch list; system edges; term `revokeOtherSessions`; SC numbering |
| Product-lead | Logs in SC10; “everywhere” = revoke on password change only |
