---
title: "Plan: fix(example): D1 dogfood residuals (smtp Worker, magic-link 500 copy, reader write)"
issue: 75
spec: artifacts/specs/75-d1-dogfood-residuals-spec.md
complexity: 5/10
tier: F-lite
generated: 2026-08-15
normative: false
---

## Summary

Fence Worker mail to `log` (docs + SPA copy; smtp still throws). Fail-close magic-link on empty HTTP 500 via exported `isServerError`. Enable `demo` on walk orgs and put `requireModule('demo','write')` on items mutations only. One PR.

## Architecture

**Data flow:** [75 data flow](../visuals/75-d1-dogfood-residuals-data-flow.html)  
**File map:** [75 file map](../visuals/75-d1-dogfood-residuals-file-map.html)

Docs → Worker `log`. Magic-link empty 500 → S1 → toast. GET items stays subject-scoped; POST/PATCH/DELETE take `X-Org-Id` + write grant.

## Bootstrap Context

- Frame: `artifacts/frames/75-d1-dogfood-residuals-frame.md` (approved, F-lite)
- Spec: `artifacts/specs/75-d1-dogfood-residuals-spec.md` (approved)
- Walk: `artifacts/reviews/2026-08-13-kit-d1-human.md`
- Email throw: `packages/email/src/index.ts` `assertEmailTransportAllowed`
- Status resolver (private): `apps/example-web/src/lib/account-errors.ts` `resolveStatusCode` — already parses `Error('HTTP N')`
- Magic catch-all: `apps/example-web/src/components/login-magic-form.tsx` L54–63
- Seed: `apps/example-api/src/seed/seed-tenancy.ts` L15–16, L121–141 (`ACME_DOGFOOD_MODULES` = tasks+comments only)
- Items API: `apps/example-api/src/routes/items.ts` — `requireAuth` only
- Pattern: `apps/example-api/src/routes/tasks.ts` `requireOrgContext` + `requireModule`
- Items UI: `apps/example-web/src/routes/items.tsx` — no `X-Org-Id`, create always shown
- Forgot-password: **OOS** (BA always 2xx on send fail)
- Invite / demo-email: already `onError` — no code change

## Agents

| Agent instance | Tasks | Files |
|----------------|-------|-------|
| doc-writer-A | T1 | README.md, AGENTS.md, docs/staging-examples.md, docs/observability.md, apps/example-api/.dev.vars.example |
| tester-A | T3, RG-V2 | account-errors.test.ts, login-magic-form test |
| tester-B | T6, RG-V3 | apps/example-api/src/items.test.ts |
| frontend-dev-A | T2, T5 | messages/fr.ts, messages/en.ts, account-errors.ts, login-magic-form.tsx |
| backend-dev-A | T8 | seed-tenancy.ts |
| backend-dev-B | T9 | routes/items.ts |
| frontend-dev-B | T10 | routes/items.tsx |

## Wave Structure

4 waves, max 3 parallel agents. One session / one PR.

| Wave | Trigger | Agents | Tasks |
|------|---------|--------|-------|
| 1 | start | 3 ∥ | doc-writer-A: T1 · tester-A: T3 · tester-B: T6 |
| 2 | Wave 1 RED done | 2 ∥ | tester-A: RG-V2 · tester-B: RG-V3 |
| 3 | RG-V2 + T1 | 2 ∥ | frontend-dev-A: T2→T5 · backend-dev-A: T8 |
| 4 | RG-V3 + T8 | 2 ∥ | backend-dev-B: T9 · frontend-dev-B: T10 |

### Budget — per task

| Task | Items | Class | Est. ops | Split? |
|------|-------|-------|----------|--------|
| T1 docs fence | 5 files | bounded | 3 | — |
| T2 i18n Mailpit | 2 files | trivial | 2 | — |
| T3 RED magic 500 | 1–2 files | judgmental | 5 | — |
| RG-V2 | sentinel | trivial | 1 | — |
| T5 isServerError + form | 2 files | bounded | 3 | — |
| T6 RED items grant | 1 file | judgmental | 6 | — |
| RG-V3 | sentinel | trivial | 1 | — |
| T8 seed demo | 1 file | bounded | 3 | — |
| T9 items write mw | 1 file | bounded | 3 | — |
| T10 items UI | 1 file | bounded | 3 | — |

**Total estimated ops: ~30**

### Budget — per agent instance

