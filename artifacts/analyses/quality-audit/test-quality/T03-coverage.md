# Test Quality — T3 coverage

**Date:** 2026-07-12  
**Partition:** Coverage aggregates + testing SSoT + validate gates + CP-\* inventory  
**Sources:** `docs/testing.md`, `scripts/test-coverage.sh`, `scripts/print-coverage-summary.mjs`, `packages/config/vitest-coverage.mjs`, per-package `vitest.config.ts`, `coverage/**/coverage-summary.json`, root `package.json` / `lefthook.yml` / `.github/workflows/ci.yml`, `AGENTS.md` quality checklist  
**Excluded:** Product `apps/share-*` (absent), mutation testing (explicitly out of merge), Playwright login journey (B6 phased)

---

## Summary

Coverage tooling is **real and wired end-to-end**: shared `makeCoverage` → per-package Vitest thresholds → `scripts/test-coverage.sh` monorepo runner → `coverage/<pkg>/coverage-summary.json` + HTML → table via `print-coverage-summary.mjs`. Floors match the **tiered doctrine** in `docs/testing.md` (T0 auth/api 80%, T1 pure packages 70–75%, T2 ui/web 20%/10%, T3 soft mcp-example funcs 0%). **All 11 measured packages currently sit above their floors** on the last aggregate run under `coverage/`.

The system is **healthy as a ratchet**, not as a substitute for CP-\* truth:

| Strength | Weakness |
|---|---|
| Local-first gate: Lefthook pre-push = `validate:full` (includes floors) | `example-web` lines **10.67% vs floor 10%** — **+0.67 pt** headroom only |
| CI re-runs `test:coverage` + uploads HTML artifact | `ui` lines **21.99% vs 20%** — **+2 pt** headroom |
| T0 packages above 80% lines (auth 86%, example-api 84%) | CP-\* inventory is **docs-only** — **0** `CP-*` strings in `*.test.ts(x)` |
| Architecture gates (banlist, extract, env, license) in validate path | CP-EXTRACT claim overstates suite-green extractability (structural only) |
| Honest gaps section in `docs/testing.md` | Double test execution in `validate:full` (turbo `test` then coverage re-run) |
| FE `apiFetch` credentials contract green | Seam 3 incomplete: `example-web/src/lib/auth.ts` **0%** lines |
| | `example-api` email service **~1.7%** lines dilutes T0 package % without proving mail path |

**No P0.** Highest leverage: protect thin T2 floors with **named contract tests** (not vanity render), tag or filter CP-\*, close auth cookie-header unit gaps, and keep AGENTS checklist honest about what is already shipped.

---

## Findings

