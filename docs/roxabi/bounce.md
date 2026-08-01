# Roxabi CF bounce

```
go-silex/silex-boilerplate   (private kit SSoT)
        │  git remote upstream (fetch only)
        ▼
Roxabi/roxabi-cf-template    (this repo — private Roxabi CF chassis)
        │  git remote upstream (fetch only)
        ▼
Roxabi/<product>             (e.g. roxabi-circle)
```

## Remotes (this clone)

| remote | URL | push |
|--------|-----|------|
| `origin` | `Roxabi/roxabi-cf-template` | yes |
| `upstream` | `go-silex/silex-boilerplate` | **no** (`no_push`) |

```bash
git remote add upstream git@github.com:go-silex/silex-boilerplate.git
git remote set-url --push upstream no_push
git fetch upstream
git merge upstream/main   # then push origin
```

## Product consumers

Products set **`upstream` = this template**, not Silex.

```bash
git remote add upstream git@github.com:Roxabi/roxabi-cf-template.git
git remote set-url --push upstream no_push
```

After each merge from template:

```bash
git rev-parse upstream/main | tr -d '\n' > docs/product/kit-baseline
echo >> docs/product/kit-baseline
```

Follow kit contract: [`docs/product-consumer-contract.md`](../product-consumer-contract.md) · playbook [`docs/playbooks/start-product.md`](../playbooks/start-product.md).

## Layer rules

| Layer | Owns |
|-------|------|
| silex-boilerplate | packages, example apps, kit CI, zero-edit zones |
| **roxabi-cf-template** | org bounce only (Roxabi CI secrets, branding, docs/roxabi/*) — **no product métier** |
| product repo | `apps/<product>-*`, `docs/product/*` only |

## Sync cadence

1. Template: `fetch` + `merge upstream/main` (Silex) → `push origin`
2. Product: `fetch` + `merge upstream/main` (template) → refresh `kit-baseline` → `push origin`
