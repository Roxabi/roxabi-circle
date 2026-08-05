# Roxabi CF template — HEAD

This repo is the **kit SSoT** (Cloudflare Chemin A monorepo).  
Downstream clones **inherit from here** via git remote `upstream`.

```
Roxabi/roxabi-cf-template     ← HEAD (origin on this clone)
        │
        ├── Roxabi/<product>              e.g. roxabi-circle
        │     origin  = product repo
        │     upstream = this template (inherit)
        │
        └── <downstream kit mirror>       other org kit clone, if any
              origin  = mirror repo
              upstream = this template
              inherit:  fetch + merge upstream
              contribute kit back:  git push upstream   (needs write ACL on HEAD)
```

No parent kit remote on this clone. Day-to-day: work here → `git push origin`.

## Remotes (this clone — HEAD)

| remote | points at | push |
|--------|-----------|------|
| `origin` | `Roxabi/roxabi-cf-template` | yes |
| `upstream` | **none** (remove if leftover from old bounce) | — |

```bash
# Drop obsolete parent remote (was pre-HEAD bounce)
git remote remove upstream 2>/dev/null || true
```

## Consumer setup (product or kit mirror)

On the **child** clone:

```bash
git remote add upstream git@github.com:Roxabi/roxabi-cf-template.git
# Default: inherit only (recommended for products)
git remote set-url --push upstream no_push
```

### Inherit (pull HEAD into consumer)

```bash
git fetch upstream
git merge upstream/main
# product: refresh baseline
git rev-parse upstream/main | tr -d '\n' > docs/product/kit-baseline
echo >> docs/product/kit-baseline
git push origin
```

### Contribute kit back to HEAD (kit mirror only)

If this child is a **kit mirror** (not a product) and you have write access on HEAD:

```bash
# allow push to HEAD
git remote set-url --push upstream git@github.com:Roxabi/roxabi-cf-template.git
# … commit kit changes on a branch …
git push upstream HEAD:main          # or PR branch on HEAD
# keep mirror origin in sync as needed
git push origin
```

Products **must not** push kit paths to HEAD for métier work — use `apps/<product>-*` only; see zero-edit contract.

## Layer rules

| Layer | Owns |
|-------|------|
| **roxabi-cf-template (HEAD)** | packages, example apps, kit CI, zero-edit zones, `docs/roxabi/*` |
| product repo | `apps/<product>-*`, `docs/product/*` only — inherit HEAD, no dual-edit kit |
| kit mirror (optional) | same tree as HEAD; inherit + occasional `push upstream` for shared kit |

## Deny push (products)

`scripts/deny-upstream-push.sh` blocks accidental push to parent remotes.  
Products: keep `upstream` push = `no_push`, or extend via `DENY_UPSTREAM_URL_SUBSTRINGS` /
`docs/product/deny-upstream.json`.  
Kit mirror with intentional `push upstream`: ensure local remotes/ACLs match the contribute flow above (hook is UX only — GH write ACL is the real gate).

## Contract & playbooks

- [`docs/product-consumer-contract.md`](../product-consumer-contract.md)
- [`docs/playbooks/start-product.md`](../playbooks/start-product.md)

## Sync cadence

1. **HEAD (this repo):** develop kit → `git push origin`
2. **Consumers:** `fetch` + `merge upstream/main` → (product: `kit-baseline`) → `push origin`
3. **Kit mirror contribute:** land shared kit on HEAD via `git push upstream` (or PR) → then re-inherit on other clones

## Local env

No kit-parent URL required on HEAD.  
Branding / demo hosts / npm scope renames = kit work in this tree (or later env in apps) — not a bounce remote.
