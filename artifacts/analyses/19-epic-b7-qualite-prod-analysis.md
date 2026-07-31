---
title: "B7 · Qualité prod (Playwright CI, obs, CodeRabbit) — technical analysis"
issue: 19
spark: 120
status: draft
date: 2026-07-30
---

# Analysis #19 — B7 Qualité prod

## Source

| | |
|---|---|
| **Issue** | [#19](https://github.com/go-silex/silex-boilerplate/issues/19) · Spark **#120** |
| **Bloc** | **B7** — séquentiel #7 · après B4+B5 (issue body); kit exit already has unit/coverage gates |
| **Refs** | [`docs/testing.md`](../../docs/testing.md) · [`docs/observability.md`](../../docs/observability.md) · AGENTS §I · goal freeze **P8** / **O10** · TD-B-018 / TQ-T02-004 |
| **Status** | Analysis **draft** · recommended shape → spec draft |

## Problem

Unit/integration gates are strong (`validate:full` local + CI `validate-full`, coverage floors, banlist, extract, MCP smoke). Three **prod-ready** gaps remain before (or as soon as) a product deploys on this kit:

1. **Browser e2e** — design-system Playwright smoke exists **only** as a local optional script; not in CI; sleep-based and Chrome-path fragile.
2. **Error tracking** — structured logs + `requestId` are P0; Sentry/Better Stack are doc stubs (`docs/observability.md`), no env-gated wire in examples.
3. **AI PR review** — CodeRabbit (or equivalent) is AGENTS P1 default “when budget”; no org decision or install.

Without these, product deploys inherit “unit green” confidence only — no browser composition gate, no exception sink, no automated review signal on kit PRs.

## Outcome (target)

| Area | Done means |
|---|---|
| **E2E** | Non-flaky Chromium job in CI covering **few** kit main paths (login cookie + design-system overlays; optional me/notes); not a full matrix |
| **Obs** | Sentry (and BS notes) **env-gated**; no live SaaS required for kit; wire activates only when DSN set |
| **CodeRabbit** | **Either** active on kit PRs **or** written decision (decline / alternative + revisit criteria) |
| **Floors** | Coverage floors + banlist unchanged (no lowering for e2e theatre) |

## Appetite

One focused epic cycle, **internally sliced** (e2e harden → CI job → Sentry hooks → CodeRabbit decision). Rough **M** if e2e stabilized first; **L** if full matrix or new `@gosilex/observability` package zoo is attempted (reject).

## Baseline (today)

| Area | State | Evidence |
|---|---|---|
| CI quality | Single job `validate-full` = `bun run validate:full` | [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) |
| E2E script | `playwright-core` + system Chrome; login + overlays; **3× `waitForTimeout`**; `networkidle`; hardcoded demo creds; needs API+web up manually | [`apps/example-web/scripts/e2e-design-system.mjs`](../../apps/example-web/scripts/e2e-design-system.mjs) |
| E2E in gates | **Not** in `validate` / `validate:full` / CI | root `package.json`; TD-B-018 |
| Merge gate | merge-on-green: **all** non-self checks completed + green; requires secret-scan + `validate-full` | [`.github/workflows/merge-on-green.yml`](../../.github/workflows/merge-on-green.yml) |
| Logs | `@gosilex/core` `createLogger` JSON lines | [`packages/core/src/logger.ts`](../../packages/core/src/logger.ts) |
| Sentry | Doc comment only; no `SENTRY_DSN` in env schema / `.dev.vars.example` | [`docs/observability.md`](../../docs/observability.md), `env.schema.ts` |
| Package obs | No `@gosilex/observability` (correct under A8 — no empty zoo) | packages tree |
| CodeRabbit | Not installed / no `.coderabbit.yaml` | repo root |
| Goal freeze | **P8** Playwright 0 or 1 smoke B6, not full matrix · **O10** Sentry/BS **hooks**, not live SaaS for exit | goal arbitration freeze |

## Shapes

### Shape A — E2E CI only

Harden design-system smoke + add CI job. Docs for Sentry stay as-is. CodeRabbit deferred indefinitely.

| | |
|---|---|
| **Pros** | Smallest risk; fixes the biggest false-confidence gap (browser composition); matches P8 |
| **Cons** | Misses issue DoD (Sentry + CodeRabbit decision); product deploy still blind on errors |
| **Rough scope** | S–M |
| **Fit DoD** | Partial (1/3) |

### Shape B — E2E CI + obs hooks (no CodeRabbit install)

Shape A + env-gated Sentry wire in `example-api` (and thin FE optional) + expand `docs/observability.md` + env schema keys. CodeRabbit = **decision note only** (enable later).

| | |
|---|---|
| **Pros** | Matches technical DoD except “CodeRabbit actif”; privacy-safe (no third-party review SaaS until budget); O10-aligned |
| **Cons** | PR review AI still manual; org may want install in same epic |
| **Rough scope** | M |
| **Fit DoD** | Yes if decision is documented |

### Shape C — Full epic (e2e + obs + CodeRabbit path) — **recommended**

Shape B + **explicit CodeRabbit decision**: install + minimal config **or** documented decline with revisit criteria (budget / privacy / Copilot seats). No requirement that paid SaaS be live for kit exit if decline is written.

| | |
|---|---|
| **Pros** | Closes issue DoD fully; keeps freeze (hooks not forced SaaS; e2e smoke not matrix); single epic narrative for product readiness |
| **Cons** | Slightly more process/org work (secrets, App marketplace, privacy review) |
| **Rough scope** | M |
| **Fit DoD** | Full |

### Shape D — Full matrix + live SaaS default + observability package

Playwright multi-browser, multi-route suite; Sentry+BS+Session Replay on by default; new `@gosilex/observability` package day one.

| | |
|---|---|
| **Pros** | Looks “enterprise” |
| **Cons** | Violates **P8**, **O10**, A8 package rule, Free CI minutes, privacy/cost; high flake surface |
| **Rough scope** | XL |
| **Fit** | **Rejected** |

## Fit check

| Constraint | Implication |
|---|---|
| P8 one smoke, not matrix | Paths: login + design-system overlays (+ optional thin me/notes). No product upload/zip e2e in kit |
| O10 hooks not live SaaS exit | `SENTRY_DSN` absent → no init, zero network; no CF secret required for green CI |
| merge-on-green “all checks” | New e2e check **will block merge** once added — must be non-flaky before required |
| Local-first doctrine | E2E **not** forced into Lefthook pre-push (browser + dual servers = wall-clock + flake). Optional local script; **CI is the e2e gate** |
| Free private minutes | Separate job, timeout tight, Chromium only, cache browsers if possible |
| No empty packages | Prefer thin app-level Sentry init + core logger; promote `@gosilex/observability` only if ≥2 call sites + ADR |
| Dual-mission kit | 0 product-share strings; e2e stays on `example-*` routes only |
| Auth interim ADR-0002 | E2E asserts cookie session wire (login → protected UI), not Better Auth internals |

**Chosen: Shape C**, delivered as ordered slices (see spec). Shape D rejected. Shape A insufficient vs issue body.

## Flaky-test risk (e2e)

| Risk | Today | Mitigation for B7 |
|---|---|---|
| Fixed sleeps | 3× `waitForTimeout` | Replace with locator visibility / role assertions |
| `networkidle` | Hang-prone under concurrent servers | Prefer `domcontentloaded` + explicit ready selectors |
| System Chrome path | `/usr/bin/google-chrome` missing on GHA / Nix | CI: Playwright-managed Chromium; local: `CHROME_PATH` or `npx playwright install` with clear error |
| Manual server up | Script assumes 5173+8787 | CI/orchestration: start wrangler + vite, health-poll `/health` + base URL, then run |
| Demo credentials | Hardcoded in script | Keep kit demo only; document; do not put prod secrets in e2e |
| Login race / seed | Seed not run in CI | CI step: migrate + seed (or env that auto-seeds in development/test) before e2e |
| Overlay selectors | `data-slot` + roles | Pin to stable design-system copy; fail on Base UI contract console errors (already) |
| Parallel CI noise | cancel-in-progress on CI | Keep concurrency group; e2e job same workflow or sibling with clear name |
| merge-on-green | Flake blocks all merges | **Gate e2e only after N green runs** or ship as `continue-on-error: true` for first PR then flip (prefer harden first, ship required) |

**Policy:** e2e is a **few** critical browser paths (composition proof), not a second unit suite. Auth/IDOR remain Vitest (`createApp`).

## Cost & privacy

### Sentry

| Dimension | Assessment |
|---|---|
| **Cost** | Free tier often enough for kit examples; product pays when volume grows. No cost if DSN unset |
| **Privacy** | Error payloads can include PII (email, note bodies) if careless. Rules: scrub headers/cookies; tag `requestId` only; no full request body by default; no Session Replay in kit default |
| **Workers** | Use official Workers/Sentry SDK patterns; init per isolate when DSN present; never log secrets |
| **Alternative** | GlitchTip self-host if SaaS policy forbids Sentry — same env-gated shape (`SENTRY_DSN` compatible or `ERROR_DSN`) |
| **Better Stack** | Logs/uptime optional; document only in B7 unless existing org account — no mandatory wire for DoD |

### CodeRabbit

| Dimension | Assessment |
|---|---|
| **Cost** | Paid beyond free trial; org budget decision |
| **Privacy** | Diffs leave GitHub to vendor — private repo code. Accept only if org OK with vendor processing |
| **Value** | Monorepo-aware conventional comments; signal not merge authority (human + CI remain SoT) |
| **Alternatives** | GitHub Copilot code review (if seats); human + `/code-review` skills; none until budget |
| **Decision criteria** | See spec § CodeRabbit — enable if budget + privacy OK; else document decline + revisit triggers |

### Out of scope tools (cost/privacy FOMO)

| Tool | Why out |
|---|---|
| **PostHog** | Product analytics — not error tracking; privacy surface; issue hors scope |
| **Datadog** | Cost/complexity; AGENTS non-default |
| **Sentry Session Replay** | High privacy cost; not kit default |
| **Plausible** | Web analytics separate track (B8 park / product sites) |

## Files likely impacted (implement, ≥3)

| Path | Change |
|---|---|
| `apps/example-web/scripts/e2e-design-system.mjs` (or `e2e/*.spec` later) | Harden waits, browser resolution, health poll |
| `apps/example-web/package.json` / root scripts | CI-friendly e2e entry (spawn or compose) |
| `.github/workflows/ci.yml` | New job `e2e` (Chromium); name stable for humans |
| `merge-on-green.yml` | Optionally require e2e job name once stable (today: any failed check blocks) |
| `apps/example-api/src/env.schema.ts` + `.dev.vars.example` | Optional `SENTRY_DSN` (and release?) |
| `apps/example-api` error path / entry | Env-gated Sentry capture |
| `apps/example-web` (optional) | Env-gated FE Sentry only if cheap + no DSN in git |
| `docs/observability.md` | Wire steps, scrub rules, non-claims |
| `docs/testing.md` | E2E CI status, CP-E2E, anti-flake notes |
| `docs/` or `artifacts/` CodeRabbit decision | Enable config **or** decline ADR/note |
| `.coderabbit.yaml` | Only if enabling |

## Risks

1. **Flaky e2e blocks merge-on-green** — highest process risk on Free private.
2. **Putting e2e in pre-push** — agent/dev bypass culture; reject for B7.
3. **Sentry with default PII** — treat as security review surface.
4. **Empty observability package** — A8 violation.
5. **CodeRabbit without privacy OK** — code exfil to vendor; must be explicit.
6. **Scope creep to product e2e** — ban; product lives in consumer repos later.

## Unresolved (for implement, not analysis blockers)

- Exact Playwright install strategy on GHA (`playwright install chromium` vs browser action SHA pin).
- Whether me/notes browser smoke is in same script or second file (prefer same job, sequential, still “one smoke suite”).
- FE Sentry in B7 vs API-only first (recommend API-first; FE optional slice).
- Better Stack: doc-only vs Logtail token env (recommend **doc-only** unless org already has BS).

## Recommendation

Implement **Shape C** with slices:

1. **E2E harden + CI job** (required for DoD; P8 paths only).  
2. **Sentry env-gated wire** (API first) + docs + env schema.  
3. **CodeRabbit decision** (install minimal config **or** decline note with criteria).

Do **not** expand matrix, default-on SaaS, PostHog/Datadog, or new empty packages. Proceed to draft spec.