| Instance | Tasks | Σ ops | Subjects | Split? |
|----------|-------|-------|----------|--------|
| doc-writer-A | T1 | 3 | runbook | — |
| tester-A | T3, RG-V2 | 6 | auth | — |
| tester-B | T6, RG-V3 | 7 | grants | — |
| frontend-dev-A | T2, T5 | 5 | i18n, auth | — |
| backend-dev-A | T8 | 3 | seed | — |
| backend-dev-B | T9 | 3 | grants | — |
| frontend-dev-B | T10 | 3 | items | — |

## Consistency Report

- Criteria covered: 11/12 (SC-12 re-walk = PR chore, exemption)
- Uncovered criteria: none blocking
- Affordances: DOC1–7, U1, S1, N0–N6, U5–U7 mapped
- Untraced: none
- Exemptions: U3/U4 invite+demo-email (already `onError`); V4 / SC-12 (PR evidence)

## Micro-Tasks

### Slice V1: Honest Mailpit runbook

#### Task 1: Fence Worker vs Node mail in docs [P] → doc-writer-A
- **File:** `README.md`, `AGENTS.md`, `docs/staging-examples.md`, `docs/observability.md`, `apps/example-api/.dev.vars.example`
- **Snippet:** README Quick start: Mailpit = Node `@kit/email/server` only; Worker = `EMAIL_TRANSPORT=log`. AGENTS H2 + `# smtp → Mailpit` comment: smtp never Worker. `staging-examples.md` L25/L41: local `log`, staging `cf`\|`resend` — drop Worker `smtp`. observability.md: Mailpit ≠ wrangler inbox. `.dev.vars.example`: keep `EMAIL_TRANSPORT=log`; fence `SMTP_*` as Node-only.
- **Verify:** `grep -n 'Mailpit\\|EMAIL_TRANSPORT=smtp' README.md AGENTS.md docs/staging-examples.md docs/observability.md apps/example-api/.dev.vars.example` (ready)
- **Expected:** no unfenced “start Mailpit then wrangler + smtp” path
- **Time:** 8 min | **Difficulty:** 2
- **Traces:** DOC1–DOC6, SC-1, SC-2, SC-4
- **Phase:** GREEN
- **Subject:** runbook

#### Task 2: Stop SPA copy selling Mailpit as Worker inbox [P] → frontend-dev-A
- **File:** `apps/example-web/src/messages/fr.ts`, `apps/example-web/src/messages/en.ts`
- **Snippet:** `magicSentDesc` / `emailSent`: Worker local = log; do not say “voir Mailpit :8025” as the wrangler path.
- **Verify:** `grep -n 'Mailpit' apps/example-web/src/messages/fr.ts apps/example-web/src/messages/en.ts` (ready)
- **Expected:** remaining Mailpit mentions are Node-only or gone
- **Time:** 3 min | **Difficulty:** 1
- **Traces:** DOC7, SC-3
- **Phase:** GREEN
- **Subject:** i18n

### Slice V2: Magic-link 5xx ≠ inbox

#### Task 3: RED empty-body HTTP 500 does not send inbox copy [P] → tester-A
- **File:** `apps/example-web/src/lib/account-errors.test.ts` (+ form test next to `login-magic-form.tsx` if needed)
- **Snippet:** `expect(isServerError(new Error('HTTP 500'))).toBe(true)`; `expect(isServerError(new Error('HTTP 429'))).toBe(false)`; form: mock `apiFetch` reject `Error('HTTP 500')` → `onSent` not called, no `magicSentTitle`.
- **Verify:** `grep -q 'HTTP 500' apps/example-web/src/lib/account-errors.test.ts` (ready)
- **Expected:** RED until T5; fixture is empty-body 500, not only `ApiError(INTERNAL_ERROR)`
- **Time:** 8 min | **Difficulty:** 3
- **Traces:** U1, S1, SC-5
- **Phase:** RED
- **Subject:** auth

#### RED-GATE: RED complete V2 → tester-A
- **Verify:** T3 file exists with HTTP 500 fixture
- **Phase:** RED-GATE

#### Task 5: Export isServerError and fail-close magic-link → frontend-dev-A
- **File:** `apps/example-web/src/lib/account-errors.ts`, `apps/example-web/src/components/login-magic-form.tsx`
- **Snippet:** `export function isServerError(err: unknown): boolean { const { status } = resolveStatusCode(err); if (status != null && status >= 500) return true; if (status == null && err != null) return true; return false }` — in form: 429 → rate-limit return; `isServerError` → `toast.error` return; else 2xx path `onSent` + inbox.
- **Verify:** `bun run --filter @kit/example-web test src/lib/account-errors.test.ts` (deferred)
- **Expected:** empty 500 no `onSent`; 2xx still inbox; 429 unchanged
- **Time:** 5 min | **Difficulty:** 2
- **Traces:** U1, S1, SC-5
- **Phase:** GREEN
- **Subject:** auth

