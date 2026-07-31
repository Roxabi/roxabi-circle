# Product consumer contract — zero-edit upstream

**Goal:** a product repo that takes this kit as `upstream` must **not** modify kit-owned files in divergent ways.  
Pulling `upstream/main` should only conflict when the **product** deliberately touches shared surfaces (rare) or when kit deletes/renames something the product depended on (acceptable: fix forward).

**OK:** product breaks after pull → fix product.  
**Not OK:** product and kit both edit `lefthook.yml` / `package.json` / workflows in different directions forever.

---

## Mental model

```text
┌─────────────────────────────────────────────────────────┐
│  go-silex/silex-boilerplate  (kit SSoT)                 │
│  packages/* · apps/example-* · .github/workflows/*      │
│  scripts/* · lefthook · biome · turbo · AGENTS.md       │
└──────────────────────▲──────────────────────────────────┘
                       │ git fetch/merge upstream only
                       │ (never push)
┌──────────────────────┴──────────────────────────────────┐
│  go-silex/<product>  (greenfield product repo)          │
│  origin = product                                       │
│  ADD only: apps/<product>-* · product docs · optional   │
│            product-only workflows (new files)           │
│  DO NOT edit kit-owned paths below                      │
└─────────────────────────────────────────────────────────┘
```

**Axis:** kit = shared capability; product = new apps + config **outside** kit paths.

---

## Zones

| Zone | Owner | Product may |
|------|--------|-------------|
| `packages/*` | **kit** | **Read / import only.** No product strings. Change → PR on **boilerplate**, then pull. |
| `apps/example-*`, `apps/mcp-example` | **kit** | Leave green; do not product-brand. |
| `apps/<product>-api|web|mcp` | **product** | **Create freely** (new dirs). |
| `.github/workflows/ci.yml` · `secret-scan.yml` · `merge-on-green.yml` | **kit** | **Do not edit.** Config via **GitHub vars/secrets** only. |
| `.github/workflows/product-*.yml` | product | **Add** new files only (optional). |
| `lefthook.yml` | **kit** | **Do not edit.** Kit already runs deny-upstream + validate:full. |
| `package.json` root scripts (validate:full, build:kit, …) | **kit** | **Do not edit.** Product scripts → `apps/<product>-*/package.json` or `scripts/product/*.sh` called from product workflow. |
| `biome.json` · `turbo.jsonc` · `tsconfig.json` · `commitlint*` | **kit** | **Do not edit** unless promoting a kit-wide change upstream first. |
| `AGENTS.md` · root `README.md` · `docs/*` kit | **kit** | **Do not edit.** Product narrative → `docs/product/*` or `apps/<product>-*/README.md`. |
| `scripts/deny-upstream-push.sh` · extract · banlist | **kit** | **Do not edit.** |
| `.dev.vars` · `.env` · CF secrets | product / env | **Never commit.** Copy from `*.example`. |
| Wrangler product worker names / DB ids | product app | Only under **`apps/<product>-*/wrangler.toml`** (new file). |

---

## Configuration without forking kit files

| Need | Do this | Not this |
|------|---------|----------|
| CI auto-merge | Org/repo **vars/secrets** `GOSILEX_CI_APP_*` | Edit `merge-on-green.yml` |
| Session / CORS / SMTP / CF | `apps/<product>-api/.dev.vars` + CF dashboard secrets | Commit secrets; edit kit examples permanently |
| Product Worker name / D1 / R2 | `apps/<product>-api/wrangler.toml` (**new**) | Edit `apps/example-api/wrangler.toml` |
| Product UI routes | `apps/<product>-web/**` | Patch `example-web` into a product |
| Product AGENTS / frame | `docs/product/AGENTS.md` or app-level AGENTS | Rewrite root `AGENTS.md` |
| Extra CI job | `.github/workflows/product-deploy.yml` (**new**) | Append jobs into kit `ci.yml` |
| Deny push to kit | **Already in kit** lefthook + `scripts/deny-upstream-push.sh` | Copy-paste divergent lefthook in product |
| Brand / design system | **Design overrides** (below) in `apps/<product>-web` | Edit `packages/ui/**` |
| Gate “did we touch kit paths?” | `bun run zero-edit` (in `validate` / `validate:full`) | Hope merge conflicts never happen |

---

