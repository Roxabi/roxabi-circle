# B5 consumer dogfood evidence

| Field | Value |
|---|---|
| **Date** | 2026-07-31T22:04Z |
| **Product repo** | [go-silex/silex-kit-dogfood](https://github.com/go-silex/silex-kit-dogfood) |
| **Product SHA** | `1de15153b8a2616c534449e5434982e2d30fa02c` |
| **Kit baseline (upstream/main)** | `ac3afbdf01ab1889ad0ed74cb61c357a83a556d4` |
| **upstream push** | `no_push` |
| **origin** | `git@github.com:go-silex/silex-kit-dogfood.git` |

## Remotes
```
origin	git@github.com:go-silex/silex-kit-dogfood.git (fetch)
origin	git@github.com:go-silex/silex-kit-dogfood.git (push)
upstream	git@github.com:go-silex/silex-boilerplate.git (fetch)
upstream	no_push (push)
```

## dogfood-zero-edit.sh (product path)
```
== dogfood product: /home/mickael/projects/gosilex/silex-kit-dogfood ==
== check-zero-edit-zones: mode=product ==
check-zero-edit-zones: OK (product mode, base=upstream/main, diverged_covered=0)
check-banned-strings: OK
dogfood product: OK
```

## Product-local gates
```
$ bash scripts/check-zero-edit-zones.sh
== check-zero-edit-zones: mode=product ==
check-zero-edit-zones: OK (product mode, base=upstream/main, diverged_covered=0)
$ bash scripts/check-banned-strings.sh
check-banned-strings: OK
```

## Product-only commit
```
1de1515 fix(product): zero-edit-exceptions schema version 1
6aee296 feat(product): kit-baseline and dogfood app stubs for B5
 apps/dogfood-api/README.md             |  6 ++++++
 apps/dogfood-api/package.json          | 11 +++++++++++
 apps/dogfood-web/README.md             |  6 ++++++
 apps/dogfood-web/package.json          | 11 +++++++++++
 apps/dogfood-web/src/.gitkeep          |  0
 docs/product/README.md                 | 24 ++++++++++++++++++++++++
 docs/product/kit-baseline              |  1 +
 docs/product/zero-edit-exceptions.json |  5 +++++
 8 files changed, 64 insertions(+)
```

## DoD checklist

- [x] `upstream` remote fetch-only (`no_push`)
- [x] No kit path dual-edits (only `apps/dogfood-*` + `docs/product/*`)
- [x] Product `zero-edit` green (product mode vs `upstream/main`)
- [x] `banlist` green
- [x] Product app dirs present (`apps/dogfood-api` / `apps/dogfood-web` stubs)
- [x] `docs/product/kit-baseline` pin present
- [ ] Full product boot (API+web auth) — optional for path ownership proof

## Re-run

```bash
bash scripts/dogfood-zero-edit.sh ~/projects/gosilex/silex-kit-dogfood
```
