---
title: "Plan: B-users — User provisioning BO + first login + roles/orgs"
issue: 58
spec: artifacts/specs/58-b-users-user-provisioning-spec.md
complexity: 8/10
tier: F-full
generated: "2026-08-01T22:00:00Z"
status: approved
slices: "S1 S2 S3 S4 S5"
---

## Summary

Implement Shape 1: kit-owned `POST/GET /api/admin/users` + welcome set-password (BA verification + EmailPort), first-login land via existing reset UI + `defaultHomePath`, S3 invite unknown-email bootstrap, BO `/admin/users` UI, and CP-IDOR ≥ 8. Patterns copy invites (rate limit, email-last compensate) and seed (BA user+account insert).

## Architecture

### Data Flow

**Diagram:** [Provision + first-login flow](../visuals/58-b-users-user-provisioning-data-flow.html)

BO → admin-users route → service → repos (user/account/role/member/verification) → EmailPort last → mail → reset UI → session → `/api/me` → plane.

### File × Function Map

**Diagram:** [File map](../visuals/58-b-users-user-provisioning-file-map.html)

New: welcome template, admin-users service/route/tests, admin users page. Touch: users repo, invitations, app mount, reset-password, routeTree, i18n.

## Bootstrap Context

- Frame + analysis approved: Shape 1 only; BA admin plugin eval-only.
- Spec locks: staff org-scope, ceiling, session-only mutations, BA reset token reuse, 409 on email, compensate on email fail.
- Ref patterns: `services/invitations.ts`, `seed/seed-tenancy.ts`, `password-reset.test.ts`, `lib/better-auth.ts`, `routes/org-members.tsx` (form UX).

## Agents

| Agent | Task count | Files |
|-------|-----------|-------|
| backend-dev-A | 4 | email template, users repo, admin-users service, routes |
| backend-dev-B | 2 | invitations S3, app mount wiring |
| frontend-dev-A | 3 | admin/users, reset-password, routeTree+i18n |
| tester-A | 3 | S1 tests, S5 IDOR, S3 tests |
| security-auditor | 1 | review IDOR matrix (post S5) — advisory |

## Wave Structure

5 waves, max 2 parallel agents. Elapsed ~1–2 weeks vs sequential ~same (serial auth critical path).

| Wave | Trigger | Agents | Tasks |
|------|---------|--------|-------|
| 1 | start | backend-dev-A | T1→T2→T3→T4 (email → repo → service → routes) |
| 2 | Wave 1 | tester-A ∥ backend-dev-B | T5 (S1 tests) · T6 (app mount if not in T4) |
| 3 | Wave 2 | frontend-dev-A | T7→T8 (reset land + admin UI shell) |
| 4 | Wave 3 | backend-dev-B · tester-A | T9 S3 invite · T10 S3 tests |
| 5 | Wave 4 | frontend-dev-A · tester-A | T11 i18n/nav polish · T12 full IDOR + validate |

### Budget — per task

| Task | Items | Class | Est. ops | Split? |
|------|-------|-------|----------|--------|
| T1 welcome template | 2 | bounded | 3 | — |
| T2 users repo insert/list/delete | 3 | judgmental | 6 | — |
| T3 admin-users service | 4 | judgmental | 8 | — |
| T4 admin-users routes + mount | 2 | bounded | 4 | — |
| T5 S1 tests | 5 | judgmental | 8 | — |
| T6 reset-password welcome land | 2 | bounded | 4 | — |
| T7 admin users page | 3 | judgmental | 6 | — |
| T8 routeTree + nav | 1 | trivial | 2 | — |
| T9 invitations S3 | 2 | judgmental | 6 | — |
| T10 S3 tests | 2 | bounded | 4 | — |
| T11 i18n FR/EN | 2 | bounded | 3 | — |
| T12 IDOR suite + validate | 4 | exploratory | 12 | — |

**Total estimated ops: ~66** (split across instances; no single task > 50)

### Budget — per agent instance

