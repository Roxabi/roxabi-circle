---
title: "Plan: B-magic — Magic link auth"
issue: 59
spec: artifacts/specs/59-b-magic-magic-link-auth-spec.md
complexity: 5/10
tier: F-lite
generated: "2026-08-02T14:30:00Z"
status: approved
slices: "V1 V2 V3"
---

## Summary

Wire Better Auth `magicLink` into `createBetterAuth` with `sendMagicLink` → EmailPort + new kit template; fail-closed `disableSignUp` when public signup is off; extend `BA_SENSITIVE`; add Password | Magic login UX + i18n; tests + auth matrix docs. No D1 migration. All slices V1–V3 in one implement pass (tightly coupled dogfood path).

## Architecture

**Data flow:** [Data flow](../visuals/59-b-magic-magic-link-auth-data-flow.html)  
**File map:** [File map](../visuals/59-b-magic-magic-link-auth-file-map.html)

Login Magic mode → `POST /api/auth/sign-in/magic-link` (rate-limited) → BA plugin mints token (5m) → EmailPort → user opens `GET /api/auth/magic-link/verify` → session cookie → SPA callback.

## Bootstrap Context

- Spec approved; frame F-lite; analysis skipped; χ=0.
- Pattern: `sendResetPassword` in `apps/example-api/src/lib/better-auth.ts` + `packages/email` reset-password template.
- Pattern: forgot-password generic success (enumeration-safe) in `apps/example-web/src/routes/forgot-password.tsx`.
- `BA_SENSITIVE` in `apps/example-api/src/routes/auth.ts` — extend for magic paths.
- BA docs: `magicLink` from `better-auth/plugins`; `expiresIn` default 300; plugin rateLimit 5/60s; `disableSignUp` on plugin.

## Agents

| Agent | Task count | Files |
|-------|-----------|-------|
| backend-dev-A | 2 | `better-auth.ts`, `auth.ts` BA_SENSITIVE |
| backend-dev-B | 2 | email template + export + package tests |
| frontend-dev-A | 3 | schemas, i18n, login.tsx toggle |
| tester-A | 2 | API magic-link integration + validate:full |
| doc-writer-A | 1 | AGENTS/README auth matrix |

## Wave Structure

4 waves, max 2 parallel. Elapsed ~0.5–1 day.

| Wave | Trigger | Agents | Tasks |
|------|---------|--------|-------|
| 1 | start | backend-dev-A ∥ backend-dev-B | T1 plugin+sendMagicLink · T2 template+export |
| 2 | Wave 1 | backend-dev-A · frontend-dev-A ∥ | T3 BA_SENSITIVE · T4 schemas+i18n |
| 3 | Wave 2 | frontend-dev-A · tester-A | T5 login UX · T6 API tests |
| 4 | Wave 3 | doc-writer-A · tester-A | T7 docs · T8 validate:full RED-GATE |

### Budget — per task

| Task | Items | Class | Est. ops | Split? |
|------|-------|-------|----------|--------|
| T1 magicLink plugin | 1 | judgmental | 6 | — |
| T2 email template | 2 | bounded | 4 | — |
| T3 BA_SENSITIVE | 1 | trivial | 2 | — |
| T4 schemas + i18n | 2 | bounded | 4 | — |
| T5 login UX | 1 | judgmental | 8 | — |
| T6 API integration tests | 3 | judgmental | 10 | — |
| T7 auth matrix docs | 1 | bounded | 3 | — |
| T8 validate:full | 1 | bounded | 3 | — |

**Total estimated ops: ~40**

### Budget — per agent instance

| Instance | Tasks | Σ ops | Subjects | Split? |
|----------|-------|-------|----------|--------|
| backend-dev-A | T1, T3 | 8 | auth-plugin, rate-limit | — |
| backend-dev-B | T2 | 4 | email | — |
| frontend-dev-A | T4, T5 | 12 | forms, login | — |
| tester-A | T6, T8 | 13 | auth-tests | — |
| doc-writer-A | T7 | 3 | docs | — |

## Consistency Report

| Spec SC | Covered by |
|---------|------------|
| SC1, SC2, SC3 | T1, T2 |
| SC4 | T3 |
| SC5, SC9 | T4, T5 |
| SC6, SC7, SC8 | T6 |
| SC10 | T7 |
| SC11, SC12 | T8 (+ code tasks) |
| Uncovered | none |
| Untraced tasks | none |

## Micro-Tasks

### T1 — Register `magicLink` in createBetterAuth  
- **File:** `apps/example-api/src/lib/better-auth.ts`  
- **Agent:** backend-dev-A · subject: auth-plugin · slice: V1 · phase: GREEN  
- **Spec:** SC1–SC3 · N1, N2, N3  
- **Snippet:**
```ts
import { magicLink } from 'better-auth/plugins'
import { buildMagicLinkEmailText } from '@gosilex/email'
// plugins: [ organization({...}), magicLink({
//   expiresIn: 300,
//   disableSignUp: !publicSignup,
//   sendMagicLink: async ({ email, url }) => {
//     const tmpl = buildMagicLinkEmailText({ to: email, magicUrl: url, expiresHint: 'about 5 minutes' })
//     await resolveEmailPort(env).send({ to: tmpl.to, subject: tmpl.subject, text: tmpl.text, html: tmpl.html })
//   },
// }) ]
```
- **Verify:** `bun run --filter @gosilex/example-api typecheck`  
- **Est:** 8 min · difficulty 3 · [P]

