# Runbook — Cloudflare deploy (kit showcase)

**Status:** shipping.  
**CD model:** **Cloudflare Builds** (git pull → build + deploy **on Cloudflare**).  
GitHub CI = **quality only** (`validate:full`). GH does **not** ship the showcase.

| Related | Role |
|---------|------|
| [`environments.md`](./environments.md) | **SSoT** git `staging`/`main` → Wrangler `--env` → CF isolation (all apps) |
| [`config/kit/deploy.cf.example.toml`](../config/kit/deploy.cf.example.toml) | Operator profile template (account/hosts; gitignored local copy) |
| [`scripts/kit/cf-builds/`](../scripts/kit/cf-builds/) | Install / migrate / deploy / SPA build scripts used by CF Builds |
| [`email-cf-runbook.md`](./email-cf-runbook.md) | Email Sending |
| [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) | CF native CI/CD |
| [Monorepos](https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/#monorepos) | Root directory + per-Worker connect |

---

## 0. Model (normative)

Generic protocol (staging **and** production, product + kit): [`environments.md`](./environments.md).

This page is the **kit showcase** instance: CD on **`main` only** until B4 adds `[env.staging]` for `example-*`.

```text
dev → PR → GitHub CI (validate:full)     # prove quality
         → merge to main only when green  # process / merge-on-green
              → push main
                   → Cloudflare Workers Builds  (API)
                   → Cloudflare Pages build     (SPA)
                        → live on *.roxabi.dev
```

| Layer | Who | What |
|-------|-----|------|
| **CI** | GitHub Actions `ci.yml` | lint, typecheck, tests, banlist, zero-edit, … — **no deploy** |
| **CD** | **Cloudflare** | clone monorepo, `bun install`, migrate D1, `wrangler deploy`, Vite build + Pages |
| **Live** | Cloudflare | Worker `boilerplate-api`, Pages `boilerplate`, D1/R2 |

**No** GitHub deploy job, **no** `kit-deploy` artifact, **no** `CLOUDFLARE_API_TOKEN` required on GH for day-to-day CD.

### “Only when CI is green”

Workers Builds / Pages trigger on **push to `main`**. They do **not** natively wait for a GitHub check.

| Want | Reality |
|------|---------|
| CF only deploys after GH CI green | **No built-in Workers Builds switch** for that |
| Practical gate | Keep red code off `main` (lefthook + merge-on-green + optional Team branch protection) |
| Optional later | External CD: GH deploys only on `workflow_run` success |

### Success AC (showcase dogfood)

| AC | Expect |
|----|--------|
| Merge to kit `main` | GitHub CI green (process) |
| CF Builds | `KIT_SHOWCASE_DEPLOY=1` · commands §3–4 · **main only** |
| Live | `/health` + SPA 200 |

### Product / fork — deploy *your* product

Showcase scripts refuse without `KIT_SHOWCASE_DEPLOY=1` and refuse non-`main`.

```text
1. apps/<product>-api + apps/<product>-web   # new paths
2. wrangler with YOUR worker / D1 / hosts    # not boilerplate-*
3. CF Builds on YOUR projects  OR  product-deploy.yml
4. Never KIT_SHOWCASE_DEPLOY=1  ·  never cf:showcase:*
```

See [product-consumer-contract](./product-consumer-contract.md).

---

## 1. Principle — no default account

The kit **never** hardcodes which legal CF account is “the” account for all operators.

1. Fill `config/kit/deploy.cf.local.toml` (`cf_account_id`, zone, hosts)  
2. Connect **Builds** on **that** account in the dashboard  
3. Showcase hosts in `wrangler.toml` `[env.production]` are the **kit dogfood** map (Mickael / `roxabi.dev`) — products use `apps/<product>-*/wrangler.toml`

---

## 2. Bootstrap once (resources + secrets)

Same as before for first-time account setup:

```bash
# Account gate
export CLOUDFLARE_ACCOUNT_ID=…   # from deploy.cf.local.toml
# token or global key for bootstrap only
bunx wrangler whoami

cd apps/example-api
bunx wrangler d1 create boilerplate-api    # if not exists — paste id into wrangler [env.production]
bunx wrangler r2 bucket create boilerplate-api
bunx wrangler queues create boilerplate-api-demo   # optional

# Runtime secrets (Worker) — once; not in git
printf '%s' "$(openssl rand -hex 32)" | bunx wrangler secret put BETTER_AUTH_SECRET --env production
# SESSION_SECRET is HMAC leftover — not required for BA sessions.
```

First production deploy creates Workflow **`boilerplate-api-flow-run`** (`[[env.production.workflows]]` name) — no separate `wrangler` create. Showcase / this Workflow must run on **Workers Paid** (Free = 10 ms CPU/step). Cloudflare **Workflows ≠ Workers for Platforms** (WfP unsupported here).

Domains: API custom domain on Worker; SPA custom domain on Pages (already used for showcase).

Optional **first** laptop deploy (showcase only):

```bash
export KIT_SHOWCASE_DEPLOY=1
# on branch main
bun run cf:showcase:deploy-api
bun run cf:showcase:build-web
cd apps/example-web && bunx wrangler pages deploy dist --project-name=boilerplate --branch=main
```

Afterwards: **CF Builds only**.

---

## 3. Connect Workers Builds (API) — kit HEAD only

Dashboard → **Workers & Pages** → Worker **`boilerplate-api`**.

| Setting | Value |
|---------|--------|
| **Production branch** | `main` only |
| **Root directory** | *(empty — repo root)* |
| **Build command** | `bun run cf:showcase:install` |
| **Deploy command** | `bun run cf:showcase:deploy-api` |
| **Build variable** | `KIT_SHOWCASE_DEPLOY` = `1` |
| **Non-production builds** | **Disabled** (required) |
| **Watch paths** (optional) | `apps/example-api/**`, `packages/**`, `scripts/kit/cf-builds/**`, `bun.lock` |

Scripts **refuse** without `KIT_SHOWCASE_DEPLOY=1` and refuse if branch ≠ `main`.

Token: include **D1 Edit** if migrate fails with auth errors.

---

## 4. Connect Pages (SPA) — kit HEAD only

| Setting | Value |
|---------|--------|
| **Production branch** | `main` only |
| **Root directory** | *(empty)* |
| **Build command** | `bun run cf:showcase:build-web` |
| **Build output directory** | `apps/example-web/dist` |
| **Build variables** | `KIT_SHOWCASE_DEPLOY=1` · `VITE_API_URL=https://api.boilerplate.roxabi.dev` |
| **Non-production / preview** | prefer **off** for showcase |

---

## 5. GitHub role

| Keep | Drop |
|------|------|
| `ci.yml` quality | GH auto-deploy showcase |
| merge-on-green | Arming product with `KIT_SHOWCASE_DEPLOY` |

---

## 5b. Migrate then deploy (not a DB+Worker transaction)

`cf:showcase:deploy-api` runs:

1. `wrangler d1 migrations apply … --remote`  
2. `wrangler deploy --env production`

These are **two Cloudflare APIs**. There is **no** cross-product transaction that rolls back the Worker if migrate fails or rolls back D1 if deploy fails.

| Failure | State | What to do |
|---------|--------|------------|
| Migrate fails | D1 unchanged, Worker old | Fix migration; retry |
| Migrate OK, deploy fails | D1 **new**, Worker **old** | Fix deploy; retry (migrations are idempotent once applied) |
| Both OK | Aligned | — |

Mitigations: **expand/contract** migrations (old code tolerates new schema); watch CF build logs; dogfood only.

---

## 5c. Public signup + rate limits

Public email sign-up is **opt-in** (`ALLOW_PUBLIC_SIGNUP=true`):

| Layer | Off (default) | On |
|---|---|---|
| Better Auth | `disableSignUp: true` | `POST /api/auth/sign-up/email` accepted |
| `GET /health` | `allowPublicSignup: false` | `true` |
| SPA | no CTA · `/sign-up` redirects to `/login` | `/sign-up` + link from `/login` |

Showcase production sets `ALLOW_PUBLIC_SIGNUP=true` (intentional dogfood). Product forks leave the var **unset or false** unless they want open registration — do not copy the showcase block.

Auth-sensitive BA paths already hit **D1 fixed-window rate limit** (e.g. **20 / IP / 15 min** on sign-in / sign-up / magic-link / reset — see `apps/example-api/src/routes/auth.ts` + `lib/rate-limit.ts`). Enough for dogfood; not a full WAF.

**Edge (no product code)** — zone `roxabi.dev` in CF dashboard:

| Control | Where | Needs app code? |
|---------|--------|-----------------|
| Security level / Browser Integrity Check | Zone → Security | No |
| Bot Fight Mode / Super Bot Fight (plan-dependent) | Zone → Security → Bots | No |
| WAF custom rate limit (e.g. `/api/auth/*`) | Zone → Security → WAF | No |
| Turnstile / interactive captcha | needs widget in login UI | **Yes** (product) |

Captcha in-app is optional for showcase; prefer zone bot/WAF if abuse grows.

---

## 6. Env matrix

| Env | Worker `ENVIRONMENT` | Email |
|-----|----------------------|--------|
| production (showcase) | `production` | `cf` — never `log` |

---

## 7. Smoke

| Check | Expect |
|-------|--------|
| `GET https://api.boilerplate.roxabi.dev/health` | 200 + `environment":"production"` |
| `GET https://boilerplate.roxabi.dev/` | 200 SPA |
| CF dashboard → Deployments | New version after push `main` |

---

## 8. Kit showcase hosts

| Role | Hostname |
|------|----------|
| Web | `https://boilerplate.roxabi.dev` |
| API | `https://api.boilerplate.roxabi.dev` |
| Pages fallback | `https://boilerplate-7xy.pages.dev` |
| API fallback | `https://boilerplate-api.mickael-b5e.workers.dev` |

Health path: **`/health`**.

---

## 9. Checklist

- [ ] Resources D1/R2/queue + Worker secrets  
- [ ] `[env.production]` in `apps/example-api/wrangler.toml`  
- [ ] Workers Builds connected on **`boilerplate-api`** (commands §3)  
- [ ] Pages build connected on **`boilerplate`** (commands §4)  
- [ ] Custom domains OK  
- [ ] Push to `main` after CI green → CF builds green  
- [ ] Smoke §7  
- [ ] GH deploy disarmed / removed  

---

## 10. Failure modes

| Symptom | Cause |
|---------|--------|
| CF build: `bun: command not found` | install script not run / PATH |
| CF build: workspace package missing | install not from monorepo root |
| Deploy name mismatch | Dashboard Worker name ≠ wrangler `--env production` name |
| SPA calls wrong API | `VITE_API_URL` build var missing |
| Schema errors after deploy | migrate failed or half-deploy — see §5b |
| `refusing deploy — KIT_SHOWCASE_DEPLOY` | Build var not set to `1` (or product wrongly using showcase scripts) |
| `refusing deploy — branch is …` | Non-main build; disable non-prod Builds |
| CF deploys broken main | Merged without green CI — process gate only (§0) |

---

## See also

- Operator account SSoT (outside kit)  
- [`email-cf-runbook.md`](./email-cf-runbook.md)  
- [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/)  