| ID | Sev | Area | Finding | Evidence |
|----|-----|------|---------|----------|
| COV-T3-001 | **P1** | `example-web` floor | **Lines/statements headroom is effectively zero.** Any non-trivial SPA addition without a contract test risks floor fail; conversely, deleting a tiny covered path (api/messages) can go red while security is unchanged. | Floor 10% stmts/lines; actual **10.67%** lines (184/1724). Branch 29.6% vs floor 20%. Covered mass is almost only `lib/api.ts` + messages catalogs; routes/chrome at **0%**. |
| COV-T3-002 | **P1** | `packages/ui` floor | **UI global % sits ~2 pts above floor** while strategy correctly deprioritizes Button vanity. Floor is still fragile if large untested components grow (sidebar alone is 544 lines at 0%). | Floor 20% lines; actual **21.99%** (357/1623). Contract surface (dialog/sheet/tooltip/dropdown subset + button + utils) carries almost all coverage; sidebar/field/avatar/etc. 0%. |
| COV-T3-003 | **P1** | CP-\* ↔ tests | **Critical-path inventory is not machine-linked.** Doctrine forbids “checklist theater” and prefers names mapping to CP-IDs / future `test:critical`, but no test file mentions `CP-*`. PR reviewers cannot grep “CP-IDOR green”. | `docs/testing.md` L125–147 lists 17 IDs; `rg CP- **/*.{test,spec}.{ts,tsx}` → **0 hits**. Coverage floors do not prove CP-IDOR or CP-CORS individually. |
| COV-T3-004 | **P1** | FE auth seam | **Seam 3 only half-pinned.** `apiFetch` + `credentials: 'include'` + UNAUTHORIZED map are tested; `lib/auth.ts` (`useMe`, `isUnauthorized`, `isAdmin`) is **0%** lines — SPA session UX regressions free of unit gate. | `coverage/example-web/.../lib/api.ts` 85.7% lines; `lib/auth.ts` 0%. `docs/testing.md` L119: seam 3 = `lib/api*` **(+ auth helpers)**. |
| COV-T3-005 | **P2** | `packages/auth` | **Cookie wire helpers lack package unit tests.** `sessionCookieHeader` / `clearSessionCookieHeader` / `parseCookie` (HttpOnly · SameSite · Secure flag) are composition-covered via example-api login, not asserted as package contract (flags, Max-Age=0 clear). | `session.ts` **74.4%** lines / **62.5%** funcs; `keys.ts` 100%. Unit tests only sign/verify/expiry/bad-sig (`keys.test.ts`). Package total still **86%** lines ≥ 80% floor. |
| COV-T3-006 | **P2** | `packages/core` | **Functions floor is thin; AppError static factories mostly unexercised.** | Total funcs **54.5%** vs floor **50%** (+4.5 pt). `errors.test.ts` hits `validation` + `toApiErrorBody` + `newRequestId`; not `unauthorized`/`forbidden`/`notFound`/`conflict`/`internal` as dedicated units (some hit via apps). |
| COV-T3-007 | **P2** | `example-api` dilution | **Demo email path almost uncovered inside T0 package.** Pulls down overall % without security value; also means CP for mail path is absent when email hardens. | `services/email.ts` **1.66%** lines (1/60); `routes/demo.ts` **55.6%**. Package still **84.2%** lines ≥ 80%. |
| COV-T3-008 | **P2** | CP-EXTRACT truth | **Extract gate ≠ “delete share apps → suite green”.** Documented claim in AGENTS / testing.md overstates what `extract-dry-run.sh` proves (tree + banlist + import presence). | Architecture audit ARCH-P7-002; `docs/testing.md` CP-EXTRACT wording vs structural script. Risk when product lands. |
| COV-T3-009 | **P2** | Gate cost | **`validate:full` runs the full test suite twice** (turbo `test` then per-pkg `vitest run --coverage`). Correct for isolation of thresholds, expensive on Free CI + pre-push. | `package.json`: `validate` includes `test`; `validate:full` = validate + `test:coverage` + license. `test-coverage.sh` re-runs all 11 packages with coverage. |
| COV-T3-010 | **P2** | T0 narrative vs thresholds | **Auth “80%” story is statements/lines only.** Functions floor is **70%** (auth actual funcs **76.5%**); session helpers can regress without failing 80% lines if keys.ts stays green. | `packages/auth/vitest.config.ts` thresholds; `docs/testing.md` T0 table says “**80%** api/auth”. |
| COV-T3-011 | **P3** | CP tags / filter | **No `test:critical` alias** (phased “Later” in testing.md) — acceptable if timeline stays honest; inventory remains human-only until then. | `docs/testing.md` L260–261. |
| COV-T3-012 | **P3** | AGENTS checklist drift | **S0 boxes still open for AppError + Vitest** though both exist with tests and coverage floors. Undermines “claim = evidence”. | `AGENTS.md` checklist: AppError/requestId/middleware **unchecked**; Vitest **unchecked**. Code + coverage contradict. |
| COV-T3-013 | **P3** | Report hygiene | **Duplicate coverage trees** under some package dirs (`packages/auth/coverage/`, `apps/example-api/coverage/`) vs canonical `coverage/<name>/`. Risk of reading stale summaries. | `makeCoverage` writes to repo `coverage/`; leftover local `coverage/` dirs also present. Runner cleans only root `coverage/`. |
| COV-T3-014 | **P3** | Phased tooling honesty | Playwright design-system smoke exists **outside** coverage floors; login→me browser journey and mutation testing correctly marked non-merge. No limbo if B6 stays scheduled. | `test:e2e:design-system`; testing.md L257–261. |

### Non-findings (positive)

| Area | Assessment |
|------|------------|
| Tier floors vs actuals | **All packages pass** last summary (see Metrics). |
| T1 pure packages | storage/db/types/mcp/email at **~100%** lines — floors 50–70% are soft ratchets with room. |
| Runner completeness | `test-coverage.sh` includes all kit packages with thresholds (auth, core, example-api, storage, db, types, mcp, email, ui, example-web, mcp-example). |
| Shared config | Single `makeCoverage` (include `src/**/*.{ts,tsx}`, exclude tests) — consistent reports. |
| Local + CI alignment | Lefthook pre-push = `validate:full`; CI has lint/typecheck/test/**coverage**/license/banlist/extract. Doctrine “local primary, CI guardrail” implemented. |
| MCP allowlist | Package + mcp-example tests lock tool list (CP-MCP intent present even without ID tags). |
| Architecture CP | CP-BAN / CP-ENV / CP-LICENSE / CP-I18N have dedicated scripts/tests (not coverage %). |
| Product isolation | No share-domain product tests diluting kit floors; product risks deferred as documented. |

