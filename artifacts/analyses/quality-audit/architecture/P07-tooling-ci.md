# Architecture — P7 tooling/CI

**Date:** 2026-07-12  
**Partition:** `scripts/**`, `tools/**`, `.github/**`, root `package.json`, `turbo.jsonc`, `biome.json`, `lefthook.yml`, `docker-compose.yml`, root `tsconfig.json`  
**Focus:** monorepo gate design, CI architecture, extract-dry-run / banlist placement, validation pipeline coherence with AGENTS.md (local-first gates)  
**Method:** static read of gate scripts, root config, workflows, `docs/testing.md`, AGENTS checklist; cross-check package scripts and turbo graph  
**Excluded:** product `apps/share-*` (absent), package domain logic (P1–P6)

---

## Summary

Tooling for Chemin A is **coherent with the local-first doctrine** documented in AGENTS.md and `docs/testing.md`: Lefthook **pre-push = `validate:full`** is the primary gate; GitHub **CI re-runs the same quality surface** as a guardrail; **Secret scan** is orthogonal; **merge-on-green** encodes Free-private reality (`reviewed` + checks, App token, no branch protection). Architecture gates for dual-mission (**banlist** + **extract-dry-run**) live under `scripts/`, are wired into both `validate` and CI, and correctly scope product-domain tokens to **packages + example apps only**.

Strengths: single root SSoT for scripts (`package.json` → bash/TS), Bun pin shared with CI (`1.3.14`), coverage floors via shared `makeCoverage`, license policy + report, Mailpit compose for email sink, PR template maps to CP-\*.

Main gaps are **pipeline efficiency and truthfulness**, not missing gates:

1. **`validate:full` pays for tests twice** (`turbo test` then per-package `vitest --coverage`) — primary-gate wall-clock risk and bypass temptation.  
2. **CP-EXTRACT marketing vs implementation** — extract is a **structural / import / banlist** check, not “delete `share-*` and prove examples green.”  
3. **CI vs `validate:full` step order/composition can drift** (CI expands steps manually instead of calling one script).  
4. Minor turbo/tsconfig/dead-task hygiene; **scripts/tools themselves have no automated tests**.

No P0 security hole in tooling config itself (secrets gitignored, example-file scan, TruffleHog verified-only). Residual **ops** risk: `gosilex-ci` App vars and Free-plan lack of branch protection remain process-dependent.

---

## Findings

