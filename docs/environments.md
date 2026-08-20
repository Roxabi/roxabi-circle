# Environments & deploy (local · staging · main)

**SSoT** for how this kit (and product forks) map **git branches** → **Wrangler named envs** → **Cloudflare resources**.

| Related | Role |
|---------|------|
| This page | Protocol — planes, isolation, git × CF, anti-patterns |
| [`deploy-cloudflare.md`](./deploy-cloudflare.md) | Kit **showcase** CD (Workers Builds / Pages, **`main` only** today) |
| [`staging-examples.md`](./staging-examples.md) | example-* staging **checklist** (env not provisioned yet) |
| [`email-cf-runbook.md`](./email-cf-runbook.md) | Email Sending (`cf` / allowlist) |
| [`product-consumer-contract.md`](./product-consumer-contract.md) | Product may not patch kit wrangler for its hosts |
| [ADR-0002](./architecture/adr/0002-session-hmac-interim-vs-better-auth.md) | Browser session = Better Auth cookies |
| [ADR-0004](./architecture/adr/0004-email-transport-cf-default.md) | Transport by environment |

**Status**

| Surface | Today |
|---------|--------|
| Protocol (this page) | Normative |
| Kit `apps/example-*/wrangler.toml` | Top-level = **local** · `[env.production]` = showcase · **no** `[env.staging]` |
| Kit CD (`scripts/cf-builds/*`) | Refuses any branch ≠ `main` |
| Product `apps/<product>-*` | Owns its `[env.staging]` / `[env.production]` (new files, zero-edit) |

Provisioning kit example staging is **B4** (`staging-examples.md`). Products do not wait for B4 — they add `[env.staging]` in **product** wrangler.

---

## 1. Three planes

| Plane | `ENVIRONMENT` | Git | Wrangler | Where it runs |
|-------|---------------|-----|----------|----------------|
| **local** | `development` (or `test` in Vitest) | working tree | **top-level** wrangler (no `--env`) | `wrangler dev` · `.dev.vars` · local D1/R2 |
| **staging** | `staging` | branch `staging` | `--env staging` | Named Worker + **own** D1/R2/secrets/hosts |
| **production** | `production` | branch `main` | `--env production` | Named Worker + **own** D1/R2/secrets/hosts |

`ENVIRONMENT` is the runtime switch (`useSecureCookie`, placeholder secrets, CORS fail-closed, email allowlist). It is **not** the Wrangler env name, but they must match: `[env.staging].vars.ENVIRONMENT = "staging"`.

Never ship `ENVIRONMENT=development` or `EMAIL_TRANSPORT=log` to a Cloudflare Worker.

---

## 2. Isolation (non-negotiable)

Staging is a **second Worker**, not a preview of production.

| Resource | Rule |
|----------|------|
| Worker `name` | Distinct (`<api>` vs `<api>-staging`) |
| D1 | Distinct database id — migrate each env |
| R2 | Distinct bucket |
| Secrets | Distinct `BETTER_AUTH_SECRET` (and any product secrets). `wrangler secret put --env staging` |
| Public hosts | Distinct custom domains on the **same registrable zone** as the SPA |
| Queues / Workflows / crons | Distinct names; **disable or dry-run** expensive staging crons |
| Email | Staging: `cf` or `resend` + `EMAIL_ALLOW_DOMAINS` + `[TEST STAGING]` subject ([ADR-0004](./architecture/adr/0004-email-transport-cf-default.md)) |

Same binding **names** in code (`env.DB`, `env.BUCKET`). Different Cloudflare objects behind them.

```text
[env.staging]                 [env.production]
Worker  foo-api-staging       Worker  foo-api
D1      foo-api-staging       D1      foo-api
R2      foo-api-staging       R2      foo-api
host    staging.api.example   host    api.example
```

Sharing production D1/R2 with staging **is** a prod incident.

---

## 3. Hosts, cookies, CORS

Better Auth sessions are **host-only cookies** (`HttpOnly` · `Secure` on staging/prod · `SameSite=Lax`).

| Do | Do not |
|----|--------|
| Custom domains on one registrable zone (`api.example.com` + `app.example.com`, and `staging.api…` + `staging.app…`) | `*.workers.dev` / `*.pages.dev` as the session pair |
| `workers_dev = false` and `preview_urls = false` on deployed envs | Gradual versions of the **prod** Worker as “staging” |
| `BETTER_AUTH_URL` = public API origin of **that** env | Reuse prod `BETTER_AUTH_URL` on staging |
| `CORS_ORIGINS` = explicit SPA origin(s) of **that** env (never `*` / `null`) | Rely on localhost CORS defaults in cloud |

`*.workers.dev` + `*.pages.dev` are cross-site → would need `SameSite=None`. The kit session path does not.

SPA `VITE_API_URL` is baked at **build** time. Staging web build must point at the staging API host.

---

## 4. Git × Wrangler × CD

```text
feature PR
    │
    ▼
 git staging  ──►  wrangler deploy --env staging   ──►  staging hosts
    │
    │  promote (merge commit)
    ▼
 git main     ──►  wrangler deploy --env production ──►  prod hosts
```