### T2 — Magic-link email template + builder export  
- **Files:** `packages/email/src/templates/magic-link.ts`, `packages/email/src/index.ts`, `packages/email` tests  
- **Agent:** backend-dev-B · subject: email · slice: V1 · phase: GREEN  
- **Spec:** SC1 · N2  
- **Snippet:** Mirror `reset-password.ts` / `buildResetPasswordEmailText`; subject like `Sign in — GOSILEX kit`; escape HTML URL; export builder  
- **Verify:** `bun run --filter @gosilex/email test`  
- **Est:** 6 min · difficulty 2 · [P]

### T3 — Extend BA_SENSITIVE for magic paths  
- **File:** `apps/example-api/src/routes/auth.ts`  
- **Agent:** backend-dev-A · subject: rate-limit · slice: V1 · phase: GREEN  
- **Spec:** SC4 · N1, N3  
- **Snippet:** add `sign-in/magic-link|magic-link/verify` to `BA_SENSITIVE` regex  
- **Verify:** unit/app test that magic path hits rate limit key pattern (or extend existing allowlist test)  
- **Est:** 3 min · difficulty 1 · blockedBy: T1

### T4 — Zod + i18n magic keys  
- **Files:** `apps/example-web/src/lib/schemas.ts`, `messages/fr.ts`, `messages/en.ts`  
- **Agent:** frontend-dev-A · subject: forms · slice: V2 · phase: GREEN  
- **Spec:** SC5, SC9  
- **Snippet:** reuse email validation for magic form; keys: tab labels, submit, check-email title/desc, errors (rate limit, generic fail)  
- **Verify:** typecheck example-web messages  
- **Est:** 5 min · difficulty 2 · [P] · blockedBy: — (can start after Wave1 or parallel Wave2)

### T5 — Login Password | Magic toggle + check-email  
- **File:** `apps/example-web/src/routes/login.tsx` (extract if >300 lines)  
- **Agent:** frontend-dev-A · subject: login · slice: V2 · phase: GREEN  
- **Spec:** SC5 · U1–U4, N1  
- **Snippet:** mode state; magic submit → `POST /api/auth/sign-in/magic-link` with `{ email, callbackURL }` where callbackURL = origin + safe next or `/app`; always show check-email on non-429; 429 toast; password path unchanged  
- **Verify:** typecheck + manual dogfood optional  
- **Est:** 12 min · difficulty 3 · blockedBy: T4

### T6 — API integration tests (magic)  
- **Files:** `apps/example-api/src/magic-link.test.ts` (or extend app.test)  
- **Agent:** tester-A · subject: auth-tests · slice: V1 · phase: GREEN  
- **Spec:** SC6–SC8 · N1, N2, N3  
- **Snippet:** seeded user → POST sign-in/magic-link → expect <400; assert email port / log side-effect without dumping raw token in expect strings; unknown email + disableSignUp → no new baUser; BA_SENSITIVE path covered  
- **Verify:** `bun run --filter @gosilex/example-api test`  
- **Est:** 15 min · difficulty 4 · blockedBy: T1, T2, T3

### T7 — Auth matrix docs  
- **Files:** `AGENTS.md` and/or `docs/` auth section (README if present)  
- **Agent:** doc-writer-A · subject: docs · slice: V3 · phase: GREEN  
- **Spec:** SC10  
- **Snippet:** table row Password | Magic link | cookie session | sk_ Bearer; note TTL 5m, signup off default, EmailPort  
- **Verify:** file exists, no product-domain strings  
- **Est:** 5 min · difficulty 1 · blockedBy: T1

### T8 — validate:full RED-GATE  
- **Files:** — (gate)  
- **Agent:** tester-A · subject: gate · slice: V3 · phase: RED-GATE  
- **Spec:** SC11, SC12  
- **Snippet:** `bun run validate:full` in worktree  
- **Verify:** exit 0  
- **Est:** 10 min · difficulty 2 · blockedBy: T5, T6, T7

## Task Seeding Blueprint

<!-- Used by /implement to seed TaskCreate calls on session start. -->

### Wave 1 — no deps, 2 agents ∥

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T1 | backend-dev-A | — | auth-plugin |
| T2 | backend-dev-B | — | email |

### Wave 2 — after Wave 1

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T3 | backend-dev-A | T1 | rate-limit |
| T4 | frontend-dev-A | — | forms |

### Wave 3 — after Wave 2

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T5 | frontend-dev-A | T4 | login |
| T6 | tester-A | T1, T2, T3 | auth-tests |

### Wave 4 — after Wave 3

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T7 | doc-writer-A | T1 | docs |
| T8 | tester-A | T5, T6, T7 | gate |

## Ref patterns (for implement agents)

| Pattern | Path |
|---------|------|
| sendResetPassword + EmailPort | `apps/example-api/src/lib/better-auth.ts` |
| Email template | `packages/email/src/templates/reset-password.ts` |
| Enumeration-safe UX | `apps/example-web/src/routes/forgot-password.tsx` |
| BA_SENSITIVE | `apps/example-api/src/routes/auth.ts` |
| Password login form | `apps/example-web/src/routes/login.tsx` |
| Auth integration fixtures | `apps/example-api/src/password-reset.test.ts`, `app.test.ts` |