| ID | Severity | Location | Finding | Evidence |
|----|----------|----------|---------|----------|
| ARCH-P7-001 | **P1** | `package.json` `validate` / `validate:full` · `scripts/test-coverage.sh` · `lefthook.yml` | **Primary gate double-runs the full test suite.** `validate` runs `turbo test` (unit, no thresholds); `validate:full` then runs `test:coverage`, which re-invokes Vitest with coverage for **every** kit package/app. Pre-push always pays 2× suite cost. That conflicts with “fast enough for pre-push” doctrine in `docs/testing.md` and raises LEFTHOOK=0 / skip risk on Free CI minutes. | `package.json:27–28`: `validate` = lint→typecheck→**test**→banlist→extract→env; `validate:full` = validate + **test:coverage** + license. `scripts/test-coverage.sh:23` `bunx vitest run --coverage` per package. Lefthook pre-push runs only `validate:full` (`lefthook.yml:27–29`). |
| ARCH-P7-002 | **P1** | `scripts/extract-dry-run.sh` · CP-EXTRACT / AGENTS extract claim | **Extract gate is structural, not “suite green after drop product.”** Script checks required tree files, banlist (via nested call), example **import presence** of `@gosilex/*`, tsconfig extends string, ADR files. It does **not** remove or isolate `apps/share-*`, re-run lint/typecheck/test, or prove workspaces still resolve without product. When product lands, false confidence: monorepo can still be green while kit is not extractable as a standalone install. | `extract-dry-run.sh:28–51` required paths; `:69–71` banlist; `:73–111` `search_q` imports; no `turbo test` / temporary tree. AGENTS “Critère extractible: supprimer `apps/share-*` → examples + packages verts”; `docs/testing.md` CP-EXTRACT: “drop share apps → examples + packages still green.” Modes `kit`/`mono` only change messaging for product dirs (`:54–67`); only `strict` hard-fails on product presence. |
| ARCH-P7-003 | **P2** | `package.json` validate · `extract-dry-run.sh` | **Banlist runs twice inside one `validate`.** Standalone `banlist` then extract re-invokes `check-banned-strings.sh`. Correctness OK; noise and small wall-clock waste; failures may be reported twice. | `package.json:27` `… banlist && extract-dry-run …`; `extract-dry-run.sh:71` `bash scripts/check-banned-strings.sh`. |
| ARCH-P7-004 | **P2** | `.github/workflows/ci.yml` vs `package.json` `validate:full` | **CI does not invoke `validate:full`; step set is hand-maintained.** Current CI includes the same *logical* gates (lint, typecheck, env, test, coverage, license, banlist, extract) but **order differs** (env before test; banlist/extract last). Risk: future root-script change without CI update → local primary gate ≠ guardrail. Artifact upload justifies multi-step CI; still no single “source of truth” assertion (e.g. `validate:full` job *or* shared composite). | `ci.yml:28–49` discrete steps; root `validate:full` order env after banlist/extract. Secret scan is correctly separate workflow. |
| ARCH-P7-005 | **P2** | `turbo.jsonc` · package scripts | **Turbo `lint` task is dead; monorepo lint is root Biome only.** `turbo.jsonc` declares `"lint": {}` but workspace packages have no `lint` scripts. Root uses `biome check .` (good for monorepo). Dead task confuses “turbo lint” mental model and future package-local lint experiments. | `turbo.jsonc:22–23`; package.json scripts across packages: typecheck/test only (grep). Root `lint`: `biome check .` (`package.json:12`). |
| ARCH-P7-006 | **P2** | root `tsconfig.json` vs `packages/config/tsconfig.base.json` | **Two root-ish TS bases: packages extend config package; root tsconfig is orphaned.** Workspaces use `extends: …/packages/config/tsconfig.base.json`. Root `tsconfig.json` is a parallel strict-ish config (no DOM, no extends) and is **not** referenced by apps/packages. Drift risk if someone typechecks tooling via root file; `tools/licenseChecker.ts` / `scripts/check-env-sync.ts` are Bun scripts without dedicated tsconfig project membership. | Root `tsconfig.json` standalone; 11 workspace tsconfigs extend `packages/config/tsconfig.base.json` only. |
| ARCH-P7-007 | **P2** | `scripts/extract-dry-run.sh` EXTRACT_MODE | **`kit` vs `mono` modes are effectively identical for product presence.** Both allow `apps/share-*` with a NOTE; only `strict` fails. Dual-mission docs imply intentional mode matrix; implementation is under-differentiated (future risk: callers think `kit` fails closed on product). | Comments `extract-dry-run.sh:4–7`; logic `:54–67` — fail only if `MODE == strict`. Default `EXTRACT_MODE:-kit`. CI never sets mode (defaults kit). |
| ARCH-P7-008 | **P2** | `scripts/*` · `tools/licenseChecker.ts` | **Architecture gates have zero automated tests.** License checker exports pure functions (`loadPolicy`, `isLicenseAllowed`, …) but no `*.test.ts`. Banlist / extract / env:check / coverage runner are bash — regressions only caught when a human runs validate. High leverage for table tests on banlist patterns, SPDX OR/AND, env key inventory. | Grep for tests referencing licenseChecker / check-banned / extract / check-env-sync → **none**. |
| ARCH-P7-009 | **P2** | `package.json` `prepare` · `lefthook.yml` | **`prepare: lefthook install \|\| true` soft-fails.** Fresh clone can succeed install with **no hooks**; doctrine says primary gate is local pre-push. Developers/agents without explicit `lefthook install` rely only on CI (anti-pattern AGENTS forbids as habit). | `package.json:29` `lefthook install \|\| true`. Docs correctly stress install, but machine gate is optional. |
| ARCH-P7-010 | **P2** | `.github/workflows/ci.yml` vs `secret-scan.yml` / `merge-on-green.yml` | **Action pin hygiene inconsistent.** Secret scan and merge-on-green pin SHAs for checkout/script/app-token; CI uses floating tags `actions/checkout@v4`, `oven-sh/setup-bun@v2`, `actions/upload-artifact@v4`. Supply-chain / reproducibility weaker on the main quality job. | `ci.yml:19–21, 51–53` tags; `secret-scan.yml:28` SHA; `merge-on-green.yml:58,65` SHAs. |
| ARCH-P7-011 | **P2** | AGENTS / Free private · `merge-on-green.yml` | **Merge gate depends on org App credentials + human `reviewed` label — not branch protection.** Design matches Free limits (good). Residual: if `GOSILEX_CI_APP_ID` / private key missing, merge step fails after evaluate; if humans merge without workflow, process fails open. AGENTS still lists App install as unchecked. | AGENTS checklist “Créer/installer App…” open; `merge-on-green.yml:56–61` mints App token; fail-closed empty checks (`:122–128`); requires TruffleHog + `lint-typecheck-test` names (`:129–141`). |
| ARCH-P7-012 | **P3** | `package.json` `i18n:check` · `validate` | **i18n contract not a first-class validate step.** Documented as “also in turbo test” — true if `example-web` tests always run `messages.contract.test.ts`. Explicit `i18n:check` can be skipped if someone runs filtered tests only; full `validate` still OK via turbo. | `package.json:25` alias; `validate` does not call it; `docs/testing.md:51`. |
| ARCH-P7-013 | **P3** | `scripts/test-coverage.sh` vs `turbo.jsonc` `test:coverage` | **Coverage runner bypasses Turbo entirely** (manual sequential `run_pkg`). Turbo declares `test:coverage` with `cache: false` but root script does not use `turbo test:coverage`. Parallelism and graph unused for the expensive job. | `test-coverage.sh:15–46` sequential `cd` + vitest; root `"test:coverage": "bash scripts/test-coverage.sh"`. |
| ARCH-P7-014 | **P3** | `extract-dry-run.sh` required list | **`packages/config/package.json` not in required tree list** (only tsconfig extend string search). Config package can vanish as a workspace package while relative paths still work — weakens “kit packages present” invariant (related to P1 ARCH-P1-001 relative coupling). | Required list `:28–44` has core/types/auth/db/storage/ui/email/mcp + examples, **not** config. |
| ARCH-P7-015 | **P3** | AGENTS monorepo sketch · repo layout | **AGENTS sketches `tooling/`; repo uses `scripts/` + `tools/`.** Harmless naming drift; agents searching `tooling/` miss gates. | AGENTS §K tree `tooling/`; actual: `scripts/` (5 files), `tools/licenseChecker.ts`. |
| ARCH-P7-016 | **P3** | `.github` | **No CODEOWNERS** despite AGENTS optional gate for auth/mcp/migrations. Free private may limit enforcement; process-only today. | Grep CODEOWNERS → only AGENTS mention. |
| ARCH-P7-017 | **P3** | Banlist pattern design | **Banlist excludes `*.test.ts` and uses product-ish tokens carefully** — good for extractability, but product vocabulary in **comments / non-test sources** can still hit. Patterns are regex-ish (`share/\{slug\}`, `s\.gosilex\.com`); easy false negatives if product renames (e.g. `private_key` alone not banned — only `private_key_product`). | `check-banned-strings.sh:16–24`, `:35` exclude tests; extra R2 check `:63–68`. |
| ARCH-P7-018 | **P3** | `docker-compose.yml` | **Mailpit-only compose; not CI-gated (correct).** Aligns AGENTS H2 local email. No healthcheck/depends_on for multi-service growth yet. | `docker-compose.yml:1–10` mailpit 1025/8025. |

