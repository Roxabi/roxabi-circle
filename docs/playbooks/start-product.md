# Playbook — start a product on the kit (zero-edit)

**Audience:** eng spinning a **new** product repo that takes this kit as `upstream` (greenfield under `go-silex` or a **foreign org**).  
**SSoT contract:** [`docs/product-consumer-contract.md`](../product-consumer-contract.md)

> **Not** `silex-share` — archived / deprecated; do not use it as a live consumer target.

## Goal

Clone the kit as `upstream`, **compose** `@gosilex/*` into new product apps, keep kit paths untouched, stay green on `zero-edit` + banlist.

## Architecture default — compose the spine

**Default path:** create `apps/<product>-api` (and optional web/mcp) that **compose** platform packages. Do **not** invent a second runtime stack beside the kit.

| Do (default) | Do not (anti-patterns) |
|---|---|
| Hono app via kit patterns (`createApp` / `@gosilex/core` AppError + requestId) | Bare `ExportedHandler` dual stack next to Hono “for edge purity” |
| Import `@gosilex/auth`, `@gosilex/db`, `@gosilex/storage`, … | Copy AppError / auth / db helpers into the product app |
| New dirs only: `apps/<product>-*` | Brand or dual-edit `apps/example-*` or `packages/*` |
| Product domain + routes under the product app | Full SaaS clone of every example module on day 0 |

**Axis test (ADR-0001):** adding a second product creates `apps/<name>-*` and imports `@gosilex/*` — it does **not** copy platform stacks and does **not** add `packages/<product>-*`.

→ Full decision: [`docs/architecture/adr/0001-primary-axis-packages-compose-apps.md`](../architecture/adr/0001-primary-axis-packages-compose-apps.md)

### Opt-in multi-tenant SaaS modules

Wire **Better Auth**, org RBAC, invites, feedback FAB, etc. **only if** the product is multi-tenant SaaS and needs them. They are kit capabilities — **not** the default bootstrap for every Worker.

| Module | When to opt in |
|---|---|
| Better Auth sessions + cookies | Product has browser users |
| Org / RBAC / invites | Multi-tenant product |
| `@gosilex/feedback` | You want Signaler → Spark |
| Full example admin shells | You are building a similar SaaS shell — still **compose**, do not dual-edit `example-web` |

### Last resort: copy examples

`cp -R apps/example-*` is **not** the happy path. Prefer a thin app that imports packages and copies only the patterns you need.

If you must copy for speed:

```bash
# Last resort scaffold — new dir names only
cp -R apps/example-api apps/<product>-api
cp -R apps/example-web apps/<product>-web
```

**Strip list before first product commit** (never push renames back upstream):

| Strip / rebrand | Why |
|---|---|
| `package.json` `name` fields | Must be product-scoped |
| Wrangler `name`, D1/R2 binding ids | Must not collide with kit examples |
| Routes, seed data, demo copy | Product domain only |
| Example-only env keys you do not use | Avoid false env inventory |
| Any leftover `example-*` strings in UI | Dogfood clarity |

## 1. Create product repo

```bash
# From empty product repo (GitHub create empty first)
git clone git@github.com:<org>/<product>.git
cd <product>
git remote add upstream git@github.com:go-silex/silex-boilerplate.git
git remote set-url --push upstream no_push
git fetch upstream
git checkout -b main upstream/main   # or merge into existing main
bun install
```

## 2. Deny push kit / bounce parents (already in kit)

Lefthook pre-push runs `scripts/deny-upstream-push.sh` — **do not dual-edit** this file or `lefthook.yml`.

| Your setup | What happens |
|------------|----------------|
| **Kit** (`origin` = boilerplate) | Script is a **no-op** |
| **Product** | Blocks push to remote named **`upstream`**, any URL containing **`silex-boilerplate`**, and extended chassis substrings |

**Remotes (bounce topology):**

- **`origin`** → product (only remote you push to)
- **`upstream`** → **immediate parent only** (kit, or a private chassis in multi-hop) with `git remote set-url --push upstream no_push`
- Never `git push upstream` (even with `LEFTHOOK=0` — that bypass is process debt, not a feature)

**Multi-hop / private chassis** — extend the denylist **without** forking the kit script:

```bash
# Env (comma-separated; use a repo-unique slug, not a generic token)
export DENY_UPSTREAM_URL_SUBSTRINGS=my-private-chassis

# Or product file (safe under docs/product/):
# docs/product/deny-upstream.json
# { "urlSubstrings": ["my-private-chassis"] }
```