| Git | Wrangler `--env` | Cloudflare Builds (when wired) |
|-----|------------------|--------------------------------|
| `staging` | `staging` | Production branch **or** a second Worker project whose production branch is `staging` |
| `main` | `production` | Production branch `main` |

GitHub CI = **quality** (`validate:full`). It does **not** deploy. CD = Cloudflare Builds (preferred) or a product `product-deploy.yml`. Builds trigger on **push**; they do not wait for GitHub checks — keep red code off `staging` / `main` (lefthook + merge-on-green).

**Migrate then deploy** are two CF APIs (no transaction). Expand/contract SQL. See [`deploy-cloudflare.md`](./deploy-cloudflare.md) §5b.

### Two git models (same CF isolation)

| Model | PRs land on | When to use |
|-------|-------------|-------------|
| **staging-train** | `staging`; `/promote` → `main` | Default in `AGENTS.md` · integration env before prod |
| **trunk + staging pin** | `main`; optional `staging` fast-forwarded from `main` for CD | Product already PRs to `main`; still wants a CF sandbox |

Wrangler isolation does **not** change with the git model. Only which branch is allowed to `--env staging`.

---

## 5. Wrangler layout

```toml
# Top-level = local `wrangler dev` only. Never CF-deploy this block
# (local database_id / bucket names).
name = "<api>-local"
# [[d1_databases]] / [[r2_buckets]] / [vars]  → local

[env.staging]
name = "<api>-staging"
workers_dev = false
preview_urls = false
# routes, d1, r2, vars.ENVIRONMENT = "staging", BETTER_AUTH_URL, CORS_ORIGINS
# no (or dry) crons

[env.production]
name = "<api>"
workers_dev = false
preview_urls = false
# routes, d1, r2, vars.ENVIRONMENT = "production", …
```

Deploy:

```bash
bunx wrangler deploy --env staging      # never omit --env for cloud
bunx wrangler deploy --env production
bunx wrangler d1 migrations apply <db> --remote --env staging
bunx wrangler secret put BETTER_AUTH_SECRET --env staging
```

`wrangler deploy` with **no** `--env` targets the top-level (local) worker — refuse that in CD.

---

## 6. Product (`apps/<product>-*`)

Zero-edit: **do not** patch `apps/example-*/wrangler.toml` or `scripts/cf-builds/*` for product hosts.

1. `[env.staging]` + `[env.production]` in `apps/<product>-api/wrangler.toml` (and the SPA worker/Pages project).
2. `wrangler d1 create <product>-api-staging` · `wrangler r2 bucket create <product>-api-staging`.
3. Custom domains on the product zone (same registrable name for API + SPA).
4. Own Builds (or product deploy workflow). **Never** `KIT_SHOWCASE_DEPLOY=1`.
5. Seed staging with a **staging** recipe — not production dumps, not committed demo passwords on a public host.
6. Account / zone: `config/deploy.cf.local.toml` (gitignored). Kit does not pick the CF account.

Playbook: [`start-product.md`](./playbooks/start-product.md) · contract: [`product-consumer-contract.md`](./product-consumer-contract.md).

---

## 7. Kit showcase (dogfood)

| | |
|---|---|
| API | `[env.production]` → Worker `boilerplate-api` · `api.boilerplate.roxabi.dev` |
| SPA | Pages `boilerplate` · `boilerplate.roxabi.dev` |
| CD | [`deploy-cloudflare.md`](./deploy-cloudflare.md) · `scripts/cf-builds/*` · **`main` only** |
| Staging Worker | **Not provisioned** — do not `wrangler deploy --env staging` on example-api |

B4 = add `[env.staging]` + D1/R2 + Builds mapping for example-*. Until then, this page is still the protocol products follow.

---

## 8. Anti-patterns

| Instead | Use |
|---------|-----|
| Preview URL / `*.workers.dev` as the SPA↔API pair | Custom domains, `workers_dev = false` |
| Versions / gradual deploy of the **prod** Worker as staging | `[env.staging]` + own D1/R2 |
| Pages branch preview for a cookie session SPA | Named staging Worker (or Pages **project**) with its own API origin |
| One D1 “and we’ll be careful” | Two databases |
| `ENVIRONMENT=development` on CF to skip secrets | Real `BETTER_AUTH_SECRET` (≥32, non-placeholder) |
| Top-level `wrangler deploy` in CD | `--env staging` or `--env production` |
| Copy showcase `ALLOW_PUBLIC_SIGNUP=true` | Product default: unset / false |

---

## 9. Smoke (any staged env)

1. `GET {BETTER_AUTH_URL}/health` → 200 · `ENVIRONMENT` is not `development`
2. SPA origin in `CORS_ORIGINS` · login sets `Secure` + `HttpOnly` cookie
3. Hard-refresh a deep SPA link (assets `not_found_handling` or Pages `_redirects`)
4. Staging email (if on) → allowlisted recipient + `[TEST STAGING]`
5. Staging cron did **not** write to production D1/R2
