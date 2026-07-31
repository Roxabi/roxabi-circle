# Playbook — start a product on the kit (zero-edit)

**Audience:** GOSILEX eng spinning a **new** `go-silex/<product>` (greenfield dogfood).  
**SSoT contract:** [`docs/product-consumer-contract.md`](../product-consumer-contract.md)

> **Not** `silex-share` — archived / deprecated; do not use it as a live consumer target.

## Goal

Clone the kit as `upstream`, add **only** product apps, keep kit paths untouched, stay green on `zero-edit` + banlist.

## 1. Create product repo

```bash
# From empty product repo (GitHub create empty first)
git clone git@github.com:go-silex/<product>.git
cd <product>
git remote add upstream git@github.com:go-silex/silex-boilerplate.git
git remote set-url --push upstream no_push
git fetch upstream
git checkout -b main upstream/main   # or merge into existing main
bun install
```

## 2. Deny push kit (already in kit)

Lefthook pre-push runs `scripts/deny-upstream-push.sh` — no-op when `origin` is the boilerplate; **blocks** product → kit push.

## 3. Product surface (only new files)

| Add | Avoid |
|---|---|
| `apps/<product>-api/` | Edit `packages/*` |
| `apps/<product>-web/` | Edit `apps/example-*` |
| `docs/product/*` | Patch `lefthook.yml` / root CI for métier |
| CSS tokens wrapping `@gosilex/ui` | Dual-edit permanent without exception ticket |

Minimal smoke:

```bash
# Copy example as scaffold if needed (new dir names only)
cp -R apps/example-api apps/<product>-api
cp -R apps/example-web apps/<product>-web
# Then rebrand package.json names, wrangler names, routes — never push those renames back upstream
```

## 4. Config (vars, not kit patches)

| Where | What |
|---|---|
| `.dev.vars` (gitignored) | SESSION/BA secrets, local |
| GH Actions vars/secrets | CF account, `GOSILEX_CI_*` |
| Product wrangler | Separate worker names / D1 / R2 |

## 5. Kit baseline (CI gate)

Product CI fails without a pin file:

```bash
mkdir -p docs/product
git rev-parse upstream/main | tr -d '\n' > docs/product/kit-baseline
git add docs/product/kit-baseline
# commit with first product setup; refresh after every upstream merge
```

## 6. Gates (product clone)

```bash
bun run zero-edit          # product mode: kit zones clean vs upstream/main
bun run banlist            # no share métier strings in packages
bun run validate:full      # same bar as kit (or product filter)
# From kit: bash scripts/dogfood-zero-edit.sh /path/to/product
```

`zero-edit` in **kit mode** only validates config; in a **product** clone with `upstream` remote it diffs kit zones against `upstream/main`.

## 7. Sync kit

```bash
git fetch upstream
git merge upstream/main    # resolve only if product touched kit paths (should be rare)
git rev-parse upstream/main | tr -d '\n' > docs/product/kit-baseline
# never: git push upstream
```

## 8. Checklist DoD consumer

- [ ] `upstream` remote fetch-only
- [ ] No kit path diffs intentional (or time-boxed exception in `docs/product/zero-edit-exceptions.json`)
- [ ] `bun run zero-edit` green
- [ ] Product apps boot against product API
- [ ] Auth BA cookies + `sk_` still work (dual credential)

## Refs

- Contract: `docs/product-consumer-contract.md`
- Zero-edit zones: `config/zero-edit-zones.json`
- CI app: `docs/gosilex-ci-app-setup.md`
- Staging: `docs/staging-examples.md`
