# Product consumer contract — zero-edit upstream

**Goal:** a product repo that takes this kit as `upstream` must **not** modify kit-owned files in divergent ways.  
Pulling `upstream/main` should only conflict when the **product** deliberately touches shared surfaces (rare) or when kit deletes/renames something the product depended on (acceptable: fix forward).

**OK:** product breaks after pull → fix product.  
**Not OK:** product and kit both edit `lefthook.yml` / `package.json` / workflows in different directions forever.

---

## Mental model

```text
┌─────────────────────────────────────────────────────────┐
│  kit monorepo (packages · apps/example-* · CI · scripts)│
└──────────────────────▲──────────────────────────────────┘
                       │ git fetch/merge upstream only
                       │ (product never push upstream)
┌──────────────────────┴──────────────────────────────────┐
│  product repo                                           │
│  origin = product                                       │
│  ADD only: apps/<product>-* · product docs · optional   │
│            product-only workflows (new files)           │
│  DO NOT edit kit-owned paths below                      │
└─────────────────────────────────────────────────────────┘
```

**Axis:** kit = shared capability; product = new apps + config **outside** kit paths.

Which GitHub repo is kit HEAD vs mirror / which URL to set as `upstream` is **operator topology**, not this contract.  
Machine gates here only care: product does not dual-edit kit paths; `upstream` is fetch-only for products.

---

## Zones

| Zone | Owner | Product may |
|------|--------|-------------|
| `packages/*` | **kit** | **Read / import only.** No product strings. Change → PR on **boilerplate**, then pull. |
| `apps/example-*`, `apps/mcp-example` | **kit** | Leave green; do not product-brand. |
| `apps/<product>-api|web|mcp` | **product** | **Create freely** (new dirs). |
| `.github/workflows/ci.yml` · `deploy-main.yml` · `secret-scan.yml` · `merge-on-green.yml` | **kit** | **Do not edit.** Showcase CD = **Cloudflare Builds** on kit HEAD (not GH deploy). Products: own CF Builds or `product-*.yml`. |
| `.github/workflows/product-*.yml` | product | **Add** new files only (optional product CD). |
| `lefthook.yml` | **kit** | **Do not edit.** Kit already runs deny-upstream + validate:full. |
| `package.json` root scripts (validate:full, build:kit, …) | **kit** | **Do not edit.** Product scripts → `apps/<product>-*/package.json` or `scripts/product/*.sh` called from product workflow. |
| `biome.json` · `turbo.jsonc` · `tsconfig.json` · `commitlint*` | **kit** | **Do not edit** unless promoting a kit-wide change upstream first. |
| `AGENTS.md` · root `README.md` · `docs/kit/*` kit | **kit** | **Do not edit.** Product narrative → `docs/product/*` or `apps/<product>-*/README.md`. |
| `scripts/kit/` · `tooling/` · `tools/` (incl. deny-upstream, extract, banlist) | **kit** | **Do not edit.** Product helpers → `scripts/product/` only. |
| `.dev.vars` · `.env` · CF secrets | product / env | **Never commit.** Copy from `*.example`. |
| Wrangler product worker names / DB ids | product app | Only under **`apps/<product>-*/wrangler.toml`** (new file). `migrations_dir` must not resolve under `packages/` (sketches). |

---

## Kit schema vs product schema (D1)

Normative: [ADR-0008](./architecture/adr/0008-kit-schema-identity-product-compose.md) · operator: [`kit-schema-sync.md`](./kit-schema-sync.md).

`example-api` is dogfood + **applied D1 SSoT**, not a clone template. Products **compose** `@kit/*` and sync kit SQL; they do not edit kit migrations or reuse kit `NNNN_` as identity.

| | Owner | Product may |
|--|--------|-------------|
| `apps/example-api/migrations/*` | **kit** (applied SSoT) | **Read only.** Never copy-then-domain-at-0009. Never edit. |
| `config/kit/kit-schema-modules.json` | **kit** | Read only. Catalog of module `id` + source path. |
| `apps/<product>-api/migrations/*` | **product** | Local filenames (`0021_kit_rate_limit_audit.sql`, domain `1000_*`). Append via `scripts/kit/kit-schema-sync.sh` — never rewrite applied files. |
| `apps/<product>-api/kit-schema-manifest.json` | **product** | **New product file (allowed).** Records `id` + `kitSha256` (hex of kit source bytes) + `productFile`. |