---

## Metrics

### Floors (enforced) vs reality

Source of floors: each package `vitest.config.ts` → `makeCoverage(name, thresholds)`.  
Source of reality: `/home/mickael/projects/gosilex/silex-share/coverage/*/coverage-summary.json` (aggregate after last `test:coverage`).

| Package | Tier | Floor stmts/lines | Floor branch | Floor funcs | **Actual lines** | **Actual stmts** | **Actual branch** | **Actual funcs** | Headroom (lines) | Status |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `auth` | T0 | 80 | 70 | 70 | **85.98%** (135/157) | 85.98% | 80.48% | **76.47%** | +6.0 pt | Pass |
| `example-api` | T0 | 80 | 70 | 75 | **84.16%** (521/619) | 84.16% | 89.62% | 88.23% | +4.2 pt | Pass |
| `core` | T1 | 75 | 70 | 50 | **81.25%** (52/64) | 81.25% | 87.50% | **54.54%** | +6.3 pt | Pass (funcs tight) |
| `storage` | T1 | 70 | 60 | 70 | **100%** (28/28) | 100% | 90.90% | 100% | +30 | Pass |
| `db` | T1 | 70 | 50 | 50 | **100%** (4/4) | 100% | 100% | 100% | +30 | Pass |
| `types` | T1 | 70 | 50 | 50 | **100%** (9/9) | 100% | 100% | 100%\* | +30 | Pass |
| `mcp` | T1 | 70 | 50 | 50 | **100%** (31/31) | 100% | 94.11% | 100% | +30 | Pass |
| `email` | T3 soft | 50 | 40 | 40 | **100%** (28/28) | 100% | 100% | 100% | +50 | Pass |
| `ui` | T2 | 20 | 50 | 40 | **21.99%** (357/1623) | 21.99% | 80.00% | 64.28% | **+2.0 pt** | Pass (tight) |
| `example-web` | T2 | 10 | 20 | 20 | **10.67%** (184/1724) | 10.67% | 29.62% | 29.41% | **+0.67 pt** | Pass (**critical tight**) |
| `mcp-example` | T3 soft | 50 | 40 | **0** | **78.12%** (25/32) | 78.12% | 60.00% | **0%** | +28 | Pass (funcs intentional 0) |

\*types reports 0 functions in instrumented surface (schema constants only).

### Hotspots (per-file, selected)