| Instance | Tasks | Σ ops | Subjects | Split? |
|----------|-------|-------|----------|--------|
| backend-dev-A | T1–T4 | 21 | email, repo, service, http | — (chain sequential) |
| backend-dev-B | T9 | 6 | invite | — |
| frontend-dev-A | T6–T8,T11 | 15 | reset, admin-ui, i18n | — |
| tester-A | T5,T10,T12 | 24 | tests | — |

## Consistency Report

- Criteria covered: SC1–SC12 / 12
- Uncovered criteria: none
- Tasks without spec backing: none
- Gold plating exemptions: disable/suspend table deferred (spec)

## Micro-Tasks

### Slice S1 — Admin create + welcome email

#### Task 1: Welcome set-password email template [P] → backend-dev-A
- **File:** `packages/email/src/templates/welcome-set-password.ts` + `packages/email/src/index.ts`
- **Snippet:** `export function buildWelcomeSetPasswordEmailText(input: { to; setPasswordUrl; expiresHint; name? })`
- **Verify:** `bun run --filter @gosilex/email test`
- **Expected:** template tests or index export green
- **Time:** 15 min · **Difficulty:** 2
- **Traces:** SC4, N5 · **Phase:** GREEN · **Subject:** email

#### Task 2: BA user insert / list / compensate helpers → backend-dev-A
- **File:** `apps/example-api/src/repos/users.ts`
- **Snippet:** `insertBaUserWithCredential(db, { id, email, name, passwordHash })` using `better-auth/crypto.hashPassword`; `listBaUsers`; cascade delete for compensate
- **Verify:** unit via later T5
- **Time:** 25 min · **Difficulty:** 3
- **Traces:** SC1, N3 · **Phase:** GREEN · **Subject:** repo · **blockedBy:** —

#### Task 3: admin-users service (create, list, resend, ceiling, scope) → backend-dev-A
- **File:** `apps/example-api/src/services/admin-users.ts` (new)
- **Snippet:** `createAdminUser(db, { actor, email, name, platformRole, memberships, sendEmail, emailPort, acceptBaseUrl })` — rate limit, ceiling, org scope, email last + compensate
- **Verify:** T5
- **Time:** 45 min · **Difficulty:** 5
- **Traces:** SC1–SC4, SC8–SC9, N2 · **Phase:** GREEN · **Subject:** service · **blockedBy:** T1,T2

#### Task 4: admin-users routes + mount → backend-dev-A
- **File:** `apps/example-api/src/routes/admin-users.ts` (new), `apps/example-api/src/app.ts`
- **Snippet:** Zod body; session-only (reject sk_); platform actor guard
- **Verify:** `bun run --filter @gosilex/example-api typecheck`
- **Time:** 25 min · **Difficulty:** 3
- **Traces:** SC1, N1 · **Phase:** GREEN · **Subject:** http · **blockedBy:** T3

#### Task 5: S1 API tests (happy + email fail + ceiling + rate) → tester-A
- **File:** `apps/example-api/src/admin-users.test.ts` (new)
- **Snippet:** memory env + seed; mock EmailPort fail; staff/super personas
- **Verify:** `bun run --filter @gosilex/example-api test -- admin-users`
- **Expected:** green · **Time:** 40 min · **Difficulty:** 4
- **Traces:** SC1–SC4, SC8 · **Phase:** RED-GATE S1 · **Subject:** tests · **blockedBy:** T4

### Slice S2 — First-login UI land

#### Task 6: Reset-password welcome UX + post-success land → frontend-dev-A
- **File:** `apps/example-web/src/routes/reset-password.tsx` (+ auth helpers if needed)
- **Snippet:** after success → fetch me → `navigate({ to: defaultHomePath(me) })`; optional welcome title via query/flag
- **Verify:** `bun run --filter @gosilex/example-web typecheck` + unit if present
- **Time:** 30 min · **Difficulty:** 3
- **Traces:** SC5, SC6, U4, U5 · **Phase:** GREEN · **Subject:** reset · **blockedBy:** T5

### Slice S4 — BO UI (after S2 for session land; can start after T5)

