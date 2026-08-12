# Tech Debt / CI Hygiene — control surface

**Domain:** Tech Debt · CI Hygiene  
**Partition:** gates · workflows · lefthook · dependabot · showcase wrangler  
**Scope:** `package.json` scripts · `lefthook.yml` · `.github/workflows/*` · `scripts/trufflehog*` · `scripts/check-agents-adr-hygiene.sh` · `scripts/check-debt.ts` · `apps/example-api/wrangler.toml` · `docs/{testing,debt-tracking,deploy-cloudflare,security-dependabot}.md` · `config/zero-edit-zones.json`  
**Date:** 2026-08-12  
**Doctrine (claimed):** local `validate:full` = primary bar · CI = guardrail · secret-scan orthogonal · Free-private merge fabric via label + App token

## Summary

CI hygiene is **structurally strong and mostly honest**. The single biggest win is real parity: the GH job `validate-full` runs the **same** `bun run validate:full` as Lefthook pre-push (not a forked subset). Secret scan is deliberately dual-path (local binary vs TruffleHog action; generic `--only-verified` + kit `sk_` custom detectors) with a weekly full-history pass. Merge-on-green is a coherent Free-org substitute for branch protection.

Residual debt is **warn-theater**, **merge-fabric assumptions on Free private**, **Dependabot auto-`reviewed`**, **showcase production openness**, and a few **supply-chain / zero-edit holes**. No P0 “CI lies about security” was found: where gates are soft (`debt:check`, `agents-adr:check`), docs admit it. Where local ≠ CI (TruffleHog action flag injection), docs measure the failure mode.

## Findings

