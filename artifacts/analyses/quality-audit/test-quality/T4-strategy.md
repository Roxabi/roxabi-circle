# Test Quality — T4 strategy / floors / CI

**Repo:** `/home/mickael/projects/roxabi/roxabi-boilerplate-cf`  
**Partition:** T4 (coverage floors · CP matrix · local-first · e2e/CI policy)  
**Date:** 2026-08-12  
**SSoT reviewed:** [`docs/testing.md`](../../../../docs/testing.md) · [`scripts/test-coverage.sh`](../../../../scripts/test-coverage.sh) · [`packages/config/vitest-coverage.mjs`](../../../../packages/config/vitest-coverage.mjs) · per-package `vitest.config.ts` · root `package.json` · `lefthook.yml` · `.github/workflows/ci.yml`

## Summary

The kit’s test **doctrine is strong and written down**: local-first primary gate, CI as guardrail, tiered floors (T0 high on auth/API), CP-\* inventory with non-claims, and intentional exclusion of Playwright from default GHA. Machine enforcement mostly matches the doc (`validate:full` = pre-push = CI `validate-full` job).

Strategy gaps are about **drift and blind spots**, not missing philosophy: (1) `@kit/api-client` has floors/tests but is **absent from** `scripts/test-coverage.sh`, so `validate:full`/CI never run its suite (unit gate = coverage runner only); (2) multi-tenant RBAC, flows grants/snapshots, magic-link, password-reset, and tasks/comments have real suites but **no first-class CP IDs** in the inventory; (3) e2e is honestly local-only but has **no scheduled/nightly backstop**, so CP-E2E is habit-dependent; (4) several floors sit just under Vitest 4 remapped measurements (good ratchet) while **T2 ui/web globals remain vanity-low** (acceptable only while named contracts hold).

Overall health: **strategy mature, enforcement mostly aligned, matrix and runner inventory lag the dogfood surface**.

## Findings

