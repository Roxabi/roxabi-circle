---
title: "Spec — B7 · Qualité prod (Playwright CI, obs, CodeRabbit)"
issue: 19
spark: 120
status: draft
tier: F-full
date: 2026-07-30
analysis: artifacts/analyses/19-epic-b7-qualite-prod-analysis.md
---

# Spec #19 — B7 Qualité prod

## Context

- **Issue:** [#19](https://github.com/go-silex/silex-boilerplate/issues/19) · Spark **#120**
- **Analysis:** [`artifacts/analyses/19-epic-b7-qualite-prod-analysis.md`](../analyses/19-epic-b7-qualite-prod-analysis.md) — Shape **C**
- **Doctrine:** [`docs/testing.md`](../../docs/testing.md) · [`docs/observability.md`](../../docs/observability.md)
- **Freeze:** P8 (one Playwright smoke, not matrix) · O10 (Sentry/BS hooks, not live SaaS for exit)
- **Status:** **draft** (not approved for implement until human / `/spec` promote)

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

## Expected behavior

1. On PR / push to `main`|`staging`, after (or parallel to) `validate-full`, job **`e2e`** starts API + web, seeds demo, runs Chromium smoke; fails on Base UI contract console errors or assertion failure.
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

## CI job design

### Workflow layout

Prefer **same workflow file** [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) for discoverability:

```text
jobs:
  quality:          # existing name: validate-full
    …
  e2e:              # NEW — check run name must be stable (e.g. "e2e")
    name: e2e
    runs-on: ubuntu-latest
    timeout-minutes: 15
    needs: []       # parallel with quality OK; or needs: [quality] if minutes scarce
    steps: …
```

| Decision | Choice | Rationale |
|---|---|---|
| Parallel vs after quality | **Parallel default** | Faster feedback; e2e failures independent of coverage |
| Optional `needs: [quality]` | Only if org wants to skip e2e minutes when lint fails | Acceptable alternate |
| Include in `validate:full` | **No** | Browser not local-first primary gate |
| merge-on-green | Any failed completed check already blocks | After e2e is non-flaky, it **is** a merge gate — do not ship red |
| Job display name | Exact short name **`e2e`** | Human + optional future name match |
| Secret-scan | Unchanged standalone workflow | Orthogonal |
| Workflow_run list | No change required if e2e is a job under workflow `CI` | merge-on-green already listens to `CI` completion |

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
| E1 | `/login` → session via `POST /api/auth/login` + `credentials: 'include'` | Login OK; no Base UI contract console errors | CP-FE-CRED / CP-AUTH-SESSION (browser wire) |
| E2 | `/design-system#overlays` | Dropdown open (label Actions); Dialog open; Sheet open | CP-UI-CONTRACT |
| E3 (optional same job) | After login, `/` or notes list smoke | Me/notes page loads without pageerror | composition only — **not** IDOR (stays Vitest) |

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
- Note in `docs/testing.md`: e2e CI job exists; CP-E2E row; still not in pre-push.

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

## Slices (implementation order)

| Slice | Demo-able increment | Depends |
|---|---|---|
| **S1** | Harden e2e script (no sleep correctness; browser resolve; health poll) green **local** | — |
| **S2** | CI job `e2e` green on PR; artifacts on failure; docs testing.md CP-E2E | S1 |
| **S3** | `SENTRY_DSN` in schema + example; API init + onError gated; observability.md | — (parallel S1) |
| **S4** | CodeRabbit enable **or** decision doc | — (parallel) |
| **S5** | Optional FE Sentry + optional me/notes browser step | S2, S3 |

## Definition of Done

- [ ] Job **`e2e`** on CI (workflow `CI`) green on main kit paths **E1+E2** (E3 optional).  
- [ ] E2E non-flaky policy applied (no correctness sleeps; health poll; Chromium CI).  
- [ ] E2E **not** required in Lefthook `validate:full` (documented).  
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

## Open questions (non-blocking for draft)

1. `needs: [quality]` vs fully parallel e2e?  
2. FE Sentry in same PR as S3 or S5 only?  
3. Exact Sentry SDK package name/version for Workers (pin at implement via Context7 / CF docs).  
4. Prefer `.coderabbit.yaml` minimal vs App UI defaults only?

## Status

**draft** — analysis Shape C · ready for human approve / implement after promote. No commit of implement work under this analysis/spec alone.