#### Task 7: `/admin/users` list + create form → frontend-dev-A
- **File:** `apps/example-web/src/routes/admin/users.tsx` (new)
- **Snippet:** TanStack Query list; form email/name/plane/memberships/send; toast errors
- **Verify:** typecheck
- **Time:** 45 min · **Difficulty:** 4
- **Traces:** SC11, U1–U3 · **Phase:** GREEN · **Subject:** admin-ui · **blockedBy:** T5

#### Task 8: routeTree + admin nav link → frontend-dev-A
- **File:** `apps/example-web/src/routeTree.tsx`, `components/app-shell.tsx`
- **Snippet:** path `/admin/users`, NavItem Users
- **Verify:** typecheck
- **Time:** 15 min · **Difficulty:** 2
- **Traces:** SC11 · **Phase:** GREEN · **Subject:** admin-ui · **blockedBy:** T7

### Slice S3 — Invite without account

#### Task 9: invitations unknown-email bootstrap → backend-dev-B
- **File:** `apps/example-api/src/services/invitations.ts`
- **Snippet:** if !findBaUserByEmail → provision shell (shared helper from admin-users or users service) + invite + welcome/invite email strategy per spec
- **Verify:** T10
- **Time:** 35 min · **Difficulty:** 4
- **Traces:** SC7, N7 · **Phase:** GREEN · **Subject:** invite · **blockedBy:** T5

#### Task 10: S3 tests → tester-A
- **File:** `apps/example-api/src/invitations.test.ts` (extend)
- **Snippet:** invite unknown → user exists + pending invite; no ALLOW_PUBLIC_SIGNUP
- **Verify:** filter invitations tests green
- **Time:** 25 min · **Difficulty:** 3
- **Traces:** SC7 · **Phase:** RED-GATE S3 · **Subject:** tests · **blockedBy:** T9

### Slice S5 — Security + polish

#### Task 11: i18n FR/EN keys for admin users + welcome copy → frontend-dev-A
- **File:** example-web i18n catalogs
- **Verify:** typecheck / i18n check if any
- **Time:** 20 min · **Difficulty:** 2
- **Traces:** SC11 · **Phase:** GREEN · **Subject:** i18n · **blockedBy:** T7

#### Task 12: CP-IDOR ≥ 8 + validate:full → tester-A
- **File:** `admin-users.test.ts` (+ invitations)
- **Snippet:** cases CP-IDOR-1..8 from spec; sk_ 403; token reuse/expiry
- **Verify:** `bun run validate:full` (worktree)
- **Expected:** all green · **Time:** 50 min · **Difficulty:** 5
- **Traces:** SC9, SC10, SC12 · **Phase:** RED-GATE epic · **Subject:** tests · **blockedBy:** T6,T9,T10,T11

## Task Seeding Blueprint

### Wave 1 — sequential backend spine

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T1 | backend-dev-A | — | email |
| T2 | backend-dev-A | — | repo |
| T3 | backend-dev-A | T1,T2 | service |
| T4 | backend-dev-A | T3 | http |

### Wave 2 — S1 gate

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T5 | tester-A | T4 | tests |

### Wave 3 — FE first-login + BO

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T6 | frontend-dev-A | T5 | reset |
| T7 | frontend-dev-A | T5 | admin-ui |
| T8 | frontend-dev-A | T7 | admin-ui |
| T11 | frontend-dev-A | T7 | i18n |

### Wave 4 — S3

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T9 | backend-dev-B | T5 | invite |
| T10 | tester-A | T9 | tests |

### Wave 5 — security bar

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T12 | tester-A | T6,T10,T11 | tests |

## Ref patterns (inject to implement agents)

- `apps/example-api/src/services/invitations.ts` — rate limit + email fail cancel
- `apps/example-api/src/seed/seed-tenancy.ts` — BA user+account insert
- `apps/example-api/src/password-reset.test.ts` — verification token read
- `apps/example-api/src/lib/better-auth.ts` — disableSignUp + reset email
- `apps/example-web/src/routes/org-members.tsx` — invite form UX
- `apps/example-web/src/lib/auth.ts` — `defaultHomePath`

## Task IDs

<!-- Filled on plan approval by /plan Step 6b -->