### Slice V3: Reader cannot write catalogue

#### Task 6: RED reader write 403 + omit-header 400 [P] → tester-B
- **File:** `apps/example-api/src/items.test.ts`
- **Snippet:** login `team-reader@kit.local`; `POST /api/items` + `X-Org-Id: org_team` + `{ code: 'LEAK', label: 'should fail' }` → **403**, zero rows; same for PATCH/DELETE; cookie-only POST → 400; write actor (`staff@kit.local` + `org_acme`) → 201; GET IDOR `demo@` vs `demo-b@` **without** org header still 404.
- **Verify:** `grep -q 'team-reader@kit.local' apps/example-api/src/items.test.ts` (ready)
- **Expected:** RED until T8+T9 (403 not 404; label present so a missing guard is 201)
- **Time:** 10 min | **Difficulty:** 4
- **Traces:** N4, N5, N6, SC-8, SC-9, SC-10
- **Phase:** RED
- **Subject:** grants

#### RED-GATE: RED complete V3 → tester-B
- **Verify:** T6 pins 403 + 400 + write 201
- **Phase:** RED-GATE

#### Task 8: Seed demo effective on org_acme + org_team → backend-dev-A
- **File:** `apps/example-api/src/seed/seed-tenancy.ts`
- **Snippet:** add `'demo'` to platform-available dogfood set; enable on `org_acme` **and** `org_team`. Rewrite L15 comment (no longer “leave demo admin-gated”).
- **Verify:** `grep -n "demo" apps/example-api/src/seed/seed-tenancy.ts` (ready)
- **Expected:** `demo` available + enabled on both walk orgs
- **Time:** 4 min | **Difficulty:** 2
- **Traces:** N0, SC-7
- **Phase:** GREEN
- **Subject:** seed

#### Task 9: requireModule write on items mutations → backend-dev-B
- **File:** `apps/example-api/src/routes/items.ts`
- **Snippet:** GET stays `requireAuth` only. POST/PATCH/DELETE: `requireOrgContext()` then `requireModule('demo', 'write')`. Do **not** set `allowSuperAdmin`. Do **not** gate GET.
- **Verify:** `bun run --filter @kit/example-api test src/items.test.ts` (deferred)
- **Expected:** T6 green; GET IDOR unchanged
- **Time:** 5 min | **Difficulty:** 3
- **Traces:** N1, N2, N3, SC-8, SC-9, SC-10
- **Phase:** GREEN
- **Subject:** grants

#### Task 10: Items UI X-Org-Id + hide write for reader → frontend-dev-B
- **File:** `apps/example-web/src/routes/items.tsx`
- **Snippet:** `useOrgContext`; mutations send `{ 'X-Org-Id': activeOrgId }`; hide create / pencil / trash when `!activeOrgId || activeOrg?.role === 'reader'`; GET list still runs without org; `queryKey` includes `activeOrgId` on invalidation.
- **Verify:** `grep -q 'X-Org-Id' apps/example-web/src/routes/items.tsx` (ready)
- **Expected:** Lecteur sees no « Nouvel élément »; write still works for admin with org
- **Time:** 6 min | **Difficulty:** 2
- **Traces:** U5, U6, U7, SC-11
- **Phase:** GREEN
- **Subject:** items

## Task Seeding Blueprint

<!-- Used by /implement to seed TaskCreate calls on session start. -->

### Wave 1 — no deps, 3 agents ∥

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T1 | doc-writer-A | — | runbook |
| T3 | tester-A | — | auth |
| T6 | tester-B | — | grants |

### Wave 2 — after Wave 1 RED, 2 agents ∥

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| RG-V2 | tester-A | T3 | auth |
| RG-V3 | tester-B | T6 | grants |

### Wave 3 — after gates + T1, 2 agents ∥

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T2 | frontend-dev-A | T1 | i18n |
| T5 | frontend-dev-A | RG-V2, T3 | auth |
| T8 | backend-dev-A | RG-V3 | seed |

### Wave 4 — after T8 + RG-V3, 2 agents ∥

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T9 | backend-dev-B | T8, RG-V3 | grants |
| T10 | frontend-dev-B | RG-V3 | items |

## Task IDs

<!-- Generated by /plan. Used by /implement to resume tasks on session restart. -->
- T1: T1 — runbook
- T3: T3 — auth
- T6: T6 — grants
- RG-V2: RG-V2 — auth
- RG-V3: RG-V3 — grants
- T2: T2 — i18n
- T5: T5 — auth
- T8: T8 — seed
- T9: T9 — grants
- T10: T10 — items