Default sync: `--modules core` (0001–0008). Opt-in sets (`rbac`, `audit`, `demo`, `flows`, `tasks`) only if the product mounts those routes. Existing clones: freeze 0009–0020 domain history; `--adopt`; append `NNNN_kit_*`.

Auth glue (ADR-0008 D6): import `createBetterAuth` from `@kit/auth/factory`, tables from `@kit/auth/schema`, env helpers from `@kit/auth`. SPA forgot/reset/change-password: `@kit/auth/react` forms (app owns routes + catalogs). Do **not** copy or dual-edit `apps/example-api/src/lib/better-auth.ts` as the factory. Never import `@kit/auth/react` from a Worker.

`@kit/auth` 1.7 selects `account.issuer`. Sync and apply catalog module `better_auth_1_7_additive` **before** deploying a Worker on `@kit/auth` 1.7. Package bump first → `no such column: issuer` on sign-in, session lookup, and password reset.

---

## Configuration without forking kit files

| Need | Do this | Not this |
|------|---------|----------|
| CI auto-merge | Org/repo **vars/secrets** **`CI_APP_ID`** (var) + **`CI_APP_PRIVATE_KEY`** (secret) | Edit `merge-on-green.yml`; invent other secret names |
| Session / CORS / SMTP / CF | `apps/<product>-api/.dev.vars` + CF dashboard secrets. **`CORS_ORIGINS` required** outside `development\|test` (never `*` / `null`). Planes / `[env.staging]`: [`environments.md`](./environments.md) | Commit secrets; edit kit examples permanently; rely on localhost CORS default in staging/prod |
| Public self-serve sign-up | Set `ALLOW_PUBLIC_SIGNUP=true` on the **product** Worker in `apps/<product>-api/wrangler.toml` `[env.<name>].vars` (durable). Unset / `false` = invite + admin only. SPA `/sign-up` follows `GET /health.allowPublicSignup` (UX only — BA `disableSignUp` is the gate) | Patch `example-web`; copy kit `[env.production]` (showcase hosts + open signup); rely on `.dev.vars` for remote |
| Product Worker name / D1 / R2 | `apps/<product>-api/wrangler.toml` (**new**) · **two** planes, distinct ids ([`environments.md`](./environments.md)) | Edit `apps/example-api/wrangler.toml`; copy production `database_id` into `[env.staging]` |
| Product UI routes | `apps/<product>-web/**` | Patch `example-web` into a product |
| Product AGENTS / frame | `docs/product/AGENTS.md` or app-level AGENTS | Rewrite root `AGENTS.md` |
| Extra CI job / product CD | `.github/workflows/product-deploy.yml` (**new**) or product CF Builds on `apps/<product>-*` | Append jobs into kit `ci.yml` · never set `KIT_SHOWCASE_DEPLOY` · never run `cf:showcase:*` |
| Deny push to kit | **Already in kit** lefthook + `scripts/kit/deny-upstream-push.sh` | Copy-paste divergent lefthook in product |
| Brand / design system | **Design overrides** (below) in `apps/<product>-web` | Edit `packages/ui/**` |
| UI locales | Product `apps/<product>-web` `createI18n({ catalogs })`. **One key = no switcher** (`LocaleSwitcher` hides). Keep or drop extra catalog files accordingly | Hardcode FR/EN buttons; patch `example-web`; fork `@kit/i18n` |
| Gate “did we touch kit paths?” | `bun run zero-edit` (in `validate` / `validate:full`) | Hope merge conflicts never happen |
| Env completeness | Product owns inventory for `apps/<product>-*` | Treat kit `env:check` as product-wide (it is **example-api only**) |
| File-length god-file cap | `config/product/file_exemptions.txt` (copy [`config/kit/file_exemptions.example.txt`](../../config/kit/file_exemptions.example.txt)). Paths only under `apps/<product>-{api,web,mcp}/` with an explicit `# N lines` cap. **One commit** deletes product rows from `config/kit/file_exemptions.txt` and adds them here. product-validate must not export `QG_FILE_MAX` / `QG_FILE_EXEMPTIONS` | Edit `config/kit/file_exemptions.txt`; wildcard / cap-less / `packages/*` / `apps/example-*` lines |
| File-length / folder / import exemptions | Kit registers: `config/kit/*_exemptions.txt`. Product caps: `config/product/*_exemptions.txt` (optional). Helpers: `scripts/product/`. Never add files under `tools/` ([ADR-0011](./architecture/adr/0011-tools-fold-scripts-config-polarity.md)) | Edit `tools/*`; put product scripts in `tools/` |