### Non-findings (healthy / aligned)

| Area | Assessment |
|------|------------|
| Local-first doctrine | **Aligned.** Lefthook documents primary gate; pre-commit Biome staged; pre-push `validate:full`; CI secondary; PR template requires local green. |
| Gate surface parity | **Substantially aligned.** CI runs lint, typecheck, env:check, test, coverage, license, banlist, extract — same as `validate:full` contents. |
| Banlist placement | **Correct.** Targets packages + example apps only; product dirs excluded by design (dual-mission safe). |
| Extract dual-mission fix | **Done vs older review.** R2 review noted hard-fail on `share-*`; current default modes no longer hard-fail (only `strict`). |
| Secret hygiene scripts | **Good.** env:check SSoT = `env.schema.ts` ↔ `.dev.vars.example`; heuristic secret patterns on examples; `.gitignore` for real vars; TruffleHog `--only-verified`. |
| Coverage architecture | **Sound.** Shared `packages/config/vitest-coverage.mjs` → repo `coverage/<name>/`; floors per package; summary printer; CI artifact upload. |
| License gate | **Sound.** Zero-dep Bun walker, policy JSON, report under `reports/`; UNKNOWN warn / disallowed fail. |
| Commit hygiene | **Sound.** commitlint conventional; PR types mirror; merge method merge-commit (not squash) in workflow. |
| Biome monorepo | **Sound.** Root config, VCS + gitignore, Tailwind CSS, ui override for shadcn a11y noise. |
| Bun workspaces + Turbo | **Sound for typecheck/test graph.** `dependsOn: ^typecheck` on test; packageManager pin. |
| E2E / Playwright | **Intentionally out of merge gate** (docs phased B6) — design-system script exists, not in validate:full. |