| ID | Severity | File | Finding | Evidence | Recommendation |
|----|----------|------|---------|----------|----------------|
| F1 | **P1** | `scripts/test-coverage.sh` · `packages/api-client/**` | **api-client never covered by the unit gate** | Package has `vitest.config.ts` floors (70/70/60/70) + `src/index.test.ts` + `test:coverage` script, but `test-coverage.sh` only `run_pkg`s auth, core, example-api, storage, db, types, mcp, email, i18n, flows, tasks, comments, ui, example-web, mcp-example — **no `packages/api-client`**. `validate:full` uses `test:coverage` only (lefthook: “no separate turbo `test`”). CI = same. | Add `run_pkg packages/api-client` under medium bar; keep floors. Optionally assert runner list ⊇ every workspace with `vitest.config.ts` (self-test). |
| F2 | **P1** | `docs/testing.md` § Critical path inventory | **CP matrix lags multi-tenant + flows dogfood** | Inventory has CP-AUTH-\*, CP-IDOR (notes + invitations only in text), architecture gates, MCP splits. Live suites exist without CP rows: `org-rbac.test.ts`, `org-roles-phase-b.test.ts` (IDOR ≥14 cases, comment cites CP-IDOR), `magic-link.test.ts`, `password-reset.test.ts`, `modules` services, `flows-dogfood.test.ts` / `packages/flows` grant∩check, `tasks.test.ts` / `@kit/tasks`+`comments`. No **CP-RBAC**, **CP-ORG**, **CP-MODULES**, **CP-FLOWS**, **CP-GRANT**, **CP-SNAPSHOT**, **CP-TASKS**, **CP-MAGIC**, **CP-PWD-RESET**. | Extend CP table + non-claims; map file homes; require new org-scoped resources to list CP-IDOR extension in PR template. Do **not** invent empty CPs without suites. |
| F3 | **P2** | `docs/testing.md` · suite file names | **CP IDs rarely machine-addressable** | Doctrine: “Prefer tests whose names/files map to these IDs. When adding `test:critical`, filter this set.” Reality: few titles contain `CP-*` (`packages/auth` dual-path cases; phase-B file header). No `test:critical` filter (still “Later”). Inventory cannot be grepped from CI as a critical subset. | Phase: tag T0 describe/it titles with CP-IDs; add `test:critical` vitest project/filter for CP-AUTH-\* + CP-IDOR + CP-UNAUTH + CP-FLOWS grant fail-closed. Keep full pre-push. |
| F4 | **P2** | Floors vs risk (multi configs) | **Tier story is right; some floors soft vs surface risk** | **T0:** auth 80/80/70/70 · example-api 78/80/65/75 (Vitest 4 recalibration #21 — was 80/70). **Incubating pure:** flows/tasks 80/80/70/80 · comments 75/75/55/75 (strong for grant/stage logic). **T1 soft:** core funcs **50**; db branches/funcs **50**; email **50/50/40/40** (CF/smtp transports are prod risk); mcp **70** but funcs/branches 50. **T2 intentional theater risk:** ui ~17% · web 10% — OK only if CP-FE-CRED + CP-UI-CONTRACT + local CP-E2E hold. **T3:** mcp-example **functions: 0**. | Keep “never lower T0 without ADR”. Raise **email** when transport matrix grows (cf fail-closed / allowlist). Pin **named** web contract files in inventory (already doctrine) and refuse raising web % via button smoke. Document email floor as T3-adjacent until transport tests thicken. |
| F5 | **P2** | `docs/testing.md` · `.github/workflows/ci.yml` · e2e scripts | **e2e not in default GHA is correct policy; no scheduled backstop** | Explicit in AGENTS, testing.md CP-E2E, ci.yml comments, `e2e-ci.sh` header: not in validate:full / Lefthook / GHA (Free minutes + flake). Proves BA login + design-system overlays only — **not** dual-auth / IDOR / RBAC. No workflow_dispatch-only or weekly job either → regression detection depends on human `bun run test:e2e:ci`. | Keep out of merge gate. Optional: **weekly / workflow_dispatch** e2e job (non-blocking for merge-on-green) or require `test:e2e:ci` in PR template when touching `@kit/ui` / auth cookie wire / design-system. |
| F6 | **P2** | `package.json` `validate` vs `validate:full` | **Two kit bars diverge on unit tests** | `validate` = lint · typecheck · **`turbo test`** · banlist · … · **no coverage floors**. `validate:full` = … · **`test:coverage`** · … · **no turbo test**. Packages missing from coverage runner (F1) are green on full gate while still “tested” only if someone runs bare `validate` / `turbo test`. Agents/docs often cite only validate:full. | Prefer single unit path: coverage runner owns all vitest workspaces **or** reintroduce `turbo test` before coverage (slower). Document “never use bare validate as release bar.” |
| F7 | **P3** | `docs/testing.md` § Gaps known | **Honest backlog still accurate; a few rows stale relative to dogfood** | Gaps table: Origin/CSRF **Shipped**; seed env-gated **Shipped**; rate-limit demo in-memory; SPA `isAdmin` not security; zip-slip product-later; Playwright CI Phase B6; mutation nightly optional. RBAC Phase B + modules + flows dogfood exist as **tests** but are not folded into CP inventory (F2). “Playwright cookie journey in CI” still open — consistent with F5. | Refresh Gaps: mark Phase B RBAC / modules as **tested under example-api** but not CP-indexed; keep Playwright CI as explicit non-goal for merge until Free minutes/stability allow. |
| F8 | **P3** | Local-first ops | **Doctrine healthy; Free private makes bypass the residual threat** | Lefthook pre-push = `deny-upstream` + trufflehog + `validate:full`. CI re-runs same command (guardrail). Secret scan **intentionally** not identical local vs CI (documented). Residual: `LEFTHOOK=0` / `--no-verify`; no branch protection on Free private; wall-clock of full suite incentivizes skip. better-sqlite3 ABI noted as local red herring. | Keep local-first. Measure wall-clock of validate:full periodically; cache where safe (turbo already). Do not move full suite *to* CI-only. Optional: CI comment when commits lack successful local hook evidence is overkill — process discipline + merge-on-green suffice. |
| F9 | **P3** | `scripts/print-coverage-summary.mjs` · CI artifact | **Coverage summary is informational, not a second gate** | Runner always prints summary (`\|\| true`). CI uploads `coverage/**/coverage-summary.json` with `if-no-files-found: ignore`. Floors enforced only by Vitest thresholds per package. No monorepo-level “global %” gate (good — avoids vanity). | Keep. If F1 fixed, summary becomes complete inventory of kit packages. |

## Metrics

- Files / surfaces reviewed: `docs/testing.md`, `scripts/test-coverage.sh`, `scripts/print-coverage-summary.mjs`, `scripts/e2e-ci.sh`, `apps/example-web/scripts/e2e-design-system.mjs`, `packages/config/vitest-coverage.mjs`, **16** vitest configs with floors, root `package.json`, `lefthook.yml`, `.github/workflows/ci.yml` (+ merge-on-green policy skim), CP inventory (~25 IDs), sample API suites (RBAC, flows dogfood, invites, password-reset)
- Issues: **P0=0 · P1=2 · P2=4 · P3=3**
- Notable hotspots:
  - Coverage runner package list vs workspace vitest configs (**api-client orphan**)
  - CP table vs multi-tenant / flows / tasks reality
  - T0 floors post-Vitest-4 recalibration (auth/api still high)
  - e2e local-only by design (no CI, no nightly)
- Floors inventory (stmts / lines / branches / funcs):

| Package / app | Floor | Tier (docs) |
|---|---|---|
| `@kit/auth` | 80 / 80 / 70 / 70 | T0 |
| `@kit/example-api` | 78 / 80 / 65 / 75 | T0 |
| `@kit/flows` | 80 / 80 / 70 / 80 | incubating / high |
| `@kit/tasks` | 80 / 80 / 70 / 80 | incubating / high |
| `@kit/comments` | 75 / 75 / 55 / 75 | incubating |
| `@kit/core` | 68 / 69 / 66 / 50 | T1 (remapped) |
| storage · types · mcp · i18n | 70 / 70 / 50–60 / 50–70 | T1 |
| `@kit/db` | 70 / 70 / 50 / 50 | T1 soft branch/func |
| `@kit/email` | 50 / 50 / 40 / 40 | T3-ish |
| `@kit/api-client` | 70 / 70 / 60 / 70 | **configured but not run in gate** |
| `@kit/ui` | 17 / 17 / 16 / 23 | T2 |
| `@kit/example-web` | 10 / 10 / 20 / 12 | T2 |
| `@kit/mcp-example` | 50 / 50 / 40 / **0** | T3 |

## Strategy recommendations

### 1. Close the unit-gate inventory hole (P1 — F1/F6)

1. Add `packages/api-client` to `scripts/test-coverage.sh` (medium bar group).
2. Add a cheap self-check: every `**/vitest.config.ts` under `packages/*` and `apps/{example-*,mcp-example}` appears in the runner (or is allowlisted with reason, e.g. `packages/config` has no tests).
3. Treat `validate:full` as the **only** advertised kit bar; avoid implying bare `validate` proves floors.

### 2. Refresh CP-\* for the kernel that actually shipped (P1 — F2/F3)

Add inventory rows (only where suites exist today), e.g.:

| Proposed ID | Behaviour (sketch) | Primary home |
|---|---|---|
| **CP-RBAC** | system + custom roles; grant ceiling; immutable system roles | `org-roles-phase-b.test.ts`, `packages/auth` module-grants |
| **CP-ORG-IDOR** | cross-org list/mutate fail-closed for roles, modules, tasks, items | example-api *extend CP-IDOR text* |
| **CP-MODULES** | dual-level module enable / resolve access | modules services + routes tests |
| **CP-FLOWS-GRANT** | grant∩permits; empty tools fail-closed; snapshot freeze | `packages/flows` + `flows-dogfood` |
| **CP-MAGIC** / **CP-PWD** | magic-link / reset wire + rate limits + no user enum | magic-link + password-reset tests |
| **CP-TASKS** | org auth + visibility hide from reader | `tasks.test.ts` |

Then: tag a few `it('CP-…')` titles and optionally introduce `test:critical` as convenience **inside** pre-push, not instead of it.

### 3. Floors policy (F4)

| Keep | Change only with evidence |
|---|---|
| Auth T0 never lowered without ADR | example-api: no further drop after #21 without ADR |
| Low ui/web global % | Raise only via risk-mapped contracts (apiFetch, gates, 401), not primitive rendering |
| High flows/tasks floors | Promote gate remains ADR-0005 D6 dogfood + second call site — floors ≠ platform JTBD met |
| email 50% | Raise when CF transport + staging allowlist tests are load-bearing |

### 4. Local-first vs CI (F8) — leave architecture, harden habits

```text
pre-commit  → Biome + staged file-length + trufflehog
pre-push    → deny-upstream + trufflehog + validate:full   ← PRIMARY
CI          → same validate:full                            ← GUARDRAIL
merge-on-green ← label reviewed + checks green
e2e         → local only (optional later: scheduled non-gating)
```

- Do **not** add Playwright to the merge path on Free private without flake budget.
- Do **not** drop coverage from pre-push to “save time” — that re-trains “CI will catch it.”
- Secret-scan dual invocation remains correctly documented (do not “simplify” into fail-open).

### 5. e2e policy (F5) — honest non-claim + optional signal

| Layer | Role |
|---|---|
| Vitest API integration | dual-auth, IDOR, RBAC, CORS — **security SoT** |
| Vitest web contracts | CP-FE-CRED, auth gates — **session wire SoT** |
| Playwright design-system | Base UI overlay + cookie login smoke — **composition canary** |
| GHA default | **exclude** e2e (current) |
| Optional later | weekly / `workflow_dispatch` e2e; never required for merge-on-green until stable |

### 6. Anti-patterns to keep banned (from doctrine — reaffirm)

- Lower T0 floors because “coverage is just a radar.”
- Happy-path-only on new org-scoped resources.
- Claiming CP-E2E or 10% web coverage = multi-tenant security.
- Product zip-slip / `private_key` tests living in `packages/*`.
- Forever-optional e2e without a written gate decision (decision exists: local-only — keep it explicit).

## Gate map (as implemented)

| Gate | Local | CI | Enforces |
|---|---|---|---|
| `validate:full` | pre-push Lefthook | `ci.yml` job `validate-full` | lint, typecheck, banlist, zod/ts major + self-tests, extract, zero-edit, import-boundary, deny-upstream, debt, agents-adr, env, **coverage floors**, license, quality-gates, build:kit, smoke:mcp |
| `turbo test` alone | via `bun run test` / bare `validate` | **not** in validate:full | unit without floors; **may hit packages missing from coverage runner** |
| Secret scan | `trufflehog-check.sh` pre-commit/pre-push | `secret-scan.yml` (action args ≠ local) | secrets; dual pass for kit `sk_` |
| CP-E2E Playwright | `test:e2e:design-system` / `test:e2e:ci` | **absent** | design-system + BA login smoke only |
| Mutation testing | manual/nightly (doc) | absent | not a PR gate |

## Clean / positive notes

- Written SSoT (`docs/testing.md`) is unusually complete: doctrine, non-claims, ownership axis, PR expectations, phased tooling.
- Tiered floors match risk narrative better than a single monorepo %.
- Architecture CPs (BAN, EXTRACT, ZERO-EDIT, DENY, IMPORT, DEBT, TS-MAJOR) have **self-tests** that plant failures — high-quality gate design.
- MCP split into REG / SMOKE / SCHEMA / BUDGET with non-claims is a model for F2 extensions.
- CI explicitly documents why e2e is out; no silent gap.
- Vitest 4 floor recalibration is evidenced (`artifacts/notes/21-vitest-vite-inventory.md`) — not arbitrary lowering.

## Recommendations (priority order)

1. **P1:** Include `@kit/api-client` in `scripts/test-coverage.sh`; add runner↔workspace inventory check.
2. **P1:** Extend CP inventory for RBAC / org IDOR extensions / modules / flows grant-snapshot / magic+password / tasks; align CP-IDOR prose with all org-scoped resources that already have tests.
3. **P2:** Start CP-ID tagging on T0 suite titles; plan `test:critical` filter without replacing full pre-push.
4. **P2:** Revisit email (and optionally db branch) floors when transport/D1 surface is load-bearing for products.
5. **P2:** Decide explicitly: weekly non-gating e2e **or** PR-template manual attestation for UI/auth wire changes — avoid limbo.
6. **P3:** Keep local-first; document wall-clock expectations; never move primary bar to CI-only on Free private.

## Files reviewed (absolute)

- `/home/mickael/projects/roxabi/roxabi-boilerplate-cf/docs/testing.md`
- `/home/mickael/projects/roxabi/roxabi-boilerplate-cf/scripts/test-coverage.sh`
- `/home/mickael/projects/roxabi/roxabi-boilerplate-cf/scripts/print-coverage-summary.mjs`
- `/home/mickael/projects/roxabi/roxabi-boilerplate-cf/scripts/e2e-ci.sh`
- `/home/mickael/projects/roxabi/roxabi-boilerplate-cf/packages/config/vitest-coverage.mjs`
- `/home/mickael/projects/roxabi/roxabi-boilerplate-cf/packages/*/vitest.config.ts` (auth, core, db, storage, types, mcp, email, i18n, flows, tasks, comments, ui, api-client)
- `/home/mickael/projects/roxabi/roxabi-boilerplate-cf/apps/example-api/vitest.config.ts`
- `/home/mickael/projects/roxabi/roxabi-boilerplate-cf/apps/example-web/vitest.config.ts`
- `/home/mickael/projects/roxabi/roxabi-boilerplate-cf/apps/mcp-example/vitest.config.ts`
- `/home/mickael/projects/roxabi/roxabi-boilerplate-cf/package.json`
- `/home/mickael/projects/roxabi/roxabi-boilerplate-cf/lefthook.yml`
- `/home/mickael/projects/roxabi/roxabi-boilerplate-cf/.github/workflows/ci.yml`
- `/home/mickael/projects/roxabi/roxabi-boilerplate-cf/artifacts/notes/21-vitest-vite-inventory.md`
