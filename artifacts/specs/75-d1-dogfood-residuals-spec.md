---
title: "fix(example): D1 dogfood residuals (smtp Worker, magic-link 500 copy, reader write) — Circle inherit 628d942"
description: "Honest local email runbook, fail-closed magic-link 5xx, requireModule write on demo_items mutations."
type: spec
status: approved
issue: 75
tier: F-lite
---

## Context

**Promoted from:** [D1 dogfood residuals frame](../frames/75-d1-dogfood-residuals-frame.md) (approved, F-lite)
**GitHub issue:** [#75](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/75)
**Walk:** `artifacts/reviews/2026-08-13-kit-d1-human.md` (source of the three P1s)
**Refs:** ADR-0004 (smtp Node-only) · ADR-0003 (`requireModule`) · inherit baseline `628d942`

## Intent

The 2026-08-13 D1 walk passed login, IDOR, org switch, and `sk_` mint. Three residuals make the documented local dogfood lie:

1. README / AGENTS / SPA copy tell operators to use Mailpit while the Worker **throws** on `EMAIL_TRANSPORT=smtp`.
2. Magic-link treats the walk’s empty HTTP 500 (`Error('HTTP 500')`, no kit envelope) as « Vérifiez votre e-mail ».
3. `POST /api/items` is `requireAuth` only — Lecteur (`team-reader@kit.local`, `demo=read`) can persist a row.

Why now: kit-side follow-up after Circle inherit `628d942`. Product merge of kit tip is not this ticket.

## Goal

A D1 re-walk on `example-*` at SHA ≥ `628d942` matches the runbook: Worker mail is `log` (Mailpit is Node-only); magic-link empty 500 is a fail-closed error, not inbox copy; Lecteur cannot persist or mutate `demo_items` (API **403** with `demo` effective + UI hide create).

## Users

- **Primary:** kit maintainer / consumer running `example-api` `:8787` + `example-web` `:5173` after clone or upstream pull.
- **Secondary:** org Lecteur / admin — grant UI must match **write** API; magic-link must not claim a send on transport failure.

## Expected Behavior

### Email runbook (docs-only — ADR-0004)

- Worker local path = `EMAIL_TRANSPORT=log` (`.dev.vars.example` stays `log`).
- Mailpit compose stays for **Node** `@kit/email/server` only.
- `EMAIL_TRANSPORT=smtp` on the Worker still throws (`assertEmailTransportAllowed`). Correct; docs and SPA copy must say so.
- No new Worker SMTP client. No third transport.
- Required copy fences (not “if they claim”):
  - README Quick start — Mailpit is not a sibling of `wrangler dev` without the Node fence
  - AGENTS.md H2 local row + the `# smtp → Mailpit` comment (smtp = Node `/server` only)
  - `docs/staging-examples.md` L25 and L41 — Worker `EMAIL_TRANSPORT` is `log` (local) / `cf`|`resend` (staging), **not** `smtp`
  - `docs/observability.md` — Mailpit not presented as the Worker inbox
  - SPA: `magicSentDesc`, dashboard `emailSent` — Worker local = log; Mailpit only if Node server
- `docs/email-cf-runbook.md` / `docs/testing.md` already Node-only — keep; README links the runbook.

### Auth-mail UI

Wires are **not** one class:

| Surface | Transport fail today | This issue |
|---------|----------------------|------------|
| Magic-link `sendMagicLink` | empty HTTP **500** (no kit `error.code`) | **in** — fail-closed |
| Invite / demo-email | app builds EmailPort before write; throws | **in** — keep `onError`; API already fail-closed |
| Forgot-password `requestPasswordReset` | BA looks up user, swallows send, always **2xx** | **out** — 5xx classifier cannot fire; unwrapping send would enumerate |

Magic-link:

- **2xx** (including unknown-account anti-enum) → existing inbox copy.
- **status ≥ 500** via existing status resolver (`ApiError` **and** `Error('HTTP N')`) → error toast, **no** `onSent()`, **no** inbox copy. Copy does not say whether the address exists.
- **429** stays the current rate-limit toast (`isRateLimited`).
- Status-less network failure → fail-closed error (not inbox).
- Fixture that greens the AC: **empty-body HTTP 500** (the walk wire), not only a mocked `ApiError(INTERNAL_ERROR)`.

Invite / demo-email: keep `onError` toast. No catch-all success. Do not require a new Playwright suite.

### Catalogue grant

`demo_items` stays **subject-scoped** (no `organization_id` this issue). Grant org ≠ row tenant — accepted residual. Do **not** claim “same as tasks.”

- **GET** `/api/items` (+ `/:id`) stays `requireAuth` + subject filter. `demo@` / `demo-b@` IDOR on GET stays 404. No org header required on GET.
- **POST / PATCH / DELETE** require `requireOrgContext` + `requireModule('demo', 'write')`. Missing header → 400. Server is `requireModule`, **not** `orgRole === 'reader'`.
- **N0 seed:** `demo` module **effective** on walk orgs (`org_team`, `org_acme`). Rewrite the “leave demo admin-gated” seed comment. Without this, reader POST is 404-for-everyone and the grant pin is vacuous.
- Reader fixture: `team-reader@kit.local` + `X-Org-Id: org_team` + `POST { code: 'LEAK', label: 'should fail' }` → **403** `FORBIDDEN`, **zero** rows. Same 403 on PATCH/DELETE of an existing subject row. Not 404.
- Write fixture: a tenancy actor with `demo=write` (e.g. Acme admin / staff on `org_acme`) + `X-Org-Id` → 201 / 200. Do **not** rely on `demo@` (no membership) for mutation tests.
- Optional extra pin: `member` (or custom role) with `demo=read` on an org where `demo` is effective → POST 403 (proves `requireModule`, not hardcoded `reader`).
- Items UI: send `X-Org-Id` on **mutations**. Hide create / edit / delete when `activeOrg.role === 'reader'` **or** no active org. GET list still works without org. `queryKey` for mutation invalidation includes `activeOrgId`.
- Second-org residual (document, do not “fix”): writer in org A + reader in org B can still persist a **subject-global** row via org A; switching to B still lists it. Org catalogue would need `organization_id` — OOS.

### Re-walk

PR body includes **walk evidence** (not a SHA string alone): logins still work; magic-link empty 500 → error toast; reader POST 403; runbook matches `log`. SHA ≥ `628d942`. Closer: `Fixes #75` only.

## Out of Scope

- Circle `fetch` + `merge upstream/main` / `docs/product/kit-baseline`
- Platform JTBD D2/D3, `@kit/flows`, Circle-on-kernel
- Worker-safe SMTP / third transport
- Forgot-password 5xx UI (BA always 2xx on send fail)
- `demo_items.organization_id` / migrating catalogue to org tenancy
- New RBAC vocabulary; changing grants beyond `demo` write on mutations
- Committing `.dev.vars`; `@cloudflare/vitest-pool-workers` as a gate
- P2/P3 walk residuals (opaque mint copy, invite-on-email-fail UX, MCP `whoami` bad_config, platform module badges)
- Closing #16 / #72

## Data Model & Consumers

### Data structure

No new tables.

| Surface | Shape | This issue |
|---------|--------|------------|
| `demo_items` | `id`, `subject`, `code`, `label`, … | schema frozen; subject tenancy |
| `requireModule('demo','write')` | platform ∧ org.enabled ∧ grant | mutations only |
| Platform `demo` row | `available` / org enable | **N0** make effective on `org_team` + `org_acme` |
| `MeOrg.role` | includes `reader` | UI hide only |
| `EMAIL_TRANSPORT` | `log \| smtp \| cf \| resend` | smtp stays Node-only |
| Magic-link fail | empty HTTP 500 / `Error('HTTP 500')` | UI classifies via status resolver |

### Consumers

| Consumer | Surface | Status |
|----------|---------|--------|
| README, AGENTS, staging-examples, observability, SPA i18n | Worker vs Node mail | **this issue** |
| `LoginMagicForm` | empty 500 vs 2xx | **this issue** |
| Invite + demo-email UI/API | already fail-closed | keep |
| Forgot-password | BA 2xx on send fail | **out** |
| `itemsRoutes` mutations | `requireOrgContext` + `requireModule('demo','write')` | **this issue** |
| `itemsRoutes` GET | subject + `requireAuth` | unchanged |
| Seed tenancy | `demo` effective on walk orgs | **this issue** |
| Circle merge | kit tip | **product — out** |

## Breadboard

### Email docs + SPA copy

| ID | Affordance | Handler / artifact | Data |
|----|------------|-------------------|------|
| DOC1 | README Quick start Mailpit | Node `@kit/email/server` fence | no Worker smtp |
| DOC2 | AGENTS.md H2 + smtp comment | `log` Worker · smtp = Node | same |
| DOC3 | `docs/staging-examples.md` L25, L41 | Worker vars ≠ `smtp` | required rewrite |
| DOC4 | `docs/email-cf-runbook.md` | already Node-only; README links it | keep |
| DOC5 | `.dev.vars.example` | stays `EMAIL_TRANSPORT=log` | SMTP_* comments fenced Node-only |
| DOC6 | `docs/observability.md` | Mailpit ≠ Worker inbox | required |
| DOC7 | `magicSentDesc` / dashboard `emailSent` | i18n FR+EN | log, not Mailpit-as-Worker |

### Auth-mail UI

| ID | Affordance | Handler / artifact | Data |
|----|------------|-------------------|------|
| U1 | Magic-link submit | `login-magic-form.tsx` | empty 500 → error; 2xx → inbox; 429 → rate limit |
| U3 | Invite submit | `org-members.tsx` | keep `onError` |
| U4 | Demo email button | `dashboard.tsx` | keep `onError` |
| S1 | Status classifier | reuse `resolveStatusCode` / `isRateLimited` sibling | `ApiError` **and** `Error('HTTP N')`; status-less → fail-closed |

### Catalogue

| ID | Affordance | Handler / artifact | Data |
|----|------------|-------------------|------|
| N0 | Seed `demo` effective | `seed-tenancy` / platform ensure | `org_team` + `org_acme` |
| N1 | `GET /api/items` | `requireAuth` only (subject) | unchanged IDOR |
| N2 | `POST /api/items` | `requireOrgContext` + `requireModule('demo','write')` | create |
| N3 | `PATCH` / `DELETE` | same write grant | mutate / remove |
| N4 | Vitest reader POST+PATCH+DELETE | `team-reader` + `org_team` + `{code,label}` | **403**, zero rows |
| N5 | Vitest write actor | tenancy writer + `X-Org-Id` | 201; GET IDOR still demo@ vs demo-b |
| N6 | Vitest omit header on POST | cookie only | 400, no row |
| U5 | Items mutations `X-Org-Id` | `items.tsx` + `useOrgContext` | header on write |
| U6 | Hide create / pencil / trash | `role === 'reader'` or no org | no dialog |
| U7 | GET without org | still lists subject rows | no empty-on-missing-org |

### Wiring

DOC1–DOC7 are copy. U1 uses S1 (normative, not optional). N0 before N4 or reader is 404. N2/N3 fail closed before `itemsService.createItem`. U5/U6 are cosmetic; N4 is the security pin. GET (N1) does not take the org gate.

## Slices

| # | Name | Scope (IDs) | Demo criteria |
|---|------|-------------|---------------|
| V1 | Honest Mailpit runbook | DOC1–DOC7 | Worker operator is not told to set `smtp` or “check Mailpit” for wrangler mail |
| V2 | Magic-link 5xx ≠ inbox | U1, U3, U4, S1 | empty-body 500 → error toast, no `onSent` / `magicSentTitle`; 429 unchanged; invite/demo-email still `onError` |
| V3 | Reader cannot write catalogue | N0–N6, U5–U7 | `demo` effective; `team-reader` POST/PATCH/DELETE **403** + no row; write actor 201; GET IDOR unchanged; UI hides write for `reader` |
| V4 | Re-walk evidence | — | PR records SHA ≥ `628d942` **and** the three walk checks (runbook, magic 500, reader 403) |

One PR. V3 depends on N0.

## Edge Cases

| Edge | Handling |
|------|----------|
| Magic-link unknown account, transport OK | 2xx + inbox copy (anti-enum) |
| Magic-link smtp throw | empty 500 → fail-closed, no enum |
| Magic-link 429 | existing rate-limit toast |
| Forgot-password smtp throw | still 2xx from BA — **OOS** |
| Invite send fail | no pending row (already); UI `onError` |
| Items GET no org | 200 subject list |
| Items POST no `X-Org-Id` | 400, no row |
| Items POST `demo` off | 404 (module hide) — **not** the reader AC |
| `team-reader` + `demo` effective + write | **403** |
| Custom / member + `demo=read` | 403 (server); UI may still show create |
| Writer in org A, reader in org B | subject-global row via A — residual, documented |
| `allowSuperAdmin` on items | **do not** set |

## Success Criteria

- [ ] README Quick start fences Mailpit to Node `@kit/email/server`; Worker local = `log`
- [ ] AGENTS.md H2 + smtp comment, `docs/staging-examples.md` L25/L41, and `docs/observability.md` do not present `smtp` / Mailpit as the Worker path
- [ ] SPA `magicSentDesc` and dashboard `emailSent` do not tell the operator to open Mailpit for Worker mail
- [ ] `.dev.vars.example` remains `EMAIL_TRANSPORT=log`; no Worker SMTP implementation
- [ ] `LoginMagicForm` empty-body HTTP 500 (`Error('HTTP 500')`) does **not** call `onSent` and does **not** show `magicSentTitle`; 2xx still shows inbox copy; 429 unchanged
- [ ] Invite and demo-email UI keep `onError` (no catch-all success path added)
- [ ] Seed: `demo` is effective on `org_team` and `org_acme`
- [ ] `POST`/`PATCH`/`DELETE /api/items` as `team-reader@kit.local` + `X-Org-Id: org_team` + valid `{code,label}` returns **403** `FORBIDDEN` and inserts/updates **zero** rows
- [ ] Same mutations without `X-Org-Id` return 400 and write nothing
- [ ] A `demo=write` tenancy actor with `X-Org-Id` still 201/200; GET subject IDOR (`demo@` vs `demo-b@`) still 404
- [ ] Items UI hides create/edit/delete when `activeOrg.role === 'reader'` or no active org; mutations send `X-Org-Id`
- [ ] PR includes re-walk evidence + SHA ≥ `628d942`; closer is `Fixes #75` only (no `#16` / `#72`)

## Open Questions

None remaining for `/plan`.

Deferred (not χ): forgot-password transport-fail UX — needs a BA-layer change or accept 2xx; file only if we later want a uniform EmailPort-before-handler wrapper.