---

## Metrics

| Metric | Value |
|--------|------:|
| Root npm scripts (quality-related) | **16** (`lint`, `lint:fix`, `typecheck`, `test`, `test:coverage`, `extract-dry-run`, `banlist`, `env:check`, `i18n:check`, `license:check`, `validate`, `validate:full`, + db/e2e/dev/build) |
| Gate scripts under `scripts/` | **5** |
| Tools under `tools/` | **1** (`licenseChecker.ts` ~479 LOC) |
| GitHub workflows | **3** (CI, secret-scan, merge-on-green) |
| Lefthook phases | **3** (pre-commit, commit-msg, pre-push) |
| Gates in `validate` | **6** (lint, typecheck, test, banlist, extract, env) |
| Gates added in `validate:full` | **+2** (coverage, license) |
| Gates in CI quality job | **8** steps + artifact (same logical set as full) |
| Banlist patterns (array) | **6** + 1 R2 heuristic |
| Extract required filesystem paths | **16** |
| Extract `@gosilex/*` consumer checks | **8** packages |
| Turbo tasks defined | **6** (build, typecheck, test, test:coverage, dev, lint) |
| Turbo tasks actually used from root | **typecheck, test, build, dev** (lint unused; test:coverage bypassed) |
| Workspace packages with `test` script | **11** (8 packages + 3 apps; config has no tests) |
| Automated tests for scripts/tools | **0** |
| Docker services | **1** (mailpit) |
| Issues total | **18** |
| P0 | **0** |
| P1 | **2** |
| P2 | **9** |
| P3 | **7** |

### Pipeline map (as implemented)

```text
pre-commit (Lefthook)
  └── biome check --write --staged

commit-msg
  └── commitlint

pre-push (PRIMARY)
  └── bun run validate:full
        ├── validate
        │     ├── biome check .                 # root, not turbo
        │     ├── turbo typecheck               # ^typecheck DAG
        │     ├── turbo test                    # suite #1
        │     ├── banlist                       # scripts/check-banned-strings.sh
        │     ├── extract-dry-run               # re-runs banlist + structure
        │     └── env:check                     # schema ↔ examples
        ├── test:coverage                       # suite #2 + floors (bash sequential)
        └── license:check                       # tools/licenseChecker.ts

CI guardrail (parallel on PR/push main|staging)
  ├── Secret scan (TruffleHog verified, full history)
  └── CI / lint-typecheck-test
        lint → typecheck → env → test → coverage → license → banlist+extract
        + coverage artifact

merge-on-green (Free private substitute for branch protection)
  reviewed label + all checks green + TruffleHog + lint-typecheck-test
  → merge commit via gosilex-ci App token
```

### Coherence scorecard vs AGENTS.md