## Design overrides (accepted — no exception needed)

Customize look & feel **without** forking `@gosilex/ui`. Machine-readable list: `config/zero-edit-zones.json` → `design_overrides`.

| Pattern | Where | How |
|---------|--------|-----|
| **CSS token override** | `apps/<product>-web/src/**/*.css` | Keep `@import "@gosilex/ui/styles.css"`, then redeclare tokens on `:root` / `.dark` (`--primary`, `--radius`, fonts, sidebar, charts) |
| **Compose / wrap** | `apps/<product>-web/src/components/**` | Import primitives from `@gosilex/ui`; build product shells (`LoadingButton`, `BrandHeader`) |
| **App Tailwind `@source`** | product CSS | `@source` kit UI + product app only |
| **Assets** | `apps/<product>-web/public/**` | Favicon, OG, logo — not in `packages/ui` |

Example product entry CSS:

```css
@import "@gosilex/ui/styles.css";
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

**Still need a kit change?** Open a PR on **silex-boilerplate** (promote reusable primitives). Do not brand `packages/ui` in the product repo.

---

## Exceptions (last resort — justified + time-boxed + traceable)

When there is **no** viable design override or product path, and shipping cannot wait for an upstream PR, the product may diverge on a **specific kit path** only if registered in:

```text
docs/product/zero-edit-exceptions.json   # PRODUCT repo only (new path → zero dual-edit)
```

Template (kit): [`config/zero-edit-exceptions.example.json`](../config/zero-edit-exceptions.example.json).

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
# product: compares HEAD + dirty tree to ZERO_EDIT_BASE_REF (default upstream/main)
# kit:     validates config only (always free to evolve protected paths)
```

Env:

| Var | Default | Role |
|-----|---------|------|
| `ZERO_EDIT_MODE` | auto (`kit` if origin URL contains `silex-boilerplate`) | Force `kit` \| `product` |
| `ZERO_EDIT_BASE_REF` | `upstream/main` | Git ref the product must match on protected paths |

---

## CI zero-edit base (product Actions)

GitHub Actions on a **product** repo has:

- **No `upstream` remote** (checkout only clones `origin`)
- Often a **shallow** history unless you ask for full depth

Kit `ci.yml` therefore:

1. Checks out with **`fetch-depth: 0`** (full history — kit tip SHAs must be reachable after merge).
2. If `github.repository` is **not** `go-silex/silex-boilerplate`:
   - requires product file **`docs/product/kit-baseline`**
   - exports `ZERO_EDIT_BASE_REF` from that file (single line = full SHA)
   - verifies the SHA exists: `git rev-parse --verify "${SHA}^{commit}"`
   - then runs `bun run validate:full`
3. Kit origin skips the block (zero-edit **kit** mode — config only).

### Product file: `docs/product/kit-baseline`

```text
# Single line: full SHA of last-merged kit tip (upstream/main after merge).
# Template (kit): docs/templates/kit-baseline.example
268536b3874aefd82cc795c6f1c28f445644b5af
```

After every `git merge upstream/main`:

```bash
git rev-parse upstream/main > docs/product/kit-baseline
# or: git rev-parse HEAD^{/merge.*upstream} — prefer the merged kit tip SHA
git rev-parse upstream/main | tr -d '\n' > docs/product/kit-baseline
echo >> docs/product/kit-baseline   # optional trailing newline is stripped by CI
```

Commit the file with the merge (or immediately after). Stale baseline → false zero-edit failures or silent drift against an old tip.

### Local / product-validate parity

```bash
# Local clone with upstream remote — default base is fine:
bun run zero-edit

# CI-like (no upstream remote):
export ZERO_EDIT_BASE_REF="$(tr -d '[:space:]' < docs/product/kit-baseline)"
bun run zero-edit

# Product scripts may fall back to kit-baseline when upstream is missing:
#   apps/<product>-api/scripts/product-validate.sh
```

Do **not** dual-edit kit `ci.yml` for this — the pattern lives in the kit.  
Do **not** rely on org secrets to fetch private `upstream` solely for zero-edit when the kit tip is already in product history after merge.

---

## Git remotes (every product clone)

```bash
git remote add upstream git@github.com:go-silex/silex-boilerplate.git   # if missing
git remote set-url --push upstream no_push

# Never:
# git push upstream
# LEFTHOOK=0 git push upstream
```