| ID | Severity | File | Finding | Evidence | Recommendation |
|----|----------|------|---------|----------|----------------|
| F1 | P1 | `.github/workflows/dependabot-automerge.yml` + `merge-on-green.yml` | **Dependabot patch/minor gets label `reviewed` without human**, then merge-on-green can land if checks green | Automerge job: `if update-type == semver-patch\|minor` → `gh pr edit --add-label reviewed` via kit-ci App. Merge gate treats `reviewed` as human sign-off. Free private has **no branch protection** (AGENTS § GitHub Free). Compromised/malicious transitive patch can auto-merge. | Keep majors human-only. For patch/minor: require a distinct label (`deps-automerge`) **or** require `reviewed` only from human actors (deny bot label as sole human signal). Document residual risk; consider CODEOWNERS on lockfile if org upgrades. |
| F2 | P1 | AGENTS § Free private + `merge-on-green.yml` | **Merge fabric is process, not enforcement** — write access bypasses label/checks | Native branch protection / required checks / auto-merge = 403 on Free private. Merge-on-green only merges when *it* runs; a collaborator can still merge a red/unlabeled PR in the UI. | Keep process discipline + PR template. When org plan allows: rulesets requiring `validate-full` + TruffleHog + non-draft. Until then, treat F1 as higher severity (bots reduce friction into the only weak door). |
| F3 | P2 | `scripts/check-debt.ts` · `docs/debt-tracking.md` · `package.json` `validate:full` | **`debt:check` defaults warn/exit 0** — green full bar does not mean debt is managed | `DEBT_UNTAGGED_MODE` / `DEBT_EXPIRY_MODE` default `warn`. Wave 0 baseline: 1 untagged biome-ignore. Docs: *“A green validate:full does not prove debt is managed until DEBT_*_MODE=fail.”* | After tree is clean: flip `DEBT_UNTAGGED_MODE=fail` in CI/local (env in ci.yml + document for operators). Keep expiry warn until pins are reviewed. |
| F4 | P2 | `scripts/check-agents-adr-hygiene.sh` · `AGENTS.md` | **`agents-adr:check` is soft theater** (exit 0; ~7 bare ADR lines) | Default `AGENTS_ADR_MODE=warn`. Bare refs include operational lines such as “ADR-0001 gagnent”, “ADR-0005 children”, “optional ADR-0006”, checklist “ADR-0005 · children #27–#36” without link. Heuristic also drops *entire* lines if any `[ADR-N](…)` appears, so mixed bare+linked can false-clean. | Link remaining bare ADRs (or point to domain docs). Fix heuristic to flag bare tokens even on lines that also have links. Optional later: `AGENTS_ADR_MODE=fail` once clean. |
| F5 | P2 | `apps/example-api/wrangler.toml` `[env.production]` | **Showcase production enables open signup** on a public host | `ALLOW_PUBLIC_SIGNUP = "true"` with `api.boilerplate.roxabi.dev`. Code default is fail-closed (`allowPublicSignup` only when env === `"true"`). Rate limit 20/IP/15m on auth paths; no captcha. Documented in `docs/deploy-cloudflare.md` §5c as intentional dogfood. | Keep flag **only** on showcase; product playbooks must default off. Prefer invite-only for any non-demo deploy. Zone WAF/Bot Fight if abuse grows; do not copy showcase vars into product wrangler templates. |
| F6 | P2 | `scripts/trufflehog-check.sh` vs `.github/workflows/secret-scan.yml` | **Local vs CI secret scan are not the same binary path** (documented but fragile on pin bumps) | Local: host `trufflehog` + `--fail`. CI action injects `--fail --no-update --github-actions`; comments forbid adding `--fail` to `extra_args` (duplicate → exit 1 before scan = fail-open-as-noise). Dual pass (verified + kit detectors) is correct and measured. | On every TruffleHog action pin bump: re-verify action.yml still injects `--fail`; smoke a fixture commit with fake `sk_`+48hex. Prefer not collapsing passes. Optional: pin local trufflehog version in docs to match CI `v3.96.0`. |
| F7 | P2 | `.github/workflows/dependabot-alert-slack.yml` + `docs/security-dependabot.md` | **CVE→Slack continuous path is largely off** | Cron poll disabled 2026-08-06. Remaining: Dependabot security PRs + `workflow_dispatch`. Alerts can sit in Security tab without Slack until a security PR opens or someone runs dispatch. | Wire GitHub App webhook `dependabot_alert` → Slack (documented “proper path”). Until then, schedule a low-frequency poll (e.g. daily) or accept dashboard-only. |
| F8 | P2 | `config/zero-edit-zones.json` | **Gate / CI surface incompletely zero-edit protected** | `tools/` not in `protected_prefixes` while `quality-gates:check` runs `tools/check_*.sh`. Workflows protected piecemeal: missing `semctx.yml`, `secret-scan-history.yml`, `close-linked-issues.yml`, `dependabot-alert-slack.yml` (cf. arch P7-P8 F2/F7). Product dual-edit could weaken gates without exception tracking. | Add `tools/` prefix; protect `.github/workflows/` minus `product-*` allowlist (or enumerate remaining kit workflows). |
| F9 | P3 | `lefthook.yml` header + `package.json` `prepare` | **Hooks install residual** — shared `core.hooksPath` can be force-written by lefthook postinstall | Documented: prepare no-ops when hooksPath set; npm postinstall still `lefthook install -f` (upstream #1475) outside `CI=true`. Operator shared hooks can be clobbered on `bun install`. | Accept + document; operators re-assert hooksPath after install, or install with `CI=true` when needed. Track upstream fix. Do not claim prepare alone protects shared hooks. |
| F10 | P3 | `merge-on-green.yml` check name regex | **Dead legacy CI name still accepted** | `hasCi` matches `/validate-full\|lint-typecheck-test/i`. Current job name is only `validate-full`. Stale alias increases rename confusion risk. | Drop `lint-typecheck-test` once no consumer still emits it (kit has none). |
| F11 | P3 | `.github/workflows/semctx.yml` | **Unpinned action tags** vs rest of kit SHA-pin policy | Uses `actions/checkout@v4`, `oven-sh/setup-bun@v2` while `ci.yml` / secret-scan pin full SHAs. Bundle itself is SHA+checksum pinned (good). | Align checkout/setup-bun to SHA pins for supply-chain parity with other workflows. |
| F12 | P3 | `package.json` · `lefthook.yml` · docs | **Naming drift: “deny-upstream” in the full bar** | Pre-push runs `deny-upstream-push.sh`. `validate:full` runs `test:deny-upstream` only (harness). No npm script named `deny-upstream`. AGENTS/`testing.md` list “deny-upstream” inside full suite wording. | Document split explicitly: push guard ≠ validate:full; self-test is CP-DENY. Avoid implying `bun run validate:full` blocks product→upstream pushes. |
| F13 | P3 | `lefthook.yml` pre-commit vs pre-push | **Asymmetric quality gates are intentional but easy to misread** | Pre-commit: Biome staged + file-length staged + trufflehog. Pre-push: deny-upstream + trufflehog + full tree `validate:full` (file-length **tree** mode via quality-gates). CI = full only (+ orthogonal secret-scan). Someone skipping hooks loses local secrets + full bar until CI. | Keep doctrine. Optional: one-line in PR template “pre-push ran / LEFTHOOK=0 reason”. |
| F14 | P3 | `apps/example-api/wrangler.toml` production vars | **Non-secret but copy-paste-hazard showcase config** | Production embeds real hostnames, D1 id, `DEMO_USER_EMAIL`, `EMAIL_FROM`, public signup. Scripts refuse without `KIT_SHOWCASE_DEPLOY=1` + branch `main` (good). Products must not reuse showcase env block. | Keep `KIT_SHOWCASE_DEPLOY` refuse. Product templates: invite-only, no showcase domain ids. Cross-link `docs/product-consumer-contract.md`. |

### Healthy / no-finding controls

| Area | Assessment | Evidence |
|------|------------|----------|
| **validate:full ↔ CI job parity** | **Strong** — same script, same steps | `ci.yml` job `name: validate-full` → `bun run validate:full`. Lefthook pre-push same. Product zero-edit base via `docs/product/kit-baseline` + `fetch-depth: 0`. |
| **`validate` vs `validate:full`** | Intentional tiering | Short `validate` = lint/typecheck/`turbo test`/banlist/majors/extract/zero-edit/env. Full replaces plain test with **coverage floors** + boundary/debt/agents/license/QG/build/smoke. Docs + lefthook comment state coverage is the unit gate. |
| **Secret dual-pass design** | Correct for kit-issued `sk_` | `--only-verified` would silently drop `sk_`; custom detector pass without that flag; clean-tree 0 FP measured in `trufflehog-detectors.yaml`. |
| **History gap closed** | Weekly full-history scan | `secret-scan-history.yml` cron Mon 04:17 UTC + dispatch; same dual pass + exclude SSoT. |
| **Exclude SSoT shared** | Local + CI strip comments from same file | `scripts/trufflehog-exclude-paths.txt` |
| **Showcase deploy refuse** | Hard gate | `api-deploy.sh` / `web-build.sh` require `KIT_SHOWCASE_DEPLOY=1` and branch `main`. GH `deploy-main.yml` retired no-op → CF Builds. |
| **Draft PR policy** | Aligned CI/semctx skip drafts; merge skips draft | `ci.yml` / `semctx.yml` `if draft == false`; merge-on-green skips draft. Secret-scan still runs on draft (early secret catch) — good. |
| **e2e out of merge bar** | Explicit local-only | `test:e2e:*` not in validate:full; Free minutes + flake documented (PR #96 / testing.md CP-E2E). |
| **Dependabot version hygiene** | Solid | Weekly + cooldown; majors split (zod/ts/fastmcp/lucide individual); actions majors grouped; security updates not delayed by cooldown (docs accurate). |
| **Action pin policy (most workflows)** | Good baseline | checkout / upload-artifact / create-github-app-token / trufflehog / semantic-pull-request pinned by SHA + version comment. |
| **kit-ci App token split** | Correct least-privilege pattern | Gate with `GITHUB_TOKEN`; merge with ephemeral App token; no PAT. Evaluate-only if `CI_APP_ID` unset. |
| **Semctx role** | Guardrail, not sole unlock | In `workflow_run` triggers so pending does not leave PR stuck; not in hasSecret/hasCi; **failed** semctx still blocks via fail-closed “any failed check” loop. |
| **PR title conventional** | Present | `pr-title.yml`; dependabot ignored for title noise. |

## Gate parity map

| Claimed gate | Local primary | CI | Inside `validate:full`? | Blocks merge-on-green? |
|--------------|---------------|-----|-------------------------|------------------------|
| lint / typecheck | pre-push full | `ci.yml` | yes | via job `validate-full` |
| banlist · zod-major · ts-major · test:ts-major | full | full | yes | yes |
| extract · zero-edit · import-boundary (+ self-tests) | full | full | yes | yes |
| deny-upstream **push** | pre-push only | n/a | **no** | n/a |
| deny-upstream **self-test** | full | full | `test:deny-upstream` | yes |
| debt:check · agents-adr | full (warn default) | full (warn) | yes but soft | soft (exit 0) |
| test:coverage floors | full | full | yes | yes |
| license · quality-gates · build:kit · smoke:mcp | full | full | yes | yes |
| trufflehog secrets | pre-commit + pre-push script | `secret-scan.yml` (diff) + weekly history | **no** (orthogonal) | yes (required name match) |
| Playwright e2e | optional local | **none** | no | no |
| semctx | local plugin optional | `semctx.yml` | no | fails block; not required to *unlock* |
| PR title | commitlint on commit-msg | `pr-title.yml` | no | fails block if check present |

## Metrics

- Files / trees reviewed: root `package.json`, `lefthook.yml`, 10 workflows under `.github/workflows/`, `dependabot.yml`, secret-scan scripts (3), agents-adr + debt scripts, `wrangler.toml` production env, `zero-edit-zones.json`, docs testing/debt/deploy/dependabot, cross-read security + arch P7-P8 audits  
- Issues: **P0=0 · P1=2 · P2=6 · P3=6**  
- `validate:full` step count (chained `&&`): **20** npm script invocations  
- Soft (exit 0) gates inside full bar: **debt:check**, **agents-adr:check** (defaults)  
- Wave 0 baseline (STRATEGY): debt warn 1 untagged · agents-adr warn 7 bare refs  
- Secret scan passes per invocation path: **2** (generic verified + kit `sk_`)  
- Dependabot ecosystems: npm + github-actions; security Slack continuous: **degraded**  
- Showcase public signup: **on** (`ALLOW_PUBLIC_SIGNUP=true`)

### Notable hotspots

1. **Merge fabric Free private** — `reviewed` label semantics + Dependabot auto-label (F1–F2).  
2. **Warn-mode gates** — debt + agents-adr look like CI surface but never fail (F3–F4).  
3. **Showcase wrangler production vars** — open signup + copy-paste hazard (F5, F14).  
4. **TruffleHog local≠action** — pin-bump discipline required (F6).  
5. **zero-edit holes on `tools/` + subset of workflows** (F8).

## Recommendations

1. **P1 — Humanize merge authority:** stop treating Dependabot-applied `reviewed` as human sign-off; split labels or require human actor for non-deps PRs; document Free-private residual.  
2. **P2 — Flip soft gates when clean:** `DEBT_UNTAGGED_MODE=fail` in CI after untagged markers cleared; link bare ADRs then optionally fail agents-adr.  
3. **P2 — Showcase isolation:** keep `ALLOW_PUBLIC_SIGNUP` showcase-only; never default true in product templates; WAF if abuse.  
4. **P2 — Secret scan pin protocol:** checklist on TruffleHog action bumps; keep dual pass; optional local version pin note.  
5. **P2 — Restore CVE signal path:** App webhook or daily poll to Slack.  
6. **P2 — Close zero-edit on gate machinery:** protect `tools/` + remaining kit workflows.  
7. **P3 hygiene batch:** drop legacy `lint-typecheck-test` regex; SHA-pin semctx actions; clarify deny-upstream naming; lefthook hooksPath residual already documented — keep honest.  
8. **Do not regress:** single `validate:full` SSoT for local+CI; orthogonal secret-scan dual pass; history weekly scan; `KIT_SHOWCASE_DEPLOY` refuse; e2e local-only; kit-ci App merge without PAT.

## Cross-links

- Wave 0 machine baseline: [`../STRATEGY.md`](../STRATEGY.md)  
- Architecture gate map (P7–P8): [`../architecture/P7-P8-web-tooling.md`](../architecture/P7-P8-web-tooling.md)  
- Showcase signup (security): [`../security/example-api.md`](../security/example-api.md) F2  
- Doctrine SSoT: [`docs/testing.md`](../../../../docs/testing.md) · [`docs/debt-tracking.md`](../../../../docs/debt-tracking.md) · [`docs/deploy-cloudflare.md`](../../../../docs/deploy-cloudflare.md) · [`docs/security-dependabot.md`](../../../../docs/security-dependabot.md)