| AGENTS claim | Status |
|--------------|--------|
| pre-push = `validate:full` primary | **Met** (`lefthook.yml`) |
| CI = same suite guardrail | **Mostly met** (manual steps; order differs) |
| banlist + extract in validate | **Met** |
| coverage floors in full gate | **Met** |
| license:check in full gate | **Met** |
| secret scan CI | **Met** |
| merge-on-green + gosilex-ci (no PAT) | **Implemented**; App install ops open |
| branch protection | **Blocked Free** (documented) |
| extract = kit green without share | **Partial** (structure only — ARCH-P7-002) |
| Lefthook install required | **Docs yes; prepare soft-fail** (ARCH-P7-009) |

---

## Recommendations

1. **Collapse double test cost in primary gate (ARCH-P7-001) — P1**  
   - Prefer: `validate:full` = lint + typecheck + **coverage-only tests** (thresholds) + banlist + extract + env + license — drop plain `turbo test` from the full path, **or** make `test:coverage` the only test entry and keep `test` for fast local iteration.  
   - Alternative: `validate` keeps fast unit; pre-push runs `validate` + coverage on **T0 packages only** (auth, example-api), full coverage in CI — document the split so doctrine stays honest.  
   - Do **not** silently drop floors.

2. **Harden CP-EXTRACT truth (ARCH-P7-002) — P1**  
   - Short term: rewrite CP-EXTRACT / AGENTS wording to “structural extractability + banlist + consumer imports,” not “suite green after delete.”  
   - Medium term: optional job/`EXTRACT_MODE=strict` + temp worktree excluding `apps/share-*` running `bun run typecheck && bun run test` (or CI matrix `kit-only`).  
   - Document when to use `strict` (template release / extract dry-run CI goal B6).

3. **Single composition for CI ↔ local (ARCH-P7-004) — P2**  
   - Option A: CI job `run: bun run validate:full` + separate artifact step after coverage (may need coverage always written).  
   - Option B: shared script `scripts/ci-quality.sh` called by both CI and documented as isomorphic to validate:full.  
   - Keep secret-scan separate.

4. **Banlist once per validate (ARCH-P7-003)**  
   - Extract calls banlist only; drop standalone banlist from `validate`, **or** pass `SKIP_BANLIST=1` into extract when already run. Keep root `banlist` script for focused DX.

5. **Turbo hygiene (ARCH-P7-005, ARCH-P7-013)**  
   - Remove dead `lint` task or add workspace `lint` only if package-scoped Biome becomes real.  
   - Consider `turbo test:coverage` with parallel package tasks once outputs are conflict-free (`coverage/<pkg>/` already namespaced).

6. **Test the gates (ARCH-P7-008) — P2**  
   - Unit-test `licenseChecker` SPDX/OR/AND and policy load.  
   - Fixture-dir tests for banlist (temp dir with banned string → exit 1).  
   - env:check: temp schema/example drift cases if refactored to accept paths.

7. **Hook install reliability (ARCH-P7-009)**  
   - Prefer failing `prepare` on lefthook install failure in dev, or CI check that `lefthook.yml` exists + document; optional `scripts/check-hooks.sh` warn.  
   - Keep emergency `LEFTHOOK=0` documented only.

8. **Pin CI actions by SHA (ARCH-P7-010)**  
   - Match secret-scan / merge-on-green style for checkout, setup-bun, upload-artifact.

9. **Clarify EXTRACT_MODE (ARCH-P7-007)**  
   - Either make `kit` fail if product apps exist (true kit tree), keep `mono` for dual-mission monorepo, and use `strict` for release extract; or delete unused mode names.  
   - Set `EXTRACT_MODE=mono` explicitly in monorepo CI once `share-*` exists.

10. **Small cleanups (P3)**  
    - Add `packages/config` to extract required list; export vitest helper as package (see ARCH-P1-001).  
    - Align AGENTS tree `tooling/` → `scripts/` + `tools/`.  
    - Root tsconfig: either `extends` config base for tools or add `tools`/`scripts` project references.  
    - CODEOWNERS when Free allows value (or org process).

---

## Residual risks