Kit pre-push runs `deny-upstream-push.sh`: on a **product** repo it blocks remote `upstream` or any URL containing `silex-boilerplate`. On the **kit** itself (origin = boilerplate) it is a no-op.

---

## Day-1 product bootstrap (no kit file edits)

1. Create private repo `go-silex/<product>` (empty or from kit history).
2. Point `origin` at product; add `upstream` fetch-only (above).
3. `bun install` · `bunx lefthook install`.
4. Copy env examples → gitignored local files only.
5. Ensure **gosilex-ci** (org var/secret) or accept manual merge — see [`gosilex-ci-app-setup.md`](./gosilex-ci-app-setup.md).
6. Add product apps under `apps/<product>-*` only.
7. Keep `bun run validate:full` green (kit gates still apply).

Optional product-only files (safe for upstream merge):

```text
apps/<product>-api/
apps/<product>-web/
apps/<product>-mcp/
docs/product/                              # AGENTS, frames, zero-edit-exceptions.json, kit-baseline
docs/product/kit-baseline                  # full SHA of last-merged kit tip (required for Actions zero-edit)
.github/workflows/product-*.yml
scripts/product/                           # product helpers; not required by kit
apps/<product>-web/src/theme/*.css         # design token overrides
```

Template for `docs/product/kit-baseline`: [`docs/templates/kit-baseline.example`](./templates/kit-baseline.example).

### Optional product CI (pattern)

Kit `ci.yml` / `validate:full` stay kit-only and must not fail when product apps are absent. Products that need extra gates **add** a new workflow file:

```text
.github/workflows/product-ci.yml           # product-only; never edit kit ci.yml
apps/<product>-api/scripts/product-validate.sh
```

Typical `product-validate.sh` shape:

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

bun run zero-edit
bun run --filter @gosilex/<product>-api typecheck
bun run --filter @gosilex/<product>-api test
bun run --filter @gosilex/<product>-web typecheck
bun run --filter @gosilex/<product>-web test
bun run --filter @gosilex/<product>-api build   # e.g. wrangler dry-run
```

Workflow job: checkout → setup-bun → `bun install --frozen-lockfile` → `bash apps/<product>-api/scripts/product-validate.sh`.  
Do **not** add a kit workflow that filters product package names (it would go red on bare kit clones).

---

## Pulling kit upgrades

```bash
git fetch upstream
git merge upstream/main    # prefer merge commit; resolve only if product violated zones
bun run zero-edit          # must stay green (or refresh exceptions intentionally)
```

If conflict in a **kit zone** → product probably edited a forbidden path: restore kit version and move product change to a product path / design override.

If product build breaks after pull → fix product code or contribute a kit fix **in silex-boilerplate first**.

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

---

## Checklist — “can I pull upstream tomorrow?”

- [ ] No uncommitted product changes on kit paths  
- [ ] `git merge upstream/main` last time only touched product paths or pure kit updates  
- [ ] `docs/product/kit-baseline` updated to new `upstream/main` SHA (Actions zero-edit)  
- [ ] Product apps don’t import from other product apps via kit packages  
- [ ] CI vars/secrets only — no forked workflow diffs  
- [ ] Deny-upstream hook active (kit lefthook; no product fork of the file)  
- [ ] `bun run zero-edit` green (exceptions current or empty)  
- [ ] Theming via design overrides, not `packages/ui` forks  

---

## Refs

| Doc | Role |
|-----|------|
| [`AGENTS.md`](../AGENTS.md) | Kit dual-mission + consumer DENY push |
| [`gosilex-ci-app-setup.md`](./gosilex-ci-app-setup.md) | CI App; new product repo CI checklist |
| [`config/zero-edit-zones.json`](../config/zero-edit-zones.json) | Protected paths + design_overrides SSoT |
| [`config/zero-edit-exceptions.example.json`](../config/zero-edit-exceptions.example.json) | Exception schema template |
| [`scripts/check-zero-edit-zones.sh`](../scripts/check-zero-edit-zones.sh) | Gate implementation |
| ADR-0001 | packages compose apps |
| [`playbooks/start-product.md`](./playbooks/start-product.md) | Day-1 greenfield product setup + dogfood |
| silex-share | **historical** split only — archived / deprecated, not a live dogfood target |
