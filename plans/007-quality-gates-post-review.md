# Plan 007 — Quality gates (post code-review)

> **Status:** TODO (amended)  
> **Date:** 2026-08-02  
> **Source:** conversation proposals P0–P3 + `/code-review` multi-domain (security · architect · product · tester · devops)  
> **Primary epic:** [#19](https://github.com/go-silex/silex-boilerplate/issues/19) B7 · Spark #120 · draft [`artifacts/specs/19-epic-b7-qualite-prod-spec.md`](../artifacts/specs/19-epic-b7-qualite-prod-spec.md)  
> **Doctrine:** [`docs/testing.md`](../docs/testing.md) · AGENTS §I · freeze **P8** (1 smoke e2e) · **O10** (Sentry hooks, not SaaS for green)  
> **Sibling:** plan [008](008-mcp-agent-contracts.md) — MCP/agent contracts (**orthogonal**) · Spark #132 · GH [#68](https://github.com/go-silex/silex-boilerplate/issues/68)

**Executor rule:** this plan **supersedes** the informal P0–P3 backlog from the quality discussion. Do not re-expand scope rejected below.

---

## Issue mapping (GitHub / Spark)

| Plan slice | GH issue | Spark | State | Notes |
|---|---|---|---|---|
| **Phase A** (B7 Shape C) | **[#19](https://github.com/go-silex/silex-boilerplate/issues/19)** | **#120** | OPEN · `spark/status:todo` · p3 | **Only existing epic** for 007. Body DoD = e2e CI + Sentry + CodeRabbit decision. Spec draft local. |
| A1 e2e harden | *(none)* | — | — | Slice of #19; no child ticket |
| A2 CI e2e job | *(none)* | — | — | Slice of #19 |
| A3 Sentry wire | *(none)* | — | — | Slice of #19 |
| A4 CodeRabbit decision | *(none)* | — | — | Slice of #19 |
| A5 testing.md matrix | *(none)* | — | — | Slice of #19 (docs DoD) |
| **Phase B** XS hygiene | *(none)* | — | — | Not in #19 body; optional ride-along or micro-issue |
| **Phase C** TS/Biome ratchet | *(none)* | — | — | **Not filed** — open after #19 if still wanted |
| **Phase D** FE CP residual | *(none)* | — | — | plan 005 DONE; inventory-only if gaps |
| Related consumer CI | [#54](https://github.com/go-silex/silex-boilerplate/issues/54) groups | — | OPEN | Orthogonal (dogfood / zero-edit) — not 007 |
| Related B6 patterns | [#18](https://github.com/go-silex/silex-boilerplate/issues/18) | #119 | OPEN · p2 | Orthogonal (MasterData, api client…) — not 007 |

**Summary:** plan 007 **n’a pas d’issues enfants**. Toute la Phase A se rattache à **un seul epic #19**. Phases B/C/D n’ont **pas** d’issue GH (et Spark → GH est one-way : créer des enfants = process Spark ou issues kit manuelles hors Spark).

**Action optionnelle (humain / Spark):** découper #19 en sous-tickets A1–A4 pour tracking, ou exécuter en PR slices sans enfants.

---

## Verdict of the review (what changed)

| Before (informal) | After (this plan) |
|---|---|
| P0 = B7 + loose hygiene | **P0 = B7 Shape C only**, with security AC |
| P1 = TS + Biome + matrix + editorconfig together | **Split:** B7 docs ride-along · hygiene XS · TS/Biome **after** B7, staged |
| P2 = FE MT contracts + optional i18n in `validate:full` | **P2 = gap inventory only** · **no** i18n in `validate:full` |
| Parallel e2e by default | First land: **`needs: [quality]`** ; parallel only after stable |
| Math.random repo-wide ban | **Scoped** or one-line fix; no new ban script |
| Gate matrix as “P1 epic” | **One table inside `docs/testing.md`** (CP-*), shipped with B7 |

---

## Goals (amended)

1. Ship **kit prod-quality companion** (#19): browser composition CI + env-gated Sentry + CodeRabbit decision.
2. Keep **local-first** doctrine: `validate:full` / pre-push **without** browser / SaaS.
3. Be honest: **e2e ≠ dual-auth / IDOR**; **lint ≠ security**.
4. Protect **consumers** (zero-edit): no silent `tsconfig.base` blast without dogfood.

**Non-goals (refuse list — normative):**

| Refuse | Why |
|---|---|
| ESLint + Biome | Dual SSoT style |
| GitGuardian / 2ᵉ secret scanner CI | TruffleHog verified suffit |
| Playwright in Lefthook / `validate:full` | Flake → bypass culture |
| UI floors → 80% | Vanity % vs named contracts |
| Mutation testing day-1 merge gate | Nightly/manual only if ever |
| `@gosilex/observability` empty | A8 |
| Session Replay / PostHog / Datadog default | Privacy + freeze |
| CodeRabbit as merge authority | Human `reviewed` + machine gates only |
| Product e2e / RBAC browser matrix | Product repos; freeze P8 |
| `i18n:check` serial step in `validate:full` | Already under example-web coverage |
| Monorepo TS ratchet in same PR as B7 | Dilutes #19 |

---

## Sequencing (hard order)

```text
Phase A — B7 promote + implement (#19)     ← only critical path
  A0  Promote spec draft → implementable (AC below)
  A1  Harden e2e local (N consecutive green)
  A2  CI job e2e (needs: [quality] first)
  A3  Sentry env-gated + scrub + unit test
  A4  CodeRabbit install OR decline doc
  A5  Docs: testing.md gate matrix + non-claims + observability

Phase B — XS hygiene (after A or tiny ride-along after A1)
  B1  .editorconfig (align Biome 2 spaces)
  B2  (optional) fix UI Math.random skeleton width — one call site

Phase C — static ratchet (SEPARATE issues; after #19 closed)
  C1  Biome: noExplicitAny warn→error (fix sites; keep UI override narrow)
  C2  TS: noUncheckedIndexedAccess on T0 packages first (auth, core) then base
  C3  Dogfood consumer merge green before monorepo-wide base flip

Phase D — residual FE contracts (gap only; not a second MT epic)
  D1  Inventory remaining gaps vs plan 005 DONE
  D2  Only missing CP-* / fail-closed cases — RTL, not Playwright
```

**Never** open a kitchen-sink PR that mixes A + C.

---

## Phase A — B7 (#19)

### A0 — Spec promote (human) — **DONE 2026-08-03**

Spec [`artifacts/specs/19-epic-b7-qualite-prod-spec.md`](../artifacts/specs/19-epic-b7-qualite-prod-spec.md) is **`ready-for-implement`**. AC table (incl. **AC-FLAKE** soft-then-hard) lives in the spec body.

| AC id | Requirement |
|---|---|
| AC-PATH | E1 = `POST /api/auth/sign-in/email`; design-system = `/admin/design-system#overlays` |
| AC-SCRUB | Sentry: `sendDefaultPii: false`; `beforeSend` **allowlist**; strip Cookie, Authorization, bodies, password/token; no email as Sentry user by default |
| AC-CAPTURE | Capture unexpected/5xx only; not VALIDATION_ERROR / 401 / 403 noise |
| AC-DSN | No `SENTRY_DSN` required for CI green; unset = zero network |
| AC-E2E-CLAIM | Docs: e2e proves cookie composition + UI overlays only; dual-auth / IDOR / org RBAC = Vitest T0 |
| AC-CR | Done = App installed **or** dated decline + revisit criteria; never required merge check |
| AC-CREDS | E2E demo password not logged; scrub login bodies; `E2E_DEMO_*` dev/test defaults only |
| AC-DEPS | First `@sentry/*` / `playwright*` PR = human review; no Dependabot auto-`reviewed` until policy |
| AC-FLAKE | A1 ≥3 local greens; A2 soft ≤7d then hard after ≥10 consecutive green GHA e2e (0 retries preferred) |
| AC-LOCAL-FIRST | e2e never in Lefthook / `validate:full` |

### A1 — Harden e2e (local)

| | |
|---|---|
| **Files** | `apps/example-web/scripts/e2e-design-system.mjs` (+ optional `scripts/e2e-ci.sh`) |
| **Do** | Remove fixed `waitForTimeout` for correctness; avoid sole `networkidle`; health poll API `/health` + web; locators role/text/`data-slot`; Playwright Chromium resolution documented |
| **Assert** | (1) login → authenticated shell visible (2) design-system overlays open (3) optional: unauth deep-link → login — **not** IDOR |
| **Verify** | Local green **≥3** consecutive runs on clean machine |
| **STOP** | Do not add CI hard-gate until A1 green |

### A2 — CI job `e2e`

| | |
|---|---|
| **Files** | `.github/workflows/ci.yml` · root script if needed |
| **Job** | `name: e2e`, timeout ≤15m, **`needs: [quality]`** on first land (Free minutes) |
| **Browser** | Playwright-managed Chromium only; pin version to lockfile; cache browsers |
| **Env** | fetch-depth 1; demo seed only; **no** Sentry DSN |
| **Artifacts** | traces/screenshots **on failure only**, retention 7d; scrub auth bodies |
| **Retries** | Prefer **0**; max 1 job retry with issue comment if flake remains |
| **merge-on-green** | Once job exists and fails, it blocks merge — ship only when stable. Do **not** put e2e inside `validate:full` |
| **Soft-gate** | **Required first land** on Free private: `continue-on-error: true` (or equivalent) **≤7 calendar days** + expire date in PR + testing.md “not a security control / not merge authority yet”. Flip hard only after AC-FLAKE. |
| **Parallel** | Only after flake budget proven; then optional drop `needs` |

### A3 — Sentry env-gated

| | |
|---|---|
| **Where** | App-local `apps/example-api/src/lib/sentry.ts` (or equivalent) + `onError` wire — **not** new package |
| **Schema** | Optional `SENTRY_DSN` / `SENTRY_ENVIRONMENT` / `SENTRY_RELEASE` in env.schema + `.dev.vars.example` placeholders |
| **Tests** | Unit test scrub helper (Bearer, Cookie, password samples stripped); init-off when DSN absent |
| **Docs** | Expand `docs/observability.md` — copy pattern for product apps |
| **Human review** | Required on wire (auth-adjacent) |
| **Out** | Session Replay; live SaaS for kit CI; empty `@gosilex/observability` |

### A4 — CodeRabbit decision

Exactly one:

1. **Enable** — minimal `.coderabbit.yaml` (path filters: ignore coverage HTML, lock noise); path note that auth/storage/MCP need human; **or**
2. **Decline** — short doc under `docs/` (or artifacts) with budget/privacy/PR-volume revisit criteria + date.

**Never:** require CodeRabbit check name for merge-on-green; never auto-apply CR on auth paths.

### A5 — Docs (gate matrix + non-claims)

Extend **`docs/testing.md` only** (no second SSoT file).

**Honesty vocabulary (from semctx CONTRIBUTING / claims discipline):**

- Prefer **proves / does not prove** over “verified”, “secure”, “complete”.  
- Lint green ≠ security; e2e green ≠ dual-auth; secret-scan verified-only ≠ no fixture passwords.  
- Whoami `verified: true` only after real `/api/me` subject (MCP docs when 008 lands).

| Column | Content |
|---|---|
| Gate | Biome · tsc · Vitest floors · banlist · extract · zero-edit · secret-scan · build:kit · smoke:mcp · **e2e (CI)** · Sentry (runtime) · CodeRabbit (signal) · *(later: import-boundary 009 · debt 010)* |
| Command / where | pre-commit / pre-push / CI job / runtime |
| CP-* covered | map or “n/a” |
| Proves | short |
| Does **not** prove | short (mandatory for e2e, lint, secret-scan verified-only) |

Also document TruffleHog `--only-verified` blind spot (demo/fixture secrets).

Fold anti-list (refuse table above) into a short “Refuse” subsection.

**Related plans (not #19 scope):** [008](008-mcp-agent-contracts.md) MCP · [009](009-layer-import-gate.md) import boundary · [010](010-quality-hygiene-debt.md) DEBT.

---

## Phase B — XS hygiene

| ID | Work | Effort | Notes |
|---|---|---|---|
| B1 | Add root `.editorconfig` (charset utf-8, lf, insert final newline, indent 2 spaces) | XS | Align with `biome.json`; for md/yml/sql outside Biome |
| B2 | Fix `Math.random` in UI skeleton width if still present | XS | Prefer fixed/prop width; **no** repo-wide ban script. If later rule: only `packages/auth/**` + id/token generators |

---

## Phase C — Static ratchet (after #19)

Separate GH issues. Measure `time bun run lint` / `typecheck` before/after.

| ID | Work | Constraint |
|---|---|---|
| C1 | Biome `noExplicitAny` → error (except justified override) | One dedicated PR; do not broaden UI override set |
| C2 | `noNonNullAssertion` → warn then error outside shadcn primitives | Same |
| C3 | `noUncheckedIndexedAccess` | **Stage:** auth + core first → dogfood → then `tsconfig.base` if clean. Release note for consumers (zero-edit inherits base) |
| C4 | Optional unused locals/params | Only if noise acceptable |

**STOP:** do not flip base flags mid-B7 PR; do not invent second “strictness gate” script (typecheck is the gate).

---

## Phase D — FE residual gaps only

Plan [005](005-auth-org-characterization-tests.md) is **DONE**. Do **not** reopen a multi-tenant UX epic.

| ID | Work |
|---|---|
| D1 | Diff plan 005 DoD vs tree: list missing named contracts (if any) |
| D2 | Add only missing RTL/happy-dom cases; map titles to CP-* in testing.md |
| D3 | Server IDOR/dual-auth remain API Vitest — never migrate to Playwright |

Skip if D1 finds zero gaps.

---

## Explicitly deferred / rejected

| Item | Decision |
|---|---|
| `i18n:check` in `validate:full` | **Reject** unless coverage excludes `messages.contract.test.ts` (today: covered) |
| Second secret scanner | **Reject** |
| Monorepo-wide Math.random ban | **Reject** (scoped or fix call site) |
| Parallel e2e day-1 | **Defer** until stable |
| CodeRabbit required status | **Reject** |
| Raise UI coverage floors | **Reject** (named contracts only) |

---

## PR slicing

| PR | Content | Review |
|---|---|---|
| **PR-B7-1** | A1 e2e harden (+ B2 if tiny) | normal |
| **PR-B7-2** | A2 CI e2e job | devops + flake watch |
| **PR-B7-3** | A3 Sentry + tests + observability docs | **human sécu** |
| **PR-B7-4** | A4 CR decision + A5 testing.md matrix | process |
| **PR-H** | B1 `.editorconfig` alone or with B7-4 | nit |
| **PR-C\*** | Phase C ratchets (one concern per PR) | after #19 closed |
| **PR-D\*** | Phase D only if D1 gaps | after inventory |

---

## Verification

### After Phase A (#19 DoD)

```bash
bun run validate:full          # still no browser; green
# CI: jobs validate-full + e2e + secret-scan green
# SENTRY_DSN unset → no outbound (unit test)
# docs/testing.md: matrix + e2e non-claims + refuse list
# CodeRabbit: live OR decline doc present
```

### Non-regression

- Coverage floors T0 auth/api **unchanged** (no lower)
- banlist / extract / zero-edit unchanged
- Product consumer: kit `ci.yml` e2e stays **example-*** only; no product secrets

---

## Ownership

| Slice | Owner type |
|---|---|
| A1–A2 e2e | frontend + devops |
| A3 Sentry | backend + **security human review** |
| A4–A5 docs/process | product / maintainer |
| Phase C | kit maintainer + consumer dogfood |
| Phase D | frontend tester |

---

## Open decisions (human, short)

1. **CodeRabbit:** enable vs decline (budget + private monorepo privacy).  
2. **e2e `needs: [quality]`** duration before parallel (recommend: until 2 weeks green).  
3. **Promote** draft spec #19 with A0 AC delta (this plan) before implement agents run.

---

## Chain

- Predecessor: informal quality backlog + code-review 2026-08-02  
- Successor implement: `/implement` on #19 using this plan as ordering, or promote spec then implement  
- Related: `plans/002` e2e BA path (DONE) · B7 analysis/spec under `artifacts/`
