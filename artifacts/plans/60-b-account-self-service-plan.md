---
title: "Plan: B-account — Account self-service"
issue: 60
spec: artifacts/specs/60-b-account-self-service-spec.md
complexity: 4/10
tier: F-lite
generated: "2026-08-02T10:50:00Z"
status: approved
slices: "S1 S2 S3"
---

## Summary

Extend `/app/settings` with change-password (BA `POST /api/auth/change-password` + `revokeOtherSessions` default on), profile name (`update-user` + `GET /api/me.name`), and a settings sign-out CTA. i18n FR/EN, Zod FE, smoke/sec tests. No BA plugins, no D1 migration.

## Architecture

**Data flow:** [Data flow](../visuals/60-b-account-self-service-data-flow.html)  
**File map:** [File map](../visuals/60-b-account-self-service-file-map.html)

Settings UI → `apiFetch` (cookie) → BA handler (rate-limited change-password) → D1 BA tables; `useMe` → kit `GET /api/me` (+name); errors → status-mapped i18n toasts.

## Bootstrap Context

- Spec approved; frame F-lite; analysis skipped.
- BA 1.6.x: `change-password`, `update-user`, `sign-out` already on `/api/auth/*`.
- `BA_SENSITIVE` already includes `change-password`.
- Patterns: `reset-password.tsx` / `login.tsx` forms, `schemas.ts` min-8, `app-shell.tsx` logout, `me.ts` baUser email load.

## Agents

| Agent | Task count | Files |
|-------|-----------|-------|
| backend-dev-A | 2 | `me.ts`, API smoke/sec tests |
| frontend-dev-A | 4 | schemas, settings (+extract if needed), i18n, shell logout share |
| tester-A | 2 | FE schema unit + S3 secret hygiene asserts (may fold into backend tests) |

## Wave Structure

3 waves, max 2 parallel. Elapsed ~0.5–1 day vs sequential same order of magnitude.

| Wave | Trigger | Agents | Tasks |
|------|---------|--------|-------|
| 1 | start | backend-dev-A ∥ frontend-dev-A | T1 me.name · T2 schemas+i18n keys |
| 2 | Wave 1 | frontend-dev-A | T3→T4 password form → profile form + logout CTA |
| 3 | Wave 2 | backend-dev-A · tester-A | T5 API tests · T6 FE schema tests + validate:full gate |

### Budget — per task

| Task | Items | Class | Est. ops | Split? |
|------|-------|-------|----------|--------|
| T1 me.name | 1 | bounded | 3 | — |
| T2 schemas + i18n | 2 | bounded | 4 | — |
| T3 change-password UI | 1 | judgmental | 6 | — |
| T4 profile + logout CTA | 1 | judgmental | 5 | — |
| T5 API smoke/sec | 3 | judgmental | 8 | — |
| T6 FE unit + validate | 2 | bounded | 4 | — |

**Total estimated ops: ~30**

### Budget — per agent instance

| Instance | Tasks | Σ ops | Subjects | Split? |
|----------|-------|-------|----------|--------|
| backend-dev-A | T1, T5 | 11 | me, auth-tests | — |
| frontend-dev-A | T2, T3, T4 | 15 | forms, i18n | — |
| tester-A | T6 | 4 | schema | — |

## Consistency Report

| Spec SC | Covered by |
|---------|------------|
| SC1–SC3, SC12 | T2, T3, T5 |
| SC4–SC6 | T1, T4 |
| SC7 | T4 |
| SC8 | T2 |
| SC9–SC11 | T5, T6 |
| Uncovered | none |
| Untraced tasks | none |

## Micro-Tasks

### T1 — Expose `name` on GET /api/me  
- **File:** `apps/example-api/src/routes/me.ts`  
- **Agent:** backend-dev-A · subject: me · slice: S2 · phase: GREEN  
- **Spec:** SC5 · N3  
- **Snippet:** after `email`, `...(name ? { name } : {})` from `baUser?.name?.trim()`  
- **Verify:** `bun run --filter @gosilex/example-api test` (or targeted me tests)  
- **Est:** 3 min · difficulty 1 · [P]

### T2 — Zod schemas + i18n FR/EN keys  
- **Files:** `apps/example-web/src/lib/schemas.ts`, `messages/fr.ts`, `messages/en.ts`  
- **Agent:** frontend-dev-A · subject: forms · slice: S1+S2 · phase: GREEN  
- **Spec:** SC1, SC8 · SH1, SH2  
- **Snippet:** `changePasswordSchema` (current + new min 8 + confirm refine + optional later checkbox outside zod); `profileNameSchema` name trim min 1 max 80; keys for titles, labels, toasts (success, wrong password, re-auth, rate limit)  
- **Verify:** typecheck messages compile  
- **Est:** 5 min · difficulty 2 · [P]