Full contract: [`product-consumer-contract.md` — Git remotes](../product-consumer-contract.md#git-remotes-every-product-clone).  
Proof in kit CI: `bun run test:deny-upstream` (**CP-DENY**).

**Honesty:** the hook is **client-side UX**. Real integrity = GitHub write ACLs on kit/chassis. If product `origin` still points at the kit, deny stays a no-op — fix remotes first.

## 3. Product surface (only new files)

| Add | Avoid |
|---|---|
| `apps/<product>-api/` (compose packages) | Edit `packages/*` |
| `apps/<product>-web/` | Edit `apps/example-*` for métier |
| `docs/product/*` | Patch `lefthook.yml` / root CI for métier |
| CSS tokens wrapping `@gosilex/ui` | Dual-edit permanent without exception ticket |

## 4. Config (vars, not kit patches)

| Where | What |
|---|---|
| `apps/<product>-api/.dev.vars` (gitignored) | SESSION/BA secrets, local — copy shape from example, **own** the inventory |
| GH Actions vars/secrets | CF account + merge-on-green App (next subsection) |
| Product wrangler | Separate worker names / D1 / R2 under **new** product app files |

### 4.1 CI App credentials (do this on day 0)

**SSoT:** [`docs/gosilex-ci-app-setup.md`](../gosilex-ci-app-setup.md).

On **`go-silex` Free private**, org-level Actions secrets do **not** reliably reach private repos. **Always set repo-level**:

```bash
# App ID + PEM: Vaultwarden github/gosilex/gosilex-ci · disk ~/.roxabi/secrets/gosilex-ci.private-key.pem
REPO=go-silex/<product>
APP_ID=4297393
PEM=~/.roxabi/secrets/gosilex-ci.private-key.pem

gh variable set CI_APP_ID -R "$REPO" --body "$APP_ID"
gh secret set CI_APP_PRIVATE_KEY -R "$REPO" < "$PEM"
gh variable list -R "$REPO" | grep CI_APP
gh secret list -R "$REPO" | grep CI_APP
```

| Name | Kind | Role |
|---|---|---|
| **`CI_APP_ID`** | variable | Enable flag for merge-on-green mint |
| **`CI_APP_PRIVATE_KEY`** | secret | PEM for `gosilex-ci` App |

Until set: merge-on-green is **evaluate-only** (job green + manual merge). Do **not** rename vars or edit `merge-on-green.yml` (zero-edit).

### Kit `env:check` is example-only

`bun run env:check` (in kit `validate` / `validate:full`) proves **`apps/example-api` schema ↔ `.dev.vars.example`** (and root Vite placeholders). It does **not**:

- validate your product app’s env schema
- prove CF dashboard secrets
- prove production readiness

**Product owns its env inventory** (document in product app / product-validate — not this kit gate). See [`docs/testing.md`](../testing.md) **CP-ENV**.

## 5. Foreign org — first product outside `go-silex`

Secret/var **names** are kit contract. The **GitHub App** may be org-local.

| Step | Action |
|---|---|
| 1 | Create a GitHub App on **your** org (permissions mirror [`gosilex-ci-app-setup.md`](../gosilex-ci-app-setup.md)) |
| 2 | Map App ID → org/repo **variable** named exactly **`CI_APP_ID`** |
| 3 | Map PEM → org/repo **secret** named exactly **`CI_APP_PRIVATE_KEY`** |
| 4 | Install the App on the product repo |
| 5 | Until set: merge-on-green stays **evaluate-only** (job green + “Manual merge required”) — safe, not broken |

Do **not** invent alternate names (`GOSILEX_CI_*`, `MYORG_CI_*`) unless you also fork workflows (zero-edit forbids that).  
Detail: [`docs/gosilex-ci-app-setup.md`](../gosilex-ci-app-setup.md) § Foreign org · contract: [`product-consumer-contract.md`](../product-consumer-contract.md).

## 6. Kit baseline (CI gate)

Product CI fails without a pin file:

```bash
mkdir -p docs/product
git rev-parse upstream/main | tr -d '\n' > docs/product/kit-baseline
git add docs/product/kit-baseline
# commit with first product setup; refresh after every upstream merge
```

## 7. Gates (product clone)

Two bars — do not confuse them:

| Bar | Command / workflow | What it proves |
|---|---|---|
| **Kit bar** | `bun run validate:full` (pre-push + kit CI) | Packages + `example-*` + banlist/extract/zero-edit/env:check — **not** product apps |
| **Product bar** | `product-validate` (script + product CI) | Your `apps/<product>-*` typecheck / test / build |

```bash
# --- Kit bar (always; still required on product clones) ---
bun run zero-edit          # product mode: kit zones clean vs upstream/main
bun run banlist            # no share métier strings in packages
bun run validate:full      # kit bar only (env:check still example-api only)

# --- Product bar (required once apps/<product>-* exist) ---
# 1. Copy templates (do not dual-edit kit ci.yml / test-coverage.sh):
#    docs/templates/product-validate.example.sh  → scripts/product/validate.sh
#      (or apps/<product>-api/scripts/product-validate.sh)
#    docs/templates/product-ci.example.yml       → .github/workflows/product-ci.yml
# 2. Replace <product> placeholders; run locally then in CI:
bash scripts/product/validate.sh
```

Templates (kit-owned examples only — never live under kit `.github/workflows/`):

- [`docs/templates/product-validate.example.sh`](../templates/product-validate.example.sh)
- [`docs/templates/product-ci.example.yml`](../templates/product-ci.example.yml)

`zero-edit` in **kit mode** only validates config; in a **product** clone with `upstream` remote it diffs kit zones against `upstream/main`.

**False green:** kit `validate:full` green does **not** mean product apps are typed/tested. Wire product-validate when `apps/<product>-*` exist.

## 8. Before first deploy

Code in examples is fail-closed where it matters (e.g. no `ENVIRONMENT=development` baked into shipped wrangler `[vars]`). Still check:

| Check | Rule |
|---|---|
| **ENVIRONMENT** | Never ship `ENVIRONMENT=development` (or `test`) to Cloudflare. Set prod/staging explicitly via secrets / dashboard — not committed `[vars]` for secrets. |
| **BA / session secrets** | `SESSION_SECRET` (and related) via **CF secrets**, not git |
| **CORS** | Product origins only — **not** `http://localhost:*` in staging/prod |
| **Auth** | Dual credential still: cookie session **or** Bearer `sk_` — MCP has no cookies |

## 9. Sync kit

```bash
git fetch upstream
git merge upstream/main    # resolve only if product touched kit paths (should be rare)
git rev-parse upstream/main | tr -d '\n' > docs/product/kit-baseline
# never: git push upstream
```

## 10. Checklist DoD consumer

- [ ] Architecture: product apps **compose** `@gosilex/*` (not bare dual stack; not full SaaS clone by accident)
- [ ] `upstream` remote fetch-only
- [ ] No kit path diffs intentional (or time-boxed exception in `docs/product/zero-edit-exceptions.json`)
- [ ] `docs/product/kit-baseline` pinned to last-merged kit tip
- [ ] `bun run zero-edit` green
- [ ] Kit bar: `bun run validate:full` green (still required; does **not** replace product bar)
- [ ] **Product bar (required when `apps/<product>-*` exist):** copy [`product-validate.example.sh`](../templates/product-validate.example.sh) + [`product-ci.example.yml`](../templates/product-ci.example.yml) into allowed paths (`scripts/product/` or app scripts + `.github/workflows/product-ci.yml`); replace placeholders; CI runs product-validate
- [ ] **Repo-level** CI App: `CI_APP_ID` + `CI_APP_PRIVATE_KEY` set (`gh variable/secret list -R` shows them) — Free private cannot rely on org alone
- [ ] Smoke: open a PR → Merge on Green log has non-empty `APP_ID` (mint OK) **or** accept evaluate-only + human merge
- [ ] Product env inventory owned by product (do not trust kit `env:check` for product)
- [ ] Pre-deploy checklist (§8) done for first CF deploy
- [ ] Product apps boot against product API
- [ ] Auth BA cookies + `sk_` still work when those modules are in use

## Refs

| Doc | Role |
|---|---|
| [`docs/playbooks/fork-to-first-issue.md`](./fork-to-first-issue.md) | **Full runbook** — intention produit → Spark → issue GitHub → `/dev` → first ship (post day-0) |
| [`docs/product-consumer-contract.md`](../product-consumer-contract.md) | Zero-edit contract |
| [`docs/templates/product-validate.example.sh`](../templates/product-validate.example.sh) | Copyable product bar script |
| [`docs/templates/product-ci.example.yml`](../templates/product-ci.example.yml) | Copyable product CI workflow |
| [`docs/gosilex-ci-app-setup.md`](../gosilex-ci-app-setup.md) | App install + Free private secrets |
| [`docs/testing.md`](../testing.md) | Local gates / kit vs product bar / CP-ENV |
| [`docs/architecture/adr/0001-primary-axis-packages-compose-apps.md`](../architecture/adr/0001-primary-axis-packages-compose-apps.md) | Axis packages → compose apps |
| `config/zero-edit-zones.json` | Protected kit paths |
| [`docs/staging-examples.md`](../staging-examples.md) | Staging deploy examples |
| [`docs/product-consumer-dogfood-evidence.md`](../product-consumer-dogfood-evidence.md) | Historical B5 dogfood notes (local harness: `bun run dogfood:zero-edit`) |
