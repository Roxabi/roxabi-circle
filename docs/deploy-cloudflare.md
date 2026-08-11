# Runbook — Cloudflare deploy (kit showcase)

**Status:** shipping.  
**CD model:** **Cloudflare Builds** (git pull → build + deploy **on Cloudflare**).  
GitHub CI = **quality only** (`validate:full`). GH does **not** ship the showcase.

| Related | Role |
|---------|------|
| [`config/deploy.cf.example.toml`](../config/deploy.cf.example.toml) | Operator profile template (account/hosts; gitignored local copy) |
| [`scripts/cf-builds/`](../scripts/cf-builds/) | Install / migrate / deploy / SPA build scripts used by CF Builds |
| [`email-cf-runbook.md`](./email-cf-runbook.md) | Email Sending |
| [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) | CF native CI/CD |
| [Monorepos](https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/#monorepos) | Root directory + per-Worker connect |

---

## 0. Model (normative)

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

Workers Builds triggers on **push to the production branch** (`main`).  
It does **not** wait for a GH workflow. The gate is:

```text
do not merge / push broken main  →  CI green before merge (lefthook + merge-on-green + discipline)
```

On Free private without branch protection: **process** (merge-on-green + human) is the gate. Do not push red `main`.

### Success AC (showcase dogfood)

| AC | Expect |
|----|--------|
| Merge to kit `main` | GitHub CI green |
| CF Builds connected | Worker `boilerplate-api` + Pages `boilerplate` → repo `Roxabi/roxabi-boilerplate-cf` |
| After push main | CF builds succeed |
| Live API | `GET https://api.boilerplate.roxabi.dev/health` → 200 + `"environment":"production"` |
| Live SPA | `GET https://boilerplate.roxabi.dev/` → 200 |

**Non-goals:** GH `workflow_run` deploy, multi-env promotion, product repos using this showcase connect.

**Products:** own CD (`product-*.yml` or their own CF Builds). Never point product remotes at kit showcase resources. See [product-consumer-contract](./product-consumer-contract.md).

---

## 1. Principle — no default account

The kit **never** hardcodes which legal CF account is “the” account for all operators.

1. Fill `config/deploy.cf.local.toml` (`cf_account_id`, zone, hosts)  
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
printf '%s' "$(openssl rand -hex 32)" | bunx wrangler secret put SESSION_SECRET --env production
```

Domains: API custom domain on Worker; SPA custom domain on Pages (already used for showcase).

Optional **first** laptop deploy before Builds is connected:

```bash
bash scripts/cf-builds/api-deploy.sh
bash scripts/cf-builds/web-build.sh
cd apps/example-web && bunx wrangler pages deploy dist --project-name=boilerplate --branch=main
```

Afterwards: **CF Builds only**.

---

## 3. Connect Workers Builds (API)

Dashboard → **Workers & Pages** → Worker **`boilerplate-api`**  
(If missing: one laptop `bun run cf:deploy:api` creates it.)

**Settings → Builds → Connect** repository `Roxabi/roxabi-boilerplate-cf`.

**Root directory = monorepo root** (leave empty / `/`).  
Do **not** set root to `apps/example-api` (avoids `../..` path hell).

| Setting | Value |
|---------|--------|
| **Production branch** | `main` |
| **Root directory** | *(empty — repo root)* |
| **Build command** | `bun run cf:install` |
| **Deploy command** | `bun run cf:deploy:api` |
| **Non-production deploy** | disable non-prod builds, or `bunx wrangler versions upload --env production -c apps/example-api/wrangler.toml` |
| **Watch paths** (optional) | `apps/example-api/**`, `packages/**`, `scripts/cf-builds/**`, `bun.lock`, `package.json` |

`cf:install` / `cf:deploy:api` are root `package.json` scripts (install Bun if needed, workspace install, D1 migrate, `wrangler deploy --env production`).

Runtime secrets stay on the Worker (dashboard), not build vars.

Ref: [Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [monorepos](https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/#monorepos).

---

## 4. Connect Pages (SPA)

Dashboard → **Workers & Pages** → Pages project **`boilerplate`**  
→ **Settings → Builds** → connect **same** Git repo.

Again: **root = monorepo root**.

| Setting | Value |
|---------|--------|
| **Production branch** | `main` |
| **Root directory** | *(empty — repo root)* |
| **Build command** | `bun run cf:build:web` |
| **Build output directory** | `apps/example-web/dist` |
| **Build variable** | `VITE_API_URL` = `https://api.boilerplate.roxabi.dev` |
| **Watch paths** (optional) | `apps/example-web/**`, `packages/**`, `scripts/cf-builds/**`, `bun.lock` |

No separate “deploy command” on Pages — build output is published automatically.

Custom domain: `boilerplate.roxabi.dev`.

---

## 5. GitHub role (after switch)

| Keep | Drop |
|------|------|
| `.github/workflows/ci.yml` — `validate:full` | **No** GH `deploy-main` for showcase CD |
| merge-on-green / secret-scan | Repo secrets `CLOUDFLARE_*` for day-to-day CD (optional keep for break-glass laptop) |
| Lefthook pre-push quality | `DEPLOY_ENABLED` arming for GH deploy |

Break-glass laptop: still `bash scripts/cf-builds/api-deploy.sh` + web build + `pages deploy` with local CF auth.

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
| Schema errors after deploy | migrate step failed — check `api-deploy.sh` logs |
| CF deploys broken main | Merged without green CI — fix process, not CF |

---

## See also

- Operator account SSoT (outside kit)  
- [`email-cf-runbook.md`](./email-cf-runbook.md)  
- [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/)  