### T3 — Change password form on settings  
- **File:** `apps/example-web/src/routes/settings.tsx` (or `components/account-password-form.tsx` if line budget)  
- **Agent:** frontend-dev-A · subject: forms · slice: S1 · phase: GREEN  
- **Spec:** SC1–SC3 · U3, U4, U6, U7, N1  
- **Snippet:** TanStack Form → `apiFetch('/api/auth/change-password', { method:'POST', body: JSON.stringify({ currentPassword, newPassword, revokeOtherSessions }) })`; checkbox default true; clear new+confirm on wrong password; clear all on success; map errors by status → i18n (not assume kit ApiError.code); never log body passwords  
- **Verify:** manual dogfood or component render smoke  
- **Est:** 10 min · difficulty 3 · blockedBy: T2

### T4 — Profile name form + Sign out CTA  
- **Files:** settings (+ optional extract), `app-shell.tsx` if shared logout  
- **Agent:** frontend-dev-A · subject: forms · slice: S2+S3 · phase: GREEN  
- **Spec:** SC4–SC7 · U2, U5, N2, N4  
- **Snippet:** name field default from `me.data?.name`; `POST /api/auth/update-user`; invalidate `meQueryKey`; Sign out button reuses shell logout pattern  
- **Verify:** me refetch shows name  
- **Est:** 8 min · difficulty 2 · blockedBy: T1, T2

### T5 — API smoke + secret hygiene tests  
- **Files:** `apps/example-api/src/app.test.ts` or dedicated auth account test module  
- **Agent:** backend-dev-A · subject: auth-tests · slice: S3 · phase: GREEN  
- **Spec:** SC9, SC10 · N1  
- **Snippet:** seed/login user → change-password success; wrong current → non-200 + body stringified assert no plaintext password fields of request; happy path body has no password hash; document ignore optional token  
- **Verify:** `bun run --filter @gosilex/example-api test`  
- **Est:** 12 min · difficulty 3 · blockedBy: T1 (session fixtures)

### T6 — FE schema unit tests + validate:full  
- **Files:** `apps/example-web/src/lib/schemas.test.ts`  
- **Agent:** tester-A · subject: schema · slice: S3 · phase: RED-GATE  
- **Spec:** SC8–SC11  
- **Snippet:** min length / mismatch / name empty fail; after all code: `bun run validate:full` in worktree  
- **Verify:** exit 0  
- **Est:** 8 min · difficulty 2 · blockedBy: T2, T3, T4, T5

## Task Seeding Blueprint

<!-- Used by /implement to seed TaskCreate calls on session start.
     Format: T{n} | agent-instance | blockedBy | subject -->

### Wave 1 — no deps, 2 agents ∥

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T1 | backend-dev-A | — | me |
| T2 | frontend-dev-A | — | forms |

### Wave 2 — after Wave 1

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T3 | frontend-dev-A | T2 | forms |
| T4 | frontend-dev-A | T1, T2 | forms |

### Wave 3 — after Wave 2

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T5 | backend-dev-A | T1 | auth-tests |
| T6 | tester-A | T2, T3, T4, T5 | schema |

## Ref patterns

| Pattern | Path |
|---------|------|
| Reset password form | `apps/example-web/src/routes/reset-password.tsx` |
| Login + apiFetch | `apps/example-web/src/routes/login.tsx` |
| Zod schemas | `apps/example-web/src/lib/schemas.ts` |
| Logout | `apps/example-web/src/components/app-shell.tsx` |
| me route | `apps/example-api/src/routes/me.ts` |
| BA rate limit | `apps/example-api/src/routes/auth.ts` |
| Password reset API tests | grep `reset-password` in `app.test.ts` / password-reset tests |

## Out of plan

- Multi-session list UI  
- Admin deep-link (follow-up)  
- Email change  
- BA plugin install  

## Task IDs

<!-- Generated by /plan. Used by /implement to resume tasks on session restart. -->
- T1: t1-me-name — me
- T2: t2-schemas-i18n — forms
- T3: t3-password-form — forms
- T4: t4-profile-logout — forms
- T5: t5-api-tests — auth-tests
- T6: t6-validate — schema
