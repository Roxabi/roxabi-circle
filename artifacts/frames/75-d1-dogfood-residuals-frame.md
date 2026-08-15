---
title: "fix(example): D1 dogfood residuals (smtp Worker, magic-link 500 copy, reader write) — Circle inherit 628d942"
issue: 75
status: approved
tier: F-lite
date: 2026-08-15
---

## Problem

The 2026-08-13 D1 walk on `example-api` `:8787` + `example-web` `:5173` + Mailpit `:8025` passed password login, notes IDOR, org switch, platform catalogue, org isolation, and `sk_` mint. Three P1 residuals remain on this kit — they make the documented local dogfood lie.

1. **`EMAIL_TRANSPORT=smtp` is unusable on the Worker.** `@kit/email` `assertEmailTransportAllowed` throws `EMAIL_TRANSPORT=smtp is Node-only (@kit/email/server) — not available on Workers`. README + compose still tell operators to start Mailpit. Repro: flip `.dev.vars` to `smtp` → `POST /api/demo/email` and invite 500, no pending invite row, Mailpit `total: 0`. Default `.dev.vars.example` is `log`. ADR-0004 already says smtp is Node-only; AGENTS.md / README still sell Mailpit as the local Worker path.

2. **Magic-link UI treats 500 as “check your inbox”.** `LoginMagicForm` only special-cases 429; every other throw (including Better Auth `SERVER_ERROR` from the smtp throw) still calls `onSent()` and toasts `magicSentTitle` / `magicSentDesc` (« Vérifiez votre e-mail / Si un compte existe… »). Anti-enum copy swallows transport failure. Same class on invite / demo-email if the UI maps 5xx to inbox copy.

3. **`reader` can write the catalogue.** `POST /api/items` is `requireAuth` only. `itemsService.createItem` scopes by `subject`, not org-role grant. `requireModule('demo', 'write')` exists (tasks already use it) and is **not** on items. `team-reader@kit.local` (Team Client, Lecteur, `demo=read`) submitted `LEAK` → toast « Élément créé », row persisted. Org IDOR still holds (no Acme `WIDGET`).

Why now: Circle inherit is `628d942`; these are kit-side follow-ups from that walk. Product merge of kit tip is **not** this ticket.

## Who

- **Primary:** kit maintainer / consumer doing D1 (`example-*` + Mailpit) after clone or upstream pull.
- **Secondary:** org admin / Lecteur using Phase B grants — grant UI must match API; magic-link / invite must not claim mail was sent on 5xx.

## Constraints

- Kit extractibility + ADR-0001 / ADR-0003 / ADR-0004 win. No product strings in `packages/*`. Circle merge of kit tip stays a **product** chore.
- Email AC is an explicit fork: **Worker-local path matches the Mailpit runbook** *or* README / AGENTS / compose **drop smtp-on-Worker**. Do not leave both claims live. Spec picks; do not add a third transport.
- Magic-link / invite / demo-email: HTTP 5xx ≠ « check your inbox ». Anti-enum stays for 2xx / unknown-account success. Fail-closed toast on transport / 5xx without enumerating accounts.
- `reader` cannot `POST` (or mutate) catalogue items: server grant first (`requireModule('demo', 'write')` or equivalent), then UI hide create. Test pins the 403/404. Org isolation already green — do not regress.
- Re-walk B on inherit baseline `628d942` or newer; note SHA in the PR. Closer: `Fixes #75` only.
- P2/P3 in the walk stay in `artifacts/reviews/2026-08-13-kit-d1-human.md` — not this issue (opaque mint copy, invite-on-email-fail, MCP `whoami` bad_config, platform module badges).

## Out of Scope

- Circle `fetch` + `merge upstream/main` / `docs/product/kit-baseline` refresh.
- Platform JTBD D2/D3, `@kit/flows` runner, Circle-on-kernel port.
- Committing local `.dev.vars` or adding `@cloudflare/vitest-pool-workers` as a gate.
- Worker-safe SMTP as a new kit default if spec chooses docs-only (and vice versa).
- P2/P3 residuals listed above.
- Changing grant model beyond `demo` catalogue write (no new RBAC vocabulary).

## Premise Validity

**Success in 6 months:** a D1 re-walk on `example-*` records SHA ≥ `628d942`; Mailpit story matches what the Worker can actually do; 5xx on magic-link / invite / demo-email shows a fail-closed error, not inbox copy; Lecteur cannot persist a `demo_items` row (API + UI).

**Failure in 6 months:** after merge, `EMAIL_TRANSPORT=smtp` still 500s with Mailpit empty while README still says `docker compose up -d mailpit`; or magic-link 500 still shows « Vérifiez votre e-mail »; or Lecteur can still `POST /api/items` a `LEAK` row.

**Simplest alternative:** docs-only (drop smtp-on-Worker) + leave grant and magic-link as-is.
**Why not simplest:** AC requires 5xx ≠ inbox copy **and** reader cannot POST (test + UI hide). Docs-only fails two of three P1s. Email half may be the docs path; the other two cannot.

## Complexity

**Tier: F-lite** — three residual bugs, known files, no new architecture. `/dev` chose F-lite (`complexity: 5` already on #75).

Signals: email + auth UI + RBAC, but each is a pinned residual from one walk; `requireModule` already exists; ADR-0004 already forbids smtp on Worker; UI bug is a catch-all in one form.