---

## Foreign org — first product outside kit-hosting org

Kit workflows read fixed credential names. The **App** is org-local; the **names** are not.

| Contract name | Kind | Role |
|---|---|---|
| **`CI_APP_ID`** | Actions **variable** (non-secret) | Enable flag for merge-on-green mint |
| **`CI_APP_PRIVATE_KEY`** | Actions **secret** | PEM for App JWT → installation token |

| Do | Do not |
|---|---|
| Create/install a GitHub App on **your** org | Expect `kit-host` org secrets to appear on a foreign org |
| Map App ID/PEM to **`CI_APP_ID` / `CI_APP_PRIVATE_KEY`** | Rename to `Kit_CI_*` or `MYORG_CI_*` without forking workflows |
| Leave unset until ready — job stays **evaluate-only** (manual merge) | Edit `merge-on-green.yml` to soft-fail differently |

Setup detail: [`docs/kit/ci-app-setup.md`](./ci-app-setup.md). Bootstrap narrative: [`docs/kit/playbooks/start-product.md`](./playbooks/start-product.md).

> Historical note: kit briefly used `Kit_CI_APP_*`; canonical names are **`CI_APP_*`** only.

---

## Design overrides (accepted — no exception needed)

Customize look & feel **without** forking `@kit/ui`. Machine-readable list: `config/kit/zero-edit-zones.json` → `design_overrides`.

| Pattern | Where | How |
|---------|--------|-----|
| **CSS token override** | `apps/<product>-web/src/**/*.css` | Keep `@import "@kit/ui/styles.css"`, then redeclare tokens on `:root` / `.dark` (`--primary`, `--radius`, fonts, sidebar, charts) |
| **Compose / wrap** | `apps/<product>-web/src/components/**` | Import primitives from `@kit/ui`; build product shells (`LoadingButton`, `BrandHeader`) |
| **App Tailwind `@source`** | product CSS | `@source` kit UI + product app only |
| **Assets** | `apps/<product>-web/public/**` | Favicon, OG, logo — not in `packages/ui` |

Example product entry CSS:

```css
@import "@kit/ui/styles.css";
@import "./theme/product-tokens.css"; /* overrides only */

@source "../../../packages/ui/src/**/*.{ts,tsx}";
@source "./**/*.{ts,tsx}";
```

```css
/* theme/product-tokens.css */
:root {
  --primary: oklch(0.45 0.18 265);
  --radius: 0.75rem;
}
.dark {
  --primary: oklch(0.75 0.12 265);
}
```

**Still need a kit change?** Open a PR on **kit** (promote reusable primitives). Do not brand `packages/ui` in the product repo.

---

## Exceptions (last resort — justified + time-boxed + traceable)

When there is **no** viable design override or product path, and shipping cannot wait for an upstream PR, the product may diverge on a **specific kit path** only if registered in:

```text
config/product/zero-edit-exceptions.json   # PRODUCT repo only
```

Template (kit): [`config/kit/zero-edit-exceptions.example.json`](../../config/kit/zero-edit-exceptions.example.json).

| Field | Rule |
|-------|------|
| `path` | Exact repo-relative path of the diverged **kit** file |
| `reason` | Why the product needs this (≥10 chars) |
| `owner` | Team or person accountable |
| `expires` | `YYYY-MM-DD` — **hard fail after date** (renew or remove patch) |
| `ticket` | URL to kit issue/PR or product tracking issue |
| `alternatives_considered` | Non-empty list (must include design override / product path attempts) |
| `why_not_alternative` | Why those options fail today |
| `kit_pr` | Optional link to in-flight kit PR that will remove the need |

**Exception is not a license to drift forever.** Prefer: upstream fix → merge `upstream/main` → delete the exception entry (stale entries are warned by the checker).

```bash
bun run zero-edit
# product: compares HEAD + dirty tree to config/product/inheritance.json → upstreamCommit
# kit:     allowlisted origin, config valid only (no upstream diff)
```