| Package | File | Lines % | Note |
|---|---|---:|---|
| auth | `keys.ts` | 100 | T0 mint/hash/verify solid |
| auth | `session.ts` | 74.4 | Cookie header helpers untested in package |
| auth | `index.ts` | 0 | Barrel re-export — noise |
| core | `errors.ts` | 83.9 | Static factories partial |
| example-api | middleware auth/errors/headers | 100 | Guards well hit |
| example-api | `services/email.ts` | **1.7** | Demo SMTP path cold |
| example-api | `routes/demo.ts` | 55.6 | Email route partial |
| example-api | `env.schema.ts` / `index.ts` | 0 | Worker entry / schema inventory — expected |
| example-web | `lib/api.ts` | 85.7 | CP-FE-CRED primary |
| example-web | `messages/{fr,en}.ts` | 100 | Catalog load via contract |
| example-web | routes/*, `app-shell`, `lib/auth.ts` | **0** | SPA chrome intentional; auth helpers gap |
| ui | dialog/sheet/tooltip/button/utils | high | CP-UI-CONTRACT core |
| ui | `sidebar.tsx` | 0 (544 lines) | Dominates denominator |
| mcp-example | `index.ts` | 78 / funcs 0 | Registration only, handlers not invoked |

### Validate / coverage pipeline

| Script / command | Role | In `validate` | In `validate:full` | In CI |
|---|---|---|---|---|
| `bun run lint` | Biome | yes | yes | yes |
| `bun run typecheck` | Turbo TS | yes | yes | yes |
| `bun run test` | Turbo Vitest (no floors) | yes | yes | yes |
| `bun run banlist` | CP-BAN | yes | yes | yes |
| `bun run extract-dry-run` | CP-EXTRACT (structural) | yes | yes | yes |
| `bun run env:check` | CP-ENV | yes | yes | yes |
| `bun run test:coverage` | Floors + HTML/json-summary | **no** | **yes** | **yes** |
| `bun run license:check` | CP-LICENSE | no | yes | yes |
| `bun run i18n:check` | CP-I18N (also in turbo test) | via test | via test | via test |
| Lefthook pre-push | `validate:full` | — | primary gate | — |

`scripts/test-coverage.sh`: cleans `coverage/`, runs 11 packages sequentially with `bunx vitest run --coverage`, then `print-coverage-summary.mjs`; exit 1 if any package fails thresholds/tests.

### CP-\* inventory map (docs → enforcement)

| ID | Behaviour | Primary home | Enforcement today | Coverage link |
|---|---|---|---|---|
| **CP-AUTH-KEY** | mint/hash/verify `sk_`; reject bad | auth + example-api | Unit + HTTP mint/bad key | auth keys 100%; api dual-auth tests |
| **CP-AUTH-SESSION** | sign/verify; cookie flags; requireAuth | auth + example-api | Unit sign/verify/exp; API Secure cookie + login | session partial unit; flags via API |
| **CP-AUTH-DUAL** | cookie or Bearer → protected | example-api | `app.test.ts` login+me / Bearer me | require-auth 100% |
| **CP-IDOR** | B cannot read A notes | example-api | dedicated IDOR it | notes service high % |
| **CP-UNAUTH** | protected mutation → 401 | example-api | POST notes without auth | — |
| **CP-ERR** | nested error + requestId; no stack | core + example-api | errors.test + HTTP asserts | core 81% lines |
| **CP-CORS** | no evil Origin reflect | example-api | CORS it | — |
| **CP-SECRET** | fail-closed SESSION_SECRET | example-api | getSecret / useSecureCookie its | session-env 100% |
| **CP-R2** | prefix + joinObjectKey traversal | storage + example-api | storage unit + notes attachment | storage 100% |
| **CP-FE-CRED** | credentials include; UNAUTHORIZED map | example-web | `api.test.ts` | api.ts 85.7% |
| **CP-MCP** | tool allowlist kit-only | mcp + mcp-example | package + app registration tests | mcp 100% |
| **CP-BAN** | no share product strings | script | `banlist` in validate | n/a |
| **CP-EXTRACT** | extractability | script | structural dry-run | **overclaimed** vs suite green |
| **CP-ENV** | schema ↔ .dev.vars.example | script | `env:check` | n/a |
| **CP-LICENSE** | SPDX allowlist | tool | `license:check` | n/a |
| **CP-I18N** | FR/EN non-empty + key parity | example-web | messages.contract + i18n:check | messages 100% |
| **CP-UI-CONTRACT** | Base UI traps | ui (+ web smoke) | dropdown/dialog/sheet/tooltip tests | contract files high; global % low |

**Known backlog (from testing.md, still open):** Origin CSRF on mutations; server RBAC; seed disabled outside dev/test; product zip-slip / private_key→404; Playwright cookie journey in CI; mutation testing on auth (nightly).

### AGENTS checklist vs reality (testing slice)

| AGENTS item | Checklist state | Reality |
|---|---|---|
| Lefthook + pre-push `validate:full` | **[x]** | Implemented |
| Vitest (core + critical paths) | **[ ]** open | **Done** — 17 test modules + floors |
| AppError + requestId + middleware | **[ ]** open | **Done** — core + example-api covered |
| CI lint/typecheck/test/build | partial | CI has lint/typecheck/test/**coverage**/hygiene; build not the primary quality gate |
| Security headers | **[ ]** open | Headers asserted in health test (partial) |
| D1 migrations versioned | **[ ]** open | migrations present; not a coverage metric |
| Extract dry-run green without share strings | extract criterion | banlist+extract in gates; suite-drop not automated |

---

## Recommendations

