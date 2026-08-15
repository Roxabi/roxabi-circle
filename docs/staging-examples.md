# Staging deploy — example-api / example-web

**Status:** **ops runbook draft** — not B4 DoD complete. Kit `apps/example-api/wrangler.toml` has **no** `[env.staging]` yet; do not treat this doc as “staging is provisioned”.

**Canonical deploy + account gate:** [`deploy-cloudflare.md`](./deploy-cloudflare.md) + local `config/deploy.cf.local.toml` (from `config/deploy.cf.example.toml`). This page is staging-focused detail only.

**Goal B4 (when complete):** industrialize staging for kit examples without shipping `ENVIRONMENT=development` to the cloud.

## Preconditions

| Item | Status |
|---|---|
| GitHub App `kit-ci` | See [`kit-ci-app-setup.md`](./kit-ci-app-setup.md) — org-level live |
| Org var `CI_APP_ID` | Required for auto-merge |
| Org secret `CI_APP_PRIVATE_KEY` | Required for auto-merge |
| CF account Kit | Workers + D1 + R2 for examples |
| Wrangler staging env | **Not defined in kit** — add `[env.staging]` + named D1/R2 before deploy |

**Smoke (merge path):** PRs with label `reviewed` + green CI merge via merge-on-green (bot). If the job prints *Manual merge required*, the App is not wired.

## Environment rules

| Env | `ENVIRONMENT` | Email | Notes |
|---|---|---|---|
| local | `development` | Worker `log` (console). Mailpit `smtp` = Node `@kit/email/server` only — never Worker | `.dev.vars` |
| staging | `staging` | Worker `cf` preferred or `resend`. SMTP catcher = Node only (not a Worker var) | allowlist + `[TEST STAGING]` |
| prod | `production` | `cf` | no log transport |

**Never** set `ENVIRONMENT=development` or `EMAIL_TRANSPORT=log` on staging/prod (fail-closed).

## Secrets / vars checklist (staging worker)

| Secret / var | Purpose |
|---|---|
| `ENVIRONMENT=staging` | Required — never `development` |
| `BETTER_AUTH_SECRET` | BA signing |
| `BETTER_AUTH_URL` | Public API origin |
| `SESSION_SECRET` / cookie config | Session (see env schema / `.dev.vars.example`) |
| `SESSION_COOKIE_NAME` | Optional override |
| `CORS_ORIGINS` | Explicit SPA origin(s) |
| `EMAIL_TRANSPORT` | `cf` or `resend` (**not** `log`, **not** `smtp`) |
| `EMAIL_FROM` | Staging From `@example.com` |
| `EMAIL_ALLOW_DOMAINS` | Required for staging + cf/resend (ADR-0004) |
| Bindings | `DB`, `BUCKET`, `EMAIL` (if cf) |

Set via `wrangler secret put` on the **staging** worker, not committed wrangler prod files.

## Deploy recipe (manual — after env exists)

```bash
# CF credentials: hub helper (outside this repo), e.g.
#   source ~/projects/your-org/scripts/load-cf-env.sh
# Not scripts/load-cf-env.sh in the kit tree.

# 1) Add [env.staging] + D1/R2 names to apps/example-api/wrangler.toml (or product wrangler)
# 2) Then:
cd apps/example-api
bunx wrangler deploy --env staging

cd apps/example-web
bun run build
# deploy dist per project convention (Workers assets or Pages)
```

Until `[env.staging]` exists, **do not** run `wrangler deploy --env staging` — it will fail or hit the default worker.

## Smoke after deploy

1. `GET /api/health` → 200  
2. Login SPA with seed/demo user  
3. Create org / notes / mint key  
4. Confirm cookies `Secure` + `HttpOnly` on HTTPS  
5. Confirm no `development` in worker env dump (CF dashboard)

## Auto-merge path (kit)

```text
PR → Secret scan green → CI validate-full green → label `reviewed`
  → merge-on-green (kit-ci) → merge commit on main
```

Free private: no branch protection API — discipline + workflow is the gate.
