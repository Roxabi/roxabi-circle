---
title: "Spec — Epic B4 · Ops CI — gosilex-ci + staging examples"
issue: 16
spark: 117
status: draft
tier: ops
date: 2026-07-30
analysis: artifacts/analyses/16-epic-b4-ops-ci-staging-analysis.md
shape: B
---

# Spec #16 — B4 · Ops CI — gosilex-ci + staging examples

## Status

**draft** — analysis + ops checklist only. No implementation commit required by this document alone. Execution = org dashboard + CF console + optional tiny smoke PR + docs.

## Context

- **Issue:** [#16](https://github.com/go-silex/silex-boilerplate/issues/16) · Spark #117 · Epic B4
- **Analysis:** [`artifacts/analyses/16-epic-b4-ops-ci-staging-analysis.md`](../analyses/16-epic-b4-ops-ci-staging-analysis.md) · **Shape B** recommended
- **App setup SSoT:** [`docs/gosilex-ci-app-setup.md`](../../docs/gosilex-ci-app-setup.md)
- **Workflows:** `CI` · `Secret scan` · `Merge on Green`
- **Constraints:** GitHub Free private (`go-silex`) · **no PAT** · **no branch protection** · kit zero-edit · no product DNS

### Baseline snapshot (2026-07-30)

| Fact | Value |
|---|---|
| `GOSILEX_CI_APP_ID` | set org+repo (`4297393`) |
| `GOSILEX_CI_APP_PRIVATE_KEY` | set org+repo |
| merge-on-green | `ENABLED: true` on recent runs |
| Proven bot merge | **not yet** (humans still merge) |
| Branch `staging` | **missing** |
| Staging deploy doc | **missing** |
| Child GH #93 | **not found** — track work under #16 unless recreated |

## Goal

Prove **gosilex-ci** auto-merge on Free plan and publish a **safe, repeatable staging recette** for kit examples (`example-api` ± `example-web`) with fail-closed secrets and **never** `ENVIRONMENT=development` on remote Workers.

## Users / operators

| Persona | Need |
|---|---|
| Kit maintainer (go-silex) | Bot merges reviewed green PRs; staging dogfood without PAT |
| Product consumer | Inherit org App; never edit kit workflows; own product deploy elsewhere |
| CF operator | Clear secrets + resource checklist; no footguns |

## Expected behavior

1. After checks green + label `reviewed`, **Merge on Green** merges with a **merge commit** attributed to **`gosilex-ci[bot]`**.
2. If App cannot merge, job stays green in evaluate-only mode **or** mint fails with actionable log; epic DoD allows **blocked documented** with Summary evidence.
3. Git integration line **`staging`** exists; feature PRs target `staging`; promote `staging` → `main` via merge commit.
4. Staging Worker for examples boots with `ENVIRONMENT=staging`, strong secrets, Secure cookies, CORS to staging web origin only.
5. Operator runbook documents create resources, secret put, migrate, deploy, smoke `/health` (+ optional login).

## Out of scope

| Item | Why |
|---|---|
| Branch protection / rulesets | Free private 403 |
| Native GH auto-merge queue | Free / no-op without protection |
| Classic GitHub PAT for merge | Forbidden — App only |
| Full CD (Shape C): auto deploy on every push | Post-B4 optional |
| Product DNS / `share.gosilex.com` | Product repo |
| Editing kit workflows for product métier | Zero-edit contract |
| Better Auth M3 product OAuth live on staging | Separate epic |
| Billing / multi-tenant prod hardening beyond examples | N/A |

## Ops checklist (execution order)

### Phase 0 — Preconditions

- [ ] Org owner access `go-silex` + CF Gosilex account (`Tool@gosilex.com` / hub `load-cf-env` pattern)
- [ ] Vaultwarden entry for App PEM + staging secrets inventory
- [ ] Local kit green: `bun run validate:full` (before any smoke PR)
- [ ] Read [`docs/gosilex-ci-app-setup.md`](../../docs/gosilex-ci-app-setup.md)

### Phase 1 — GitHub App `gosilex-ci` (verify / complete)

Use setup doc §§1–3. Credentials may already exist; **do not skip smoke**.

| Step | Action | Pass criteria |
|---|---|---|
| 1.1 | App exists named `gosilex-ci` under org | App settings reachable |
| 1.2 | Permissions: Metadata R · Contents RW · PRs RW · Checks R · Actions R · Workflows RW | Matches setup doc table |
| 1.3 | Installed on `go-silex` (all repos **or** at least `silex-boilerplate`) | Install page shows repo |
| 1.4 | Org **variable** `GOSILEX_CI_APP_ID` (non-secret) | `gh api orgs/go-silex/actions/variables/GOSILEX_CI_APP_ID` |
| 1.5 | Org **secret** `GOSILEX_CI_APP_PRIVATE_KEY` (PEM) | listed; never in git |
| 1.6 | Optional repo mirror same names | present today — keep or drop intentionally |
| 1.7 | Webhook **inactive** (token mint only) | App settings |

**Forbidden:** long-lived PAT as merge token; secrets in `if:` expressions; committing PEM.

### Phase 2 — Branch model (O1)

- [ ] Create remote branch **`staging`** from current `main` (`git push origin main:staging` once)
- [ ] Team convention: feature PRs → **`staging`**; release PR/promote **`staging` → `main`** (merge commit)
- [ ] Update smoke procedure text if docs still assume only `main` (setup doc already mentions staging)
- [ ] Accept Free limitation: no ruleset to block direct `main` push — process only

### Phase 3 — Smoke PR (auto-merge proof)

Procedure (docs typo or empty commit-free docs-only change preferred):

1. Branch from `staging` (or `main` if staging not yet default base — prefer staging after Phase 2).
2. Tiny PR (e.g. docs typo in non-critical README line) · **not draft**.
3. Wait for:
   - **Secret scan** job `TruffleHog` = success
   - **CI** job `validate-full` = success
4. `gh pr edit <n> -R go-silex/silex-boilerplate --add-label reviewed`
5. Wait for **Merge on Green** re-run (label / check_suite / workflow_run).
6. **Pass:** PR merged · merge commit · actor **`gosilex-ci[bot]`** · Summary: `gosilex-ci: configured (auto-merge ON)`.
7. **Fail / blocked:** capture Summary + mint step log; file comment on #16 with root cause (install, PEM, permissions, missing check names). Do **not** human-merge the smoke PR if the goal is bot proof — open a second attempt after fix.

**Do not** use `LEFTHOOK=0` / `--no-verify` for the smoke unless documented incident.

### Phase 4 — Staging deploy recette (`example-api`)

#### 4.1 Cloudflare resources (examples only)

Naming recommendation (O6):

| Resource | Suggested name |
|---|---|
| Worker | `example-api-staging` |
| D1 | `example-api-staging` |
| R2 | `example-api-staging` |

- [ ] Create D1 + apply migrations remote (`wrangler d1 migrations apply … --remote` against staging DB name)
- [ ] Create R2 bucket
- [ ] Record `database_id` / account in operator notes (Vaultwarden / private runbook) — **not** product secrets in git if policy forbids; optional non-secret IDs in `[env.staging]` later

#### 4.2 Wrangler approach (choose one; document chosen)

| Option | Description |
|---|---|
| **B-docs** (default) | Keep committed `wrangler.toml` local-only; operator uses CLI flags / local untracked override for remote deploy |
| **B-env** (optional kit change) | Add `[env.staging]` with name + D1/R2 bindings; **no** secrets; **no** `ENVIRONMENT=development` |

Either is DoD-ok if runbook is accurate. Prefer **no** `ENVIRONMENT` in committed `[vars]` for deployable envs — set via deploy command or CF dashboard vars.

#### 4.3 Secrets & vars checklist (staging)

| Kind | Name | Rule |
|---|---|---|
| **CF secret** | `SESSION_SECRET` | `openssl rand -base64 48` · min 32 · **not** kit placeholder |
| **CF secret** | `BETTER_AUTH_SECRET` | Required **if** `AUTH_SESSION_ADAPTER=better-auth` · same strength |
| **CF var** | `ENVIRONMENT` | **`staging` only** · never `development` · never omit if relying on dashboard clarity |
| **CF var** | `CORS_ORIGINS` | Explicit staging web origin(s) · never `*` with credentials |
| **CF var** | `AUTH_SESSION_ADAPTER` | `hmac` (kit default) or `better-auth` if BA staged |
| **CF var** | `BETTER_AUTH_URL` | Public API URL if BA |
| **CF var** | `ALLOW_PUBLIC_SIGNUP` | Prefer unset/`false` on staging |
| **CF var** | `DEMO_USER_EMAIL` | Optional demo |
| **SMTP** | | Prefer **log** transport on staging (goal O7) unless Mailpit reachable |
| **Bindings** | `DB`, `BUCKET` | Staging D1/R2 only — not local names in remote |

**Anti-footgun (DoD hard rule):**

```text
FORBIDDEN on remote staging/production Workers:
  ENVIRONMENT=development
  ENVIRONMENT=test
  SESSION_SECRET=dev-session-secret-change-me-32chars!!
  (any WEAK_SESSION_SECRETS from apps/example-api/src/lib/session-env.ts)
```

Code already fail-closes weak/missing secrets outside dev|test; ops must still set correct `ENVIRONMENT`.

#### 4.4 Deploy commands (sketch — finalize in runbook)

```bash
# After CF auth (hub load-cf-env or wrangler login) — examples only
cd apps/example-api

# Secrets (interactive / piped — never commit values)
printf '%s' "$SESSION_SECRET" | wrangler secret put SESSION_SECRET --env staging
# optional BA:
# printf '%s' "$BETTER_AUTH_SECRET" | wrangler secret put BETTER_AUTH_SECRET --env staging

# Migrations remote (name per chosen wrangler env)
wrangler d1 migrations apply example-api-staging --remote

# Deploy
wrangler deploy --env staging
```

Adjust exact `--env` / database_name to match chosen Option B-docs vs B-env.

#### 4.5 Smoke after deploy

- [ ] `GET /health` (or kit health path) → 200 · `requestId` present
- [ ] Unauthenticated protected route → 401
- [ ] Optional: login cookie path if demo users seeded; cookie has **Secure** on HTTPS
- [ ] Confirm CF dashboard: `ENVIRONMENT=staging`, secrets present, no development var

### Phase 5 — Staging `example-web` (optional but recommended)

| Path | Notes |
|---|---|
| **API-only staging** | Acceptable for B4 minimum if web stays local against staging API (CORS allow local only for dogfood — weaker) |
| **Host SPA** | Cloudflare Pages or Workers static assets; set API base URL; CORS allow that origin; env banner “staging” |

DoD for epic: **API staging recette required**; web hosting **should** be documented as optional step so product teams know the pattern.

### Phase 6 — Documentation deliverables

| Doc | Action |
|---|---|
| `docs/gosilex-ci-app-setup.md` | Confirm smoke steps match reality (`staging` branch); note App already org-wide if true |
| **`docs/staging-examples.md`** (new) | Recette: resources, secrets table, deploy, smoke, footguns, promote staging→main |
| `AGENTS.md` checklist | Mark App install done **only after** bot-merge evidence; link staging doc |
| `README.md` CI/ops blurb | Link staging doc |

**Zero-edit:** product consumers do not patch these for métier; they inherit org App and write **their** staging under `apps/<product>-*`.

### Phase 7 — Evidence & close

- [ ] Comment on #16 with: smoke PR URL · bot login · staging Worker URL (if any) · doc paths
- [ ] Attach/link Summary screenshot or log quote `gosilex-ci: configured`
- [ ] If blocked: document blocker + next owner action; leave epic open
- [ ] Spark #117 status update via normal Spark→GH flow (do not dual-edit Spark fields outside process)

## Secrets / vars inventory (SSoT for operators)

### GitHub (org preferred)

| Name | Type | Purpose |
|---|---|---|
| `GOSILEX_CI_APP_ID` | variable | Enable auto-merge mint |
| `GOSILEX_CI_APP_PRIVATE_KEY` | secret | App JWT → installation token |

### Cloudflare (staging examples)

| Name | Type | Purpose |
|---|---|---|
| `SESSION_SECRET` | secret | HMAC session (and/or general kit secret path) |
| `BETTER_AUTH_SECRET` | secret | If BA adapter |
| `ENVIRONMENT` | var | `staging` |
| `CORS_ORIGINS` | var | Staging web origins |
| `AUTH_SESSION_ADAPTER` | var | `hmac` \| `better-auth` |
| `BETTER_AUTH_URL` | var | If BA |
| `ALLOW_PUBLIC_SIGNUP` | var | default off |
| D1 / R2 bindings | binding | staging resources |

### Not for B4 (defer)

| Name | When |
|---|---|
| `CLOUDFLARE_API_TOKEN` / account id as GH secrets | Shape C CD only |
| Product Resend / OAuth client secrets | Product / M3 epics |

## Smoke PR procedure (copy-paste)

```bash
# 1. Ensure staging exists
git fetch origin
git checkout main && git pull
git push origin main:staging   # once if missing

# 2. Tiny branch
git checkout staging && git pull origin staging
git checkout -b chore/b4-merge-on-green-smoke
# make minimal docs typo fix
bun run validate:full
# commit with permission · push · open PR base=staging

# 3. After CI + Secret scan green:
gh pr edit <n> -R go-silex/silex-boilerplate --add-label reviewed

# 4. Observe Merge on Green → merged by gosilex-ci[bot]
gh pr view <n> -R go-silex/silex-boilerplate --json state,mergedBy,mergeCommit
```

## Staging deploy recipe (summary)

```text
Create D1+R2 staging names
  → wrangler secret put SESSION_SECRET (+ BA if needed)
  → set ENVIRONMENT=staging + CORS_ORIGINS (vars)
  → d1 migrations apply --remote
  → wrangler deploy (staging env)
  → curl health + 401 check
  → never development / never kit placeholder secrets
```

Full command detail → `docs/staging-examples.md` (Phase 6 deliverable).

## Definition of Done

- [ ] **1 smoke PR** auto-merged by **`gosilex-ci[bot]`** **or** blocked path documented on #16 with mint/install evidence
- [ ] **`docs/staging-examples.md`** (or equivalent) published: resources, secrets checklist, deploy, smoke, footguns
- [ ] Staging Worker (if deployed) has **`ENVIRONMENT=staging`** and **no** `ENVIRONMENT=development`
- [ ] AGENTS / setup doc checklist updated to match reality (App + staging)
- [ ] Branch `staging` exists on `go-silex/silex-boilerplate`
- [ ] No PAT introduced; no secrets committed; no product DNS

## Non-goals / explicit non-DoD

- Branch protection enabled
- Every future PR bot-merged without human `reviewed` label
- CD workflow green on every push
- share product staging
- Closing Spark #117 without ops evidence

## Implementation slices (if code/docs PRs needed)

| Slice | Deliverable | Depends |
|---|---|---|
| **S0** | Ops: App verify (no PR) | — |
| **S1** | Create `staging` branch | S0 |
| **S2** | Smoke PR → bot merge | S1 |
| **S3** | CF resources + first deploy | CF access |
| **S4** | `docs/staging-examples.md` + link from AGENTS/README/setup | S3 (or doc-first with TBD IDs) |
| **S5** | Optional `[env.staging]` wrangler (no secrets) | S3 names stable |
| **S6** | Optional example-web host + CORS | S3 |

## Risks (spec-level)

See analysis R1–R11. Spec-critical:

1. Human merges smoke PR → invalidates DoD — process discipline.
2. `ENVIRONMENT=development` on Worker — checklist + peer review.
3. Free plan direct push — cannot machine-enforce.

## Open questions

1. API-only vs hosted example-web for first staging dogfood?
2. Commit `[env.staging]` database_id in kit vs private operator notes only?
3. Recreate GH child issue for Spark “#93” or keep monolithic #16?
4. Schedule Shape C CD epic later?

## Refs

| Path | Role |
|---|---|
| `docs/gosilex-ci-app-setup.md` | App install |
| `.github/workflows/merge-on-green.yml` | Auto-merge logic |
| `.github/workflows/ci.yml` | Job name `validate-full` |
| `.github/workflows/secret-scan.yml` | Job name `TruffleHog` |
| `apps/example-api/wrangler.toml` | Local bindings baseline |
| `apps/example-api/.dev.vars.example` | Local placeholders only |
| `apps/example-api/src/lib/session-env.ts` | Fail-closed secrets + Secure cookie |
| `docs/product-consumer-contract.md` | Zero-edit · product CI inherit App |
| `artifacts/goals/001-chemin-a-boilerplate-goal.md` | O1–O6 · D12 |