| Pri | Action | Rationale |
|-----|--------|-----------|
| **P1** | **Stabilize T2 floors without vanity:** add 1–3 FE contract tests for `isUnauthorized` / 401→login mapping and keep `apiFetch` green; optionally exclude pure chrome from coverage `include` **or** raise web floor only after contracts land. Do **not** lower T0. | COV-T3-001/004 — 0.67 pt headroom is process risk, not security proof. |
| **P1** | **Tag or name tests with CP-IDs** (e.g. `it('CP-IDOR: …')` or `describe('CP-AUTH-DUAL', …)`); optional later `test:critical` filter. | COV-T3-003 — matches doctrine “no checklist theater”. |
| **P1** | **ui:** keep global 20% floor; if sidebar/field grow, either contract-test high-risk primitives or exclude layout-only files from coverage include so T2% stays meaningful. | COV-T3-002 |
| **P2** | Unit-test `sessionCookieHeader` / `clearSessionCookieHeader` / `parseCookie` (Secure on/off, Max-Age=0, missing cookie). | COV-T3-005 — package owns crypto/cookie wire (ADR-0002 seam 1). |
| **P2** | Cover AppError static factories + raise core **functions** floor toward 70% when easy. | COV-T3-006 |
| **P2** | Either add a minimal demo-email mock test or **exclude** `services/email.ts` from example-api coverage until SMTP path is first-class. | COV-T3-007 — protects T0 80% from dead weight. |
| **P2** | Rewrite CP-EXTRACT / AGENTS wording to structural truth; when product exists, add real extract job. | COV-T3-008 |
| **P2** | DX: document double-run cost; optional `validate:full` path that runs coverage **instead of** plain test for packages that always re-run under coverage. | COV-T3-009 |
| **P3** | Tick AGENTS S0 boxes that evidence already proves (Vitest, AppError). | COV-T3-012 |
| **P3** | Drop stale package-local `coverage/` dirs; gitignore consistently; treat only root `coverage/` as SSoT. | COV-T3-013 |
| **P3** | Keep mutation testing / Playwright login **out of** PR gate until cheap (already phased). | aligned with testing.md |

---

## Residual risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| SPA or UI PR fails floors by accident (noise) or merges by deleting tests to stay green | Medium | Process / quality culture | Named contracts + refuse floor-lowering without ADR (testing.md) |
| False confidence: “84% API covered” ≠ every CP green | Medium | Security regression on new resource without IDOR | PR rule: new protected resource **must** extend CP-IDOR + CP-UNAUTH |
| Session cookie flag regression only caught in one integration path | Low–Med | Auth wire | Package unit tests for cookie headers |
| Product share landings lower kit floors or skip extract truth | Med (future) | Kit extractibility | banlist + hard extract job; product tests only under `share-*` |
| `validate:full` wall-clock → hook skip temptation | Med | Local-first doctrine collapse | Keep suite fast; forbid `--no-verify`; CI remains guardrail |
| Coverage HTML artifact ignored / stale local summaries | Low | Bad audit decisions | Always re-run `test:coverage` before claiming %; use root `coverage/` only |
| T0 auth functions at 76% with session helpers untested | Low | Cookie contract drift under Better Auth swap | Seam 1 unit tests before adapter swap (ADR-0002) |

---

## Score (coverage subsystem only)

| Dimension | Score /10 | Note |
|-----------|----------:|------|
| Tooling completeness | 9 | Shared config, runner, summaries, CI, hooks |
| Floor realism (tiered) | 8 | Matches doctrine; T2 intentionally low |
| Floor headroom (stability) | 4 | web/ui critically tight |
| CP inventory completeness | 8 | Honest list + known gaps |
| CP ↔ machine enforcement | 5 | Behaviour largely tested; IDs not linked |
| AGENTS alignment | 6 | Doctrine strong; checklist stale; extract overclaim |
| **Overall T3** | **7 / 10** | Production-ready ratchet for a kit; not a substitute for named critical-path discipline |

---

## File index (absolute)

| Path | Role |
|------|------|
| `/home/mickael/projects/gosilex/silex-share/docs/testing.md` | SSoT doctrine, tiers, CP-\*, phased tooling |
| `/home/mickael/projects/gosilex/silex-share/scripts/test-coverage.sh` | Monorepo coverage runner |
| `/home/mickael/projects/gosilex/silex-share/scripts/print-coverage-summary.mjs` | Table printer |
| `/home/mickael/projects/gosilex/silex-share/packages/config/vitest-coverage.mjs` | Shared v8 options |
| `/home/mickael/projects/gosilex/silex-share/coverage/*/coverage-summary.json` | Last aggregate metrics |
| `/home/mickael/projects/gosilex/silex-share/package.json` | `validate` / `validate:full` / `test:coverage` |
| `/home/mickael/projects/gosilex/silex-share/lefthook.yml` | pre-push = validate:full |
| `/home/mickael/projects/gosilex/silex-share/.github/workflows/ci.yml` | CI guardrail + coverage upload |
| `/home/mickael/projects/gosilex/silex-share/AGENTS.md` | Dual-mission + quality checklist |
