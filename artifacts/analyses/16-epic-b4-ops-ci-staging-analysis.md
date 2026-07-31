---
title: "Epic B4 · Ops CI — gosilex-ci + staging examples — technical analysis"
issue: 16
spark: 117
status: draft
date: 2026-07-30
child: "#93 referenced (not found on GH — create or retarget)"
---

# Analysis #16 — B4 · Ops CI — gosilex-ci + staging examples

## Source

| | |
|---|---|
| **GitHub** | [#16](https://github.com/go-silex/silex-boilerplate/issues/16) · Epic B4 · Spark #117 |
| **Child (issue body)** | `#93 Ops gosilex-ci + staging deploy examples` — **no GH issue #93** at analysis time (Spark-only or not created) |
| **SSoT setup** | [`docs/gosilex-ci-app-setup.md`](../../docs/gosilex-ci-app-setup.md) |
| **Workflows** | `.github/workflows/{ci,secret-scan,merge-on-green}.yml` |
| **Goal ops** | O1–O6 / D12 · [`artifacts/goals/001-chemin-a-boilerplate-goal.md`](../goals/001-chemin-a-boilerplate-goal.md) |
| **AGENTS** | § GitHub Free · merge-on-green · checklist S0 (App still unchecked) |

## Problem

| Symptom | Evidence (2026-07-30) |
|---|---|
| merge-on-green **soft-skip without App** historically → **manual merge** | Design review 2026-07-12; AGENTS checkbox still open |
| App credentials **appear installed** but **bot merge never proven** | Org+repo var `GOSILEX_CI_APP_ID=4297393`; secret `GOSILEX_CI_APP_PRIVATE_KEY` present; job Summary `ENABLED: true` — yet recent PRs (#12, #4, …) **`mergedBy: MickaelV0`**, not `gosilex-ci[bot]` |
| **No `staging` branch** | Only `main` on remote; smoke procedure docs say “PR to staging” |
| **Staging examples non industrialisés** | `wrangler.toml` = **local bindings only** (`example-api-local`); `build` = dry-run; **no** `docs/staging*.md`; **no** CF deploy GH secrets; example-web = Vite SPA only (no Pages/Workers assets config) |
| Free plan | Branch protection / rulesets / native auto-merge **unavailable** — process + merge-on-green only |

**Why it matters:** without a proven App smoke + a safe staging recette, the kit claims “ops companion” while operators still merge by hand and risk deploying with `ENVIRONMENT=development` / kit placeholders.

## Outcome (epic success)

1. **Proven** auto-merge path: Secret scan + `validate-full` green + label `reviewed` → **merge commit by `gosilex-ci[bot]`** (or **blocked documented** with evidence).
2. **Staging recette** for `example-api` (+ web if hosted): wrangler/CF resources, secrets checklist, **`ENVIRONMENT=staging` never `development`**, Secure cookies, fail-closed secrets.
3. **Docs live** (setup App smoke + staging deploy) so product consumers inherit org App without editing kit workflows.

## Appetite

**Ops track** (mostly dashboard + docs + one smoke PR). Little/no product code. Optional thin `wrangler` env stanza / runbook only.

Rough: **S–M** calendar (App verify half-day; staging CF + doc 0.5–1 d if account ready).

## Baseline (code + ops)

### GitHub / CI (live)

| Item | State |
|---|---|
| Workflows | `CI` (job name **`validate-full`**), `Secret scan` (job **`TruffleHog`**), `Merge on Green` |
| merge-on-green gates | label `reviewed` · fail-closed empty checks · require TruffleHog/Secret scan **∧** validate-full · merge method **merge** |
| Split-token | Gate: `GITHUB_TOKEN` · Merge: App mint via `actions/create-github-app-token` |
| Enable flag | **non-secret** `vars.GOSILEX_CI_APP_ID` only in `if:` (secret never in `if:`) |
| Org var/secret | `GOSILEX_CI_APP_ID` + `GOSILEX_CI_APP_PRIVATE_KEY` (visibility all) since **2026-07-14** |
| Repo var/secret | same names mirrored on `silex-boilerplate` |
| Label `reviewed` | exists |
| Recent merge-on-green run | `ENABLED: true` · mint runs · “No PRs ready to merge” when no open candidates |
| Branch `staging` | **missing** |
| Branch protection | Free private → **impossible** (out of scope) |
| Who merges | Humans still merge despite App ON |

### Deploy surface (kit)

| Item | State |
|---|---|
| `apps/example-api/wrangler.toml` | name `example-api`; D1 `example-api-local` / id placeholder; R2 `example-api-local`; **no** `[env.staging]` |
| Secrets local | `.dev.vars.example` → gitignored `.dev.vars` |
| Fail-closed | `session-env.ts`: missing/`staging`/`production` without strong `SESSION_SECRET` → throw; weak kit placeholders rejected outside dev/test; Secure cookie when **not** development\|test |
| example-web | Vite SPA; no wrangler/Pages; health banner treats `staging` as non-prod UI |
| CF GH secrets for deploy | **none** (only App private key) |
| Hub deploy helper | AGENTS cites `scripts/load-cf-env.sh` (Gosilex CF account) — **outside this repo** |

### Doc drift

| Doc | Drift |
|---|---|
| AGENTS S0 checkbox “Créer/installer App…” | Still open while vars exist → update after smoke |
| `gosilex-ci-app-setup.md` smoke | Assumes PR → **`staging`** which does not exist |
| No staging deploy runbook | Gap vs epic DoD “Doc staging à jour” |

## Shapes

### Shape A — App install verify only (smoke)

**Scope:** Confirm App install + permissions; one tiny PR; label `reviewed`; prove bot merge **or** document mint/permission failure; update AGENTS checkbox.

**Pros:** Minimal; unblocks D12/O2 claim; no CF cost.  
**Cons:** Staging recette + ENVIRONMENT footgun ops still open; epic scope half-done.  
**Rough:** S.

### Shape B — App + staging **manual recette** (docs + CF resources) — **recommended**

**Scope:** Shape A **+**

- Create git branch `staging` from `main` (integration line; O1).
- CF account (Gosilex): D1 + R2 for **examples only** (`example-api-staging` naming per O6).
- One-time remote wrangler deploy of `example-api` with **secrets via `wrangler secret put`**, vars `ENVIRONMENT=staging`, real CORS origins.
- Optional: host `example-web` (Pages or static host) pointing API; **not** product DNS `share.gosilex.com`.
- Write **`docs/staging-examples.md`** (or extend App setup): secrets checklist, deploy commands, anti-footgun, smoke health/login.
- **No** CD workflow required for DoD (manual recette is enough for B4).

**Pros:** Matches epic body; industrializes “how to stage examples”; safe secrets story; still zero-edit friendly (product deploys own apps).  
**Cons:** Needs CF operator access; example-web hosting decision.  
**Rough:** M.

### Shape C — Full CD (push `staging` → auto wrangler)

**Scope:** Shape B **+** GH Actions deploy job(s), CF API token as GH secret, migrate D1 on push, maybe Workers for Platforms later.

**Pros:** True continuous staging.  
**Cons:** Free minutes + secret surface + zero-edit pressure (products must **add** `product-deploy.yml`, not patch kit); overkill vs goal O5 (“CF staging **optional**”); blast radius if ENVIRONMENT mis-set.  
**Rough:** L. **Defer** post-B4 unless explicit follow-up.

## Fit check

| Constraint | Implication |
|---|---|
| Free private org | No branch protection; merge-on-green + discipline only |
| No PAT | App only — already the design; never reintroduce classic PAT |
| Zero-edit contract | Staging deploy config for **kit examples** may live in kit docs + optional `[env.staging]` **if** IDs non-secret; products use **new** workflows/apps only |
| Goal O5 | CF staging optional for kit exit — B4 makes it **real for examples**, not product CDN |
| Goal O1 | Need **`staging` branch** for real process; today all PR base = `main` |
| ENVIRONMENT footgun | Deploy checklist must ban `ENVIRONMENT=development` and kit placeholder secrets on remote Workers |
| Child #93 missing | Spec must either create GH child or treat epic as single execution ticket |

**Chosen for implementation:** **Shape B** (App smoke proven + staging manual recette + docs). Shape A alone fails epic DoD. Shape C out of B4 default.

## Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | **App ON but mint/install broken** (permissions, App not installed on repo, PEM rotated badly) | Smoke PR is the only proof; check Summary + merge actor `gosilex-ci[bot]` |
| R2 | **Humans merge before bot** → false sense “App unused” | Process: after `reviewed`, wait for Merge on Green; smoke must not human-merge |
| R3 | **`ENVIRONMENT=development` on public Worker** → known HMAC fallback if secret unset (dev path) | Code already fail-closed for missing secret outside dev/test **and** rejects weak placeholders; still **never** set development on remote; checklist + peer review of wrangler env |
| R4 | **SESSION_SECRET / BA secrets in git or chat** | CF secrets only; Vaultwarden inventory; TruffleHog |
| R5 | **PAT temptation** for merge/deploy | Forbidden; App for merge; CF API token only if Shape C later, scoped, not classic GH PAT |
| R6 | **No staging branch** → feature PRs land on `main` | Create `staging`; update team habit; promote staging→main merge commit |
| R7 | **example-web CORS / cookie host mismatch** | Explicit `CORS_ORIGINS` + same-site preference; Secure on staging HTTPS |
| R8 | **Free minutes / concurrent runs** | Manual deploy first; CD later |
| R9 | **Checklist AGENTS stale** | Close App checkbox only after bot-merge evidence |
| R10 | **create-github-app-token deprecation** (`app-id` → `client-id`) | Track in follow-up; not blocker if mint works |
| R11 | **Direct push to main** (no protection) | Process only; optional CODEOWNERS later; Team upgrade long-term |

## Unresolved (for ops owner, not analysis blockers)

1. Exact CF resource names / account (Gosilex) — operator fills at recette.
2. Host example-web on staging? (Workers Assets vs Pages vs “API-only staging”).
3. Prefer org-level App secrets only (drop repo mirror?) — inheritance works; mirror redundant but harmless.
4. Create GH issue for former Spark child #93 or keep work under #16 only.
5. Whether to add minimal `[env.staging]` block in kit `wrangler.toml` with **placeholders** for database_id vs pure docs-only recipe.

## Recommendation

1. Execute **Shape B**.
2. **First gate:** smoke PR proving `gosilex-ci[bot]` merge (create `staging` first if smoke targets staging).
3. **Second gate:** staging deploy recette + secrets checklist + doc; assert no `ENVIRONMENT=development` on remote.
4. **Explicitly out of B4:** branch protection (Free), product DNS, full CD Shape C, share.* deploy.
5. Proceed to **spec draft** (`artifacts/specs/16-epic-b4-ops-ci-staging-spec.md`).
