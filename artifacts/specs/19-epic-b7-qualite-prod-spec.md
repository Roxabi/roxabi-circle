---
title: "Spec — B7 · Qualité prod (Playwright CI, obs, CodeRabbit)"
issue: 19
spark: 120
status: ready-for-implement
tier: F-full
date: 2026-07-30
promoted: 2026-08-03
analysis: artifacts/analyses/19-epic-b7-qualite-prod-analysis.md
plan: plans/007-quality-gates-post-review.md
exit_evidence: artifacts/reviews/002-goal-exit-evidence.md
---

# Spec #19 — B7 Qualité prod

## Context

- **Issue:** [#19](https://github.com/go-silex/silex-boilerplate/issues/19) · Spark **#120**
- **Analysis:** [`artifacts/analyses/19-epic-b7-qualite-prod-analysis.md`](../analyses/19-epic-b7-qualite-prod-analysis.md) — Shape **C**
- **Plan (ordering + AC delta):** [`plans/007-quality-gates-post-review.md`](../../plans/007-quality-gates-post-review.md)
- **Doctrine:** [`docs/testing.md`](../../docs/testing.md) · [`docs/observability.md`](../../docs/observability.md)
- **Freeze:** P8 (one Playwright smoke, not matrix) · O10 (Sentry/BS hooks, not live SaaS for exit)
- **Status:** **ready-for-implement** (A0 promoted 2026-08-03 — plan 007 AC folded below)

## Goal

Close kit **prod quality** gaps without product domain:

1. Non-flaky **Playwright Chromium** e2e job in GitHub CI on kit main browser paths.
2. **Sentry** (error tracking) **env-gated** wire in example stack + honest docs; Better Stack documented as optional.
3. **CodeRabbit** (or equivalent) **active** on kit PRs **or** a written decision with revisit criteria.
4. Keep existing **coverage floors**, banlist, extract, local-first `validate:full` — no lowering.

## Users

| Persona | Need |
|---|---|
| Kit maintainer | Merge blocked only by honest gates; e2e proves UI composition still works |
| Product consumer | Copy env-gated Sentry pattern; no forced SaaS; no product e2e in kit |
| Security reviewer | No PII dump to Sentry by default; no CodeRabbit without privacy OK |
| Free-plan operator | Bounded CI minutes; no flake storm |

## Acceptance criteria (A0 — normative)

Folded from [`plans/007-quality-gates-post-review.md`](../../plans/007-quality-gates-post-review.md) §A0 + advisory 2026-08-03 (flake SLO / Free merge-on-green).

| AC id | Requirement |
|---|---|
| **AC-PATH** | E1 uses live Better Auth path **`POST /api/auth/sign-in/email`** (not obsolete `/api/auth/login`). Design-system path = **`/admin/design-system#overlays`** (kit route). |
| **AC-SCRUB** | Sentry: `sendDefaultPii: false`; `beforeSend` **allowlist** fields; strip Cookie, Authorization, bodies, password/token patterns; no user email as Sentry user by default. |
| **AC-CAPTURE** | Capture unexpected/5xx only; not VALIDATION_ERROR / 401 / 403 noise. |
| **AC-DSN** | No `SENTRY_DSN` required for CI green; unset = zero network. |
| **AC-E2E-CLAIM** | Docs: e2e proves cookie composition + UI overlays only; dual-auth / IDOR / org RBAC = Vitest T0. |
| **AC-CR** | Done = App installed **or** dated decline + revisit criteria; never required merge check. |
| **AC-CREDS** | E2E demo password not logged; traces scrub login bodies or disable body retention on auth steps; `E2E_DEMO_EMAIL` / `E2E_DEMO_PASSWORD` with dev/test defaults only. |
| **AC-DEPS** | First PR landing `@sentry/*` or `playwright*` = human review; exclude from Dependabot auto-`reviewed` until policy says otherwise. |
| **AC-FLAKE** | Local A1: **≥3** consecutive greens. **No GHA e2e job** (Free minutes + flake) — amended 2026-08-03: local-only via `test:e2e:design-system` / `test:e2e:ci`. Revisit CI only with explicit product need + flake SLO. |
| **AC-LOCAL-FIRST** | e2e **never** enters Lefthook pre-push / `validate:full` / default GitHub Actions CI. |

## Expected behavior

1. Browser e2e is **local-only**: warm stack → `bun run test:e2e:design-system`; cold → `bun run test:e2e:ci`. No default GHA job (AC-FLAKE amended).
2. Without `SENTRY_DSN`, Worker and web behave exactly as today (no network to Sentry).
3. With `SENTRY_DSN` set (staging/prod secrets), unhandled / `AppError` paths can report with `requestId` tag; cookies/Authorization scrubbed.
4. CodeRabbit reviews PRs **or** `docs/` (or artifacts) records **decline** + criteria to enable later.
5. `bun run validate:full` remains **without** browser e2e (local primary gate unchanged).

## Out of scope

| Out | Why |
|---|---|
| **PostHog** product analytics | Issue hors scope; privacy + product FOMO |
| **Datadog** | AGENTS non-default; cost |
| **Sentry Session Replay** | Privacy; not kit default |
| **Plausible** wire | Separate track (public sites / B8 park) |
| Full Playwright matrix (Firefox/WebKit, every route) | Freeze **P8** |
| Product e2e (`share-*`, upload, zip, private_key) | Product repos later |
| E2E inside Lefthook pre-push | Wall-clock + flake → bypass culture |
| New empty `@gosilex/observability` package | A8 — promote only with ≥2 call sites + ADR |
| Live SaaS required for kit CI green | Freeze **O10** |
| Mutation testing / CodeRabbit as merge authority | Signal only; merge-on-green + human `reviewed` remain |

## CI job design (superseded — local only)

**2026-08-03 amend:** no default GitHub Actions `e2e` job (Free minutes + flake).  
SSoT commands: `docs/testing.md` · `scripts/e2e-ci.sh` (local one-shot).

| Decision | Choice | Rationale |
|---|---|---|
| GHA e2e on every PR | **No** | Cost + flake; local-first doctrine |
| Include in `validate:full` / pre-push | **No** | Wall-clock + bypass culture |
| Local warm smoke | `bun run test:e2e:design-system` | Servers already up |
| Local cold one-shot | `bun run test:e2e:ci` | migrate + seed + start + smoke |
| Revisit GHA | Only with product need + flake SLO + explicit issue | Not silent re-add |

### Job steps (normative sketch)

```text
1. checkout (fetch-depth 0 only if needed — e2e does not need zero-edit baseline; depth 1 OK)
2. setup-bun (same pin as quality job)
3. bun install --frozen-lockfile
4. Install Chromium for Playwright (playwright install --with-deps chromium OR install browsers for playwright-core)
5. Prepare API env (.dev.vars from example + ENVIRONMENT=development|test; SESSION_SECRET placeholder OK)
6. Migrate D1 + seed demo users (same as local DX)
7. Start example-api (wrangler dev / package dev) in background
8. Start example-web (vite) in background
9. Health poll: GET API /health and BASE_URL until ready (timeout fail)
10. bun run test:e2e:design-system  (or bun run test:e2e if renamed umbrella)
11. Upload Playwright/trace artifacts on failure (retention 7d)
```

### Browser strategy

| Env | Browser |
|---|---|
| **CI** | Playwright-managed **Chromium** only (no system Chrome path dependency) |
| **Local** | `CHROME_PATH` if set; else document `bunx playwright install chromium` + executable resolution; fail with clear message if missing |

### Flake controls (required)

| Control | Spec |
|---|---|
| No fixed `waitForTimeout` for correctness | Use locator `waitFor({ state: 'visible' })` / role queries |
| Avoid `networkidle` as sole ready signal | Prefer `domcontentloaded` + app-specific ready (login form / design-system heading) |
| Health poll before login | Fail fast if API/web not up |
| Single worker / serial suite | One browser context sequential steps |
| Timeouts | Page default ≤ 15s; job timeout 15m |
| Retries | Prefer **0** retries in CI first (retries hide flakes); if one flake remains, max 1 job-level retry via GH — document why |
| Selectors | Prefer roles + existing `data-slot` on kit design-system; no product copy |

### Paths covered (in scope)

| # | Path | Assertions | CP link |
|---|---|---|---|
| E1 | `/login` → session via **`POST /api/auth/sign-in/email`** + `credentials: 'include'` | Login OK; no Base UI contract console errors | CP-FE-CRED / CP-AUTH-SESSION (browser wire) |
| E2 | **`/admin/design-system#overlays`** (after session) | Dropdown open (label Actions); Dialog open; Sheet open | CP-UI-CONTRACT |
| E3 (optional same job) | After login, `/app` or notes list smoke | Me/notes page loads without pageerror | composition only — **not** IDOR (stays Vitest) |

**Not covered in B7 e2e:** Bearer key mint UI, org RBAC, i18n switch matrix, mobile viewport matrix, MCP, email, R2 upload UI, dark mode exhaustive.

### Local commands

```bash
# API + web already running (dev):
bun run test:e2e:design-system

# CI-equivalent orchestrator (to add if missing):
# bun run test:e2e   # starts deps or documents docker-free spawn script
```

Optional: `scripts/e2e-ci.sh` shared by GH job and local “one command” — keep thin.

### Artifacts & naming

| Artefact | When |
|---|---|
| `coverage-html` | Existing quality job |
| `e2e-artifacts` (traces/screenshots on fail) | e2e job `if: failure()` |
| Check name | `e2e` |

## Observability — Sentry env-gated wire

### Principles

```text
SENTRY_DSN unset  →  no SDK init, no outbound error traffic
SENTRY_DSN set    →  init once; tag requestId; scrub secrets
```

Align with [`docs/observability.md`](../../docs/observability.md). Live SaaS **not** required for CI or kit exit (**O10**).

### Env schema

Add optional string keys to `apps/example-api/src/env.schema.ts` and document in `.dev.vars.example` (placeholders only):

| Key | Required | Notes |
|---|---|---|
| `SENTRY_DSN` | no | Empty/absent = off |
| `SENTRY_ENVIRONMENT` | no | Default from `ENVIRONMENT` |
| `SENTRY_RELEASE` | no | Optional git SHA / wrangler version at deploy |

`env:check` must stay green (schema ↔ example).

### API wire (required for DoD)

| Location | Behavior |
|---|---|
| Worker entry / middleware | If DSN: init Sentry Workers-compatible SDK (pin version at implement) |
| `onError` path | Capture unexpected errors; **AppError** 4xx: prefer **no** capture or sample only 5xx — avoid noise on VALIDATION_ERROR |
| Tags | `requestId` from existing middleware |
| Scrub | Never send `Authorization`, `Cookie`, `SESSION_SECRET`, raw passwords |
| Logs | Keep `createLogger` JSON as P0 path; Sentry is additive |

### FE wire (optional in B7)

| | |
|---|---|
| Prefer | Defer FE Sentry if timeboxed; document pattern |
| If shipped | Vite `import.meta.env.VITE_SENTRY_DSN` (or public DSN only); no secrets in client; source maps policy documented for product deploys later |

### Better Stack

| | |
|---|---|
| B7 | **Documentation only** — when to add Logtail/uptime; do not require tokens in kit |
| Later | Env-gated log drain if org standardizes |

### Docs updates (required)

- Expand `docs/observability.md`: init sketch, scrub rules, what is always-on vs optional, anti-stacking (no PostHog+Replay FOMO).
- Note in `docs/testing.md`: e2e local-only; CP-E2E row; not in pre-push / GHA.

### Package boundary

- **Do not** create `@gosilex/observability` in B7 unless a second consumer lands in the same PR.
- Thin helper may live under `example-api/src/lib/sentry.ts` or `packages/core` only if pure and reused — prefer app-local first.

## CodeRabbit — decision criteria

### Enable if all true

1. **Budget** approved for go-silex private monorepo (or free tier sufficient for PR volume).  
2. **Privacy** accepted: vendor processes PR diffs of private kit code.  
3. **CI stable** (`validate-full` green as habit).  
4. **Not** used as sole merge authority — human `reviewed` + merge-on-green remain.

### Decline / defer if any true

1. No budget / trial expired without renewal.  
2. Org policy forbids third-party code review SaaS.  
3. Copilot code review (or other) already covers PRs adequately.

### Deliverable (exactly one)

| Option | Artefacts |
|---|---|
| **Enable** | Install CodeRabbit GitHub App on `go-silex/silex-boilerplate`; optional `.coderabbit.yaml` (path filters, ignore generated, monorepo language); short note in `docs/` or PR description |
| **Decline** | `docs/process/coderabbit-decision.md` (or section under testing/observability process) with date, decision, criteria above, revisit triggers (e.g. “when product share private PRs > N/week”) |

### What CodeRabbit is not

- Not a substitute for human review on **auth / cookies / keys / R2 / MCP**.  
- Not a required check in merge-on-green (reviews are signal; may be `neutral`).  
- Not an excuse to skip `validate:full`.

## Slices (implementation order) — `/ship` per slice

| Slice | Plan id | Demo-able increment | Depends |
|---|---|---|---|
| **S0** | A0 | Spec promoted (this file) | — **DONE 2026-08-03** |
| **S1** | A1 | Harden e2e script (no sleep correctness; Playwright Chromium resolve; health poll) green **local ≥3** | S0 **DONE** |
| **S2** | A2 | Local-only e2e: keep `test:e2e:*` + `e2e-ci.sh`; **no** GHA job (amended) | S1 **DONE** |
| **S3** | A3 | `SENTRY_DSN` schema + example; API init + onError gated + scrub tests; observability.md | S0 (// S1 OK) |
| **S4** | A4+A5 | CodeRabbit enable **or** decision doc + testing.md CP-E2E matrix / non-claims | S2 |

## Definition of Done

- [x] **A0** AC table frozen in this spec (ready-for-implement).  
- [x] **A1** e2e script hardened; local ≥3 greens.  
- [x] **A2** e2e **local only** (no default GHA job) — scripts + docs.  
- [x] E2E **not** in Lefthook / `validate:full` / default CI (documented).  
- [ ] Sentry optional: documented + **wire** in example-api when DSN set; no DSN → no-op.  
- [ ] `env.schema` / `.dev.vars.example` / `env:check` include optional Sentry keys.  
- [ ] CodeRabbit **active** **or** decision documented with criteria.  
- [ ] Coverage floors + banlist + extract still green; no floor lowered.  
- [ ] `docs/testing.md` + `docs/observability.md` updated to match reality.  
- [ ] No PostHog / Datadog / Session Replay defaults.  
- [ ] Human review on Sentry scrub + any auth-touching e2e login path.

## Test plan (for implement PR)

```bash
bun run validate:full
# local e2e with servers up:
bun run test:e2e:design-system
# after S3:
bun run env:check
# Sentry off path: unit/integration still pass without DSN
```

CI: both `validate-full` and `e2e` green on the PR.

## Risks & mitigations (spec-level)

| Risk | Mitigation |
|---|---|
| Flaky e2e blocks merges | S1 local green repeatedly before S2; zero retries first; short suite |
| CI minutes | Chromium only; 15m timeout; parallel jobs; cancel-in-progress |
| PII to Sentry | Scrub middleware; no body capture default; review checklist |
| Vendor review privacy | Explicit CodeRabbit decision |
| Scope creep | Paths table E1–E3 max; product e2e forbidden |

## Non-claims

| We claim | We do not claim |
|---|---|
| Browser smoke for kit shell + overlays | Full a11y or visual regression |
| Env-gated error tracking hook | 24/7 SRE or on-call |
| CodeRabbit signal or documented decline | Automated secure code certification |
| Floors maintained | 100% e2e coverage of CP-\* (most CP stay Vitest) |

## Open questions (non-blocking)

1. Exact Sentry SDK package name/version for Workers (pin at implement via Context7 / CF docs).  
2. Prefer `.coderabbit.yaml` minimal vs App UI defaults only?  
3. Soft-gate mechanism: job-level `continue-on-error` (simplest) vs always-green reporter — pick at PR-B7-2.

**Resolved at A0:** `needs: [quality]` first land; FE Sentry optional/deferred; soft-then-hard e2e per AC-FLAKE; login path BA `sign-in/email`; design-system under `/admin`.

## Status

**ready-for-implement** (A0 2026-08-03). Next: **A1** harden `apps/example-web/scripts/e2e-design-system.mjs` (≥3 local greens) → `/ship` PR-B7-1.
