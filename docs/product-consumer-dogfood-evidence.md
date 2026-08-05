# B5 consumer dogfood evidence

| Field | Value |
|---|---|
| **Date** | 2026-08-04T09:52Z |
| **Product repo** | [go-silex/silex-kit-dogfood](https://github.com/go-silex/silex-kit-dogfood) |
| **Product SHA** | `01579e6b6e3f6473e153c4bded412b95257f58e7` |
| **Kit baseline (`docs/product/kit-baseline`)** | `50b7a4eb47521f958adf4a6ca1e73591b6fa0e4c` |
| **Kit main at verify** | `50b7a4eb47521f958adf4a6ca1e73591b6fa0e4c` |
| **upstream push** | `no_push` |
| **origin** | `git@github.com:go-silex/silex-kit-dogfood.git` |
| **Role** | **Permanent** greenfield consumer (kept) — zero-edit dogfood, not one-shot |

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

## Product-only commit (surface)
```
01579e6 feat(product): recreate dogfood consumer stubs for zero-edit
 apps/dogfood-api/README.md             |  7 +++++++
 apps/dogfood-api/package.json          | 10 ++++++++++
 apps/dogfood-web/README.md             |  7 +++++++
 apps/dogfood-web/package.json          | 10 ++++++++++
 apps/dogfood-web/src/.gitkeep          |  0
 docs/product/README.md                 | 33 +++++++++++++++++++++++++++++++++
 docs/product/kit-baseline              |  1 +
 docs/product/zero-edit-exceptions.json |  4 ++++
 8 files changed, 72 insertions(+)
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

## History

| Date | Note |
|---|---|
| 2026-07-31 | First B5 dogfood (prior clone; later deleted) |
| 2026-08-04 | Recreated private repo + stubs; harness green |
| 2026-08-04 | **Decision:** keep as permanent greenfield consumer (not archive after exit) |