Mode is auto-detected (ADR-0009): inheritance marker → product; kit-origin allowlist → kit.  
`ZERO_EDIT_MODE` is harness-only (requires `ZERO_EDIT_HARNESS_SENTINEL`). There is **no** `ZERO_EDIT_BASE_REF`.

---

## CI zero-edit base (product Actions)

GitHub Actions on a **product** repo has:

- **No `upstream` remote** (checkout only clones `origin`)
- Often a **shallow** history unless you ask for full depth

Kit `ci.yml` therefore:

1. Checks out with **`fetch-depth: 0`** (full history — inherited tip SHAs must be reachable after merge).
2. If `config/product/inheritance.json` exists, verifies `upstreamCommit` is in history, then runs `bun run validate:full`.
3. Kit / mirror origins (allowlist in `config/kit/zero-edit-zones.json`) run kit-mode zero-edit (no marker).

### Product file: `config/product/inheritance.json`

```json
{
  "version": 1,
  "upstreamCommit": "268536b3874aefd82cc795c6f1c28f445644b5af"
}
```

`upstreamCommit` = full SHA of the **immediate parent tip actually merged** (e.g. silex tip for a go-silex product — not Roxabi HEAD unless that is the parent).

After every `git merge upstream/main`:

```bash
mkdir -p config/product
printf '{\n  "version": 1,\n  "upstreamCommit": "%s"\n}\n' "$(git rev-parse upstream/main)" > config/product/inheritance.json
```

Commit the file with the merge (or immediately after). Stale marker → false dual-edit failures against an old tip.

### Local / product-validate parity

```bash
# Local and CI — same path (marker only):
bun run zero-edit
```