| Risk | Likelihood | Impact | Mitigation today | Residual |
|------|------------|--------|------------------|----------|
| Developers skip pre-push (`--no-verify`) | Medium | High (CI becomes only full gate; Free minutes burn) | Doctrine + PR checklist | Soft `prepare`; no technical prevent |
| Product apps land; extract still green while kit not standalone | Medium (when P1 product starts) | High (template quality) | Banlist on packages/examples only | Structural extract only (ARCH-P7-002) |
| Product renames evade banlist patterns | Low–Med | High (axial leak) | Fixed token list | Pattern maintenance + review |
| CI/local gate drift | Low–Med | Med | Manual parity now | No shared entrypoint (ARCH-P7-004) |
| `gosilex-ci` missing / merge broken | Med (ops open) | Med (manual merge, no auto gate) | Fail-closed empty checks | App install incomplete per AGENTS |
| Force-merge without `reviewed` on Free | Med | High | Process + merge-on-green | No branch protection API |
| Pre-push wall-clock → habit bypass | Med | High | Accept cost documented | Double test run (ARCH-P7-001) |
| License UNKNOWN silent warn | Low | Low–Med | Report file | No fail on unknown |
| Action tag compromise on CI | Low | High | — | Unpinned CI actions (ARCH-P7-010) |
| Gate script regression | Low | Med | Human validate | No unit tests (ARCH-P7-008) |

---

## Inventory (absolute paths)

| Path | Role |
|------|------|
| `/home/mickael/projects/gosilex/silex-share/package.json` | Workspaces, validate composition, Bun pin |
| `/home/mickael/projects/gosilex/silex-share/turbo.jsonc` | Task graph (typecheck/test/dev/build) |
| `/home/mickael/projects/gosilex/silex-share/biome.json` | Monorepo lint/format |
| `/home/mickael/projects/gosilex/silex-share/lefthook.yml` | Local primary/secondary hooks |
| `/home/mickael/projects/gosilex/silex-share/tsconfig.json` | Orphan root TS defaults |
| `/home/mickael/projects/gosilex/silex-share/docker-compose.yml` | Mailpit local sink |
| `/home/mickael/projects/gosilex/silex-share/commitlint.config.cjs` | Conventional commits |
| `/home/mickael/projects/gosilex/silex-share/.license-policy.json` | SPDX allowlist |
| `/home/mickael/projects/gosilex/silex-share/scripts/check-banned-strings.sh` | CP-BAN |
| `/home/mickael/projects/gosilex/silex-share/scripts/extract-dry-run.sh` | CP-EXTRACT (structural) |
| `/home/mickael/projects/gosilex/silex-share/scripts/check-env-sync.ts` | CP-ENV |
| `/home/mickael/projects/gosilex/silex-share/scripts/test-coverage.sh` | Floors runner |
| `/home/mickael/projects/gosilex/silex-share/scripts/print-coverage-summary.mjs` | Coverage table |
| `/home/mickael/projects/gosilex/silex-share/tools/licenseChecker.ts` | CP-LICENSE |
| `/home/mickael/projects/gosilex/silex-share/.github/workflows/ci.yml` | Guardrail quality |
| `/home/mickael/projects/gosilex/silex-share/.github/workflows/secret-scan.yml` | TruffleHog |
| `/home/mickael/projects/gosilex/silex-share/.github/workflows/merge-on-green.yml` | Free merge gate |
| `/home/mickael/projects/gosilex/silex-share/.github/PULL_REQUEST_TEMPLATE.md` | CP checklist + validate:full |
| `/home/mickael/projects/gosilex/silex-share/docs/testing.md` | Doctrine SSoT |
| `/home/mickael/projects/gosilex/silex-share/packages/config/vitest-coverage.mjs` | Shared thresholds helper |

---

## Verdict

**Tooling/CI architecture is production-grade for a kit-stage monorepo** and **matches local-first AGENTS doctrine** better than most Free-private orgs. Dual-mission extractability is **encoded in the right place** (scripts in validate + CI), with banlist correctly scoped.

Highest-value follow-ups: **(1)** stop double-running tests on every push, **(2)** make extract claims match structural reality (or add real kit-only suite), **(3)** pin CI to one composition script and pin action SHAs. No P0 in this partition.
