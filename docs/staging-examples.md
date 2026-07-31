# Staging deploy — example-api / example-web

**Goal B4:** industrialize staging for kit examples without shipping `ENVIRONMENT=development` to the cloud.

## Preconditions

| Item | Status |
|---|---|
| GitHub App `gosilex-ci` | See [`gosilex-ci-app-setup.md`](./gosilex-ci-app-setup.md) |
| Org var `GOSILEX_CI_APP_ID` | Required for auto-merge |
| Org secret `GOSILEX_CI_APP_PRIVATE_KEY` | Required for auto-merge |
| CF account Gosilex | Workers + D1 + R2 for examples |

**Smoke:** PRs with label `reviewed` + green CI should merge via merge-on-green (bot). If the job prints *Manual merge required*, the App is not wired.

## Environment rules

| Env | `ENVIRONMENT` | Email | Notes |
|---|---|---|---|
| local | `development` | `log` or Mailpit `smtp` | `.dev.vars` |
| staging | `staging` | `cf` preferred or SMTP catcher | allowlist + `[TEST STAGING]` |
| prod | `production` | `cf` | no log transport |

**Never** set `ENVIRONMENT=development` or `EMAIL_TRANSPORT=log` on staging/prod (fail-closed).

## Secrets checklist (staging worker)

| Secret / var | Purpose |
|---|---|
| `BETTER_AUTH_SECRET` | BA signing |
| `BETTER_AUTH_URL` | Public API origin |
| `SESSION_COOKIE_NAME` | Cookie name (optional override) |
| `CORS_ORIGINS` | Explicit SPA origin(s) |
| `EMAIL_TRANSPORT` | `cf` or `smtp` |
| `EMAIL_FROM` / allowlist | Staging safety |
| Bindings | `DB`, `BUCKET`, `EMAIL` (if cf) |

Set via `wrangler secret put` on the **staging** worker, not committed wrangler prod files.

## Deploy recipe (manual / CD pull)

```bash
# From kit root, after CI green on main
source scripts/load-cf-env.sh   # if used on machine

# API
cd apps/example-api
bunx wrangler deploy --env staging   # if env defined in wrangler
# or named worker: wrangler deploy -c wrangler.jsonc

# Web assets / Pages or Workers assets
cd apps/example-web
bun run build
# deploy dist per project convention (Workers assets or Pages)
```

Document the exact `wrangler` env names in the product’s own runbook; kit keeps examples deployable but product owns prod hostnames.

## Smoke after deploy

1. `GET /api/health` → 200  
2. Login SPA with seed/demo user  
3. Create org / notes / mint key  
4. Confirm cookies `Secure` + `HttpOnly` on HTTPS  
5. Confirm no `development` in worker env dump (CF dashboard)

## Auto-merge path (kit)

```text
PR → Secret scan green → CI validate-full green → label `reviewed`
  → merge-on-green (gosilex-ci) → merge commit on main
```

Free private: no branch protection API — discipline + workflow is the gate.