Do **not** dual-edit kit `ci.yml` for this — the pattern lives in the kit.  
Do **not** rely on org secrets to fetch private `upstream` solely for zero-edit when the kit tip is already in product history after merge.  
Do **not** use `upstream/main` as the zero-edit base (stale tracking refs ≠ dual-edit — #103).

---

## Git remotes (every product clone)

```bash
# <kit-parent-url> = whatever your org uses as immediate kit parent (operator-owned).
git remote add upstream <kit-parent-url>   # if missing
git remote set-url --push upstream no_push

# Never from a product clone:
# git push upstream
# LEFTHOOK=0 git push upstream
```

| Remote | Role |
|--------|------|
| **`origin`** | **Product** repo only (where you push) |
| **`upstream`** | Immediate kit parent — **fetch-only** on products |
| **`pushUrl`** | Must be `no_push` on the parent remote for products |

| Context | Behavior |
|---------|----------|
| **Kit clone** (no `config/product/inheritance.json`) | **No-op** — maintainers may push any remote |
| **Product** (marker present) | Denies remote name **`upstream`** and any URL matching the substring denylist (below) |

**Extra chassis** (optional): `deny-upstream` has no product-side brand builtins. Kit HEAD ships `config/kit/deny-upstream-remotes.json` with **only** the HEAD slug. Products inherit it and never list kit HEAD. The mirror must not edit that file (`config/kit/` is protected; a mirror patch conflicts on every HEAD inherit). The immediate parent is already denied via the remote name `upstream`. Use `docs/product/deny-upstream.json` only for an extra private chassis. Adding a remote to kit HEAD remains a topology bug.

```bash
# Runtime (session / CI / direnv) — comma-separated, trimmed; prefer repo-unique slugs
export DENY_UPSTREAM_URL_SUBSTRINGS=my-private-chassis

# Or commit product-owned config (zero-edit free path):
# docs/product/deny-upstream.json
# { "urlSubstrings": ["my-private-chassis"] }
```

Do **not** hardcode product chassis names into kit defaults. Prefer full repo slugs (not generic tokens like `api`).

**Client-side only:** this hook is UX / footgun prevention. `LEFTHOOK=0` and `git push --no-verify` still bypass it. Real kit integrity = **GitHub write ACLs** (product has no write to boilerplate / chassis). Proof: `bun run test:deny-upstream` (**CP-DENY** in [`testing.md`](./testing.md)).

**Misconfiguration:** a product without `inheritance.json` is treated as a kit clone (`deny-upstream` no-op). If origin is also not in `kit_origin_allowlist`, `zero-edit` fails closed (`cannot classify`). GitHub Fork of a kit repo is still **DENY**: PRs default to the kit parent and private/deletion stay coupled to that network ([`start-product.md`](./playbooks/start-product.md)).

## Git branches

| Repo | Branches |
|---|---|
| Kit HEAD | **`main` only.** There is no kit `staging`. Kit PRs target `main`. |
| Product | Create `staging` after start. Feature PRs land on product `staging`; promote to product `main`. Inherited kit workflows already listen on `staging\|main` — do not edit `ci.yml` to add that trigger. |

Pull kit updates from `upstream/main` into the product branch you are integrating (`staging` first).

---

## Day-1 product bootstrap (no kit file edits)

1. Create an **empty** private repo `org/<product>`. Do **not** GitHub-fork the kit. `origin` must be this product URL.
2. Inherit the **immediate parent** (Roxabi → HEAD, go-silex → mirror): rename that remote to `upstream` (fetch-only) and push `main` to product `origin`. Commit `config/product/inheritance.json` on day-0 pinning that parent tip ([`start-product.md`](./playbooks/start-product.md)).
3. `bun install` (prepare wires lefthook only if `core.hooksPath` is unset; note residual package postinstall `install -f` — see `lefthook.yml` header).
4. Copy env examples → gitignored local files only.
5. Ensure **kit-ci** (org var/secret) or accept manual merge — see [`ci-app-setup.md`](./ci-app-setup.md).
6. Add product apps under `apps/<product>-*` only.
7. When `apps/<product>-api` exists: `bash scripts/kit/kit-schema-sync.sh --app apps/<product>-api` (default `--modules core`). Last-resort clones: `--adopt` immediately. Product domain SQL starts at `1000_`.
8. Keep `bun run validate:full` green (kit bar). When `apps/<product>-*` exist, also wire product-validate / product-ci (see Product CI DoD below).

Optional product-only files (safe for upstream merge):

```text
apps/<product>-api/
apps/<product>-api/kit-schema-manifest.json  # allowed product file (kit schema manifest)
apps/<product>-web/
apps/<product>-mcp/
docs/product/                              # AGENTS, frames, product prose
config/product/inheritance.json           # upstreamCommit = last-merged parent tip (required product)
docs/product/deny-upstream.json            # extra private chassis slugs (optional; not kit HEAD)
config/product/zero-edit-exceptions.json     # last-resort dual-edit exceptions
config/product/file_exemptions.txt         # product-owned file-length caps (optional)
.github/workflows/product-*.yml
scripts/product/                           # product helpers; not required by kit
apps/<product>-web/src/theme/*.css         # design token overrides
```


### Product CI (recommended DoD when product apps exist)

Kit `ci.yml` / `validate:full` stay **kit-only** and must not fail when product apps are absent.  
**Kit bar ≠ product tested** — green `validate:full` does not typecheck/test/build `apps/<product>-*`.

When the product repo has `apps/<product>-*`, product CI is **recommended DoD** (required in the [start-product playbook](./playbooks/start-product.md) checklist):

1. **Copy** kit templates (do not dual-edit kit `ci.yml` / `test-coverage.sh` / root `package.json`):
   - [`docs/kit/templates/product-validate.example.sh`](./templates/product-validate.example.sh) → `scripts/product/validate.sh`  
     (or `apps/<product>-api/scripts/kit/product-validate.sh`)
   - [`docs/kit/templates/product-ci.example.yml`](./templates/product-ci.example.yml) → `.github/workflows/product-ci.yml`
2. Replace `<product>` placeholders with real package names.
3. Keep kit `bun run validate:full` green **and** run product-validate in product CI.

```text
.github/workflows/product-ci.yml           # product-only; never edit kit ci.yml
scripts/product/validate.sh                # preferred (zero-edit allowed)
# or: apps/<product>-api/scripts/kit/product-validate.sh
```

Typical `product-validate` shape (SSoT template is the file under `docs/kit/templates/`):

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"   # adjust if app-local path
cd "$ROOT"

bun run zero-edit
bun run --filter @kit/<product>-api typecheck
bun run --filter @kit/<product>-api test
bun run --filter @kit/<product>-web typecheck
bun run --filter @kit/<product>-web test
bun run --filter @kit/<product>-api build   # e.g. wrangler dry-run
```

Workflow job: checkout with **`fetch-depth: 0`** → setup-bun → `bun install --frozen-lockfile` → `bash scripts/product/validate.sh`
(`bun run zero-edit` reads `config/product/inheritance.json` — same path as local lefthook; see template).

Do **not** add a kit workflow that filters product package names (it would go red on bare kit clones).  
Do **not** commit live `product-*.yml` into the **kit** repo under `.github/workflows/` — only into product repos.

---

## Pulling kit upgrades

```bash
git fetch upstream
git merge upstream/main    # prefer merge commit; resolve only if product violated zones
bun run zero-edit          # must stay green (or refresh exceptions intentionally)
```

If conflict in a **kit zone** → product probably edited a forbidden path: restore kit version and move product change to a product path / design override.

If product build breaks after pull → fix product code or contribute a kit fix **in kit first**.

---

## What may still “break” (acceptable)

| Event | Response |
|-------|----------|
| Kit renames package API | Product adapts imports |
| Kit tightens banlist / extract / zero-edit | Product removes leaks or registers exception |
| Kit changes auth (Better Auth M3) | Product follows ADR + examples |
| Kit adds validate:full step | Product must stay green (no edit of script if possible; if product needs more, add **product** CI file) |
| Exception `expires` date passed | Gate red until patch removed or exception renewed with new justification |

---

## Anti-patterns (create forever-conflicts)

1. Product commits “small tweaks” to `lefthook.yml` / root `package.json` / kit workflows  
2. Product brands `example-web` instead of creating `apps/<product>-web`  
3. Product puts domain types into `packages/*` without promoting via kit PR  
4. Product edits `AGENTS.md` for product rules  
5. `git push upstream` from product (or force-with-lease to kit)  
6. Patching `packages/ui` for brand colors instead of CSS token override  
7. Open-ended exceptions without `expires` / `ticket` / alternatives considered  
8. Hand-copy `example-api/migrations` then domain SQL at 0009 (or rewrite `d1_migrations`) — [ADR-0008](./architecture/adr/0008-kit-schema-identity-product-compose.md)  

---

## Checklist — “can I pull upstream tomorrow?”

- [ ] No uncommitted product changes on kit paths  
- [ ] `git merge upstream/main` last time only touched product paths or pure kit updates  
- [ ] `config/product/inheritance.json` updated to new `upstream/main` SHA  
- [ ] Product apps don’t import from other product apps via kit packages  
- [ ] CI vars/secrets only — no forked workflow diffs  
- [ ] Deny-upstream hook active (kit lefthook; no product fork of the file)  
- [ ] If `apps/<product>-api` exists: run `bash scripts/kit/kit-schema-sync.sh --app apps/<product>-api` after merge and commit new `NNNN_kit_*` + manifest
- [ ] `@kit/auth` 1.7: module `better_auth_1_7_additive` applied before Worker deploy
- [ ] `bun run zero-edit` green (exceptions current or empty)  
- [ ] Theming via design overrides, not `packages/ui` forks  

---

## Refs

| Doc | Role |
|-----|------|
| [`AGENTS.md`](../../AGENTS.md) | Kit-only constitution + consumer DENY push |
| [`ci-app-setup.md`](./ci-app-setup.md) | CI App; new product repo CI checklist |
| [`config/kit/zero-edit-zones.json`](../../config/kit/zero-edit-zones.json) | Protected paths + design_overrides SSoT |
| [`config/kit/zero-edit-exceptions.example.json`](../../config/kit/zero-edit-exceptions.example.json) | Exception schema template |
| [`scripts/kit/check-zero-edit-zones.sh`](../../scripts/kit/check-zero-edit-zones.sh) | Gate implementation |
| [ADR-0001](./architecture/adr/0001-primary-axis-packages-compose-apps.md) | packages compose apps |
| [ADR-0008](./architecture/adr/0008-kit-schema-identity-product-compose.md) | Kit schema identity · compose, do not clone |
| [`kit-schema-sync.md`](./kit-schema-sync.md) | Product D1 sync (append-only) |
| [`environments.md`](./environments.md) | Git staging/main → Wrangler `--env` → isolated CF resources |
| [`playbooks/start-product.md`](./playbooks/start-product.md) | Day-1 greenfield product setup + dogfood |
| [`playbooks/fork-to-first-issue.md`](./playbooks/fork-to-first-issue.md) | Full runbook: brief → tracker → GH issue → `/dev` first ship |
| [`product-consumer-dogfood-evidence.md`](./product-consumer-dogfood-evidence.md) | B5 evidence (self-sim current; live product historical) |
