# Start a product from this kit

**Audience:** engineer spinning a greenfield product that takes this monorepo as git `upstream`.

## Day-0 checklist

1. Create a **private product repo** (empty or cloned from kit history).
2. Remotes:
   ```bash
   # origin = product
   git remote add upstream <kit parent-url>   # operator-owned URL
   git remote set-url --push upstream no_push
   ```
3. `bun install` · ensure lefthook hooks.
4. Copy env examples → gitignored local files only (`.dev.vars`, etc.).
   Public sign-up is **off** unless you set `ALLOW_PUBLIC_SIGNUP=true` (then SPA `/sign-up` appears). Leave unset for invite/admin-only.
5. Configure CI App vars/secrets on the **product** repo if you want merge-on-green (`CI_APP_ID` / `CI_APP_PRIVATE_KEY`) — see [`docs/ci-app-setup.md`](../ci-app-setup.md).
6. Add product apps only under `apps/<product>-*`.
7. Keep `bun run validate:full` green (kit bar). Wire product-validate when product apps exist ([`docs/templates/`](../templates/)).
8. Cloudflare deploy profile (when shipping): copy `config/deploy.cf.example.toml` → `config/deploy.cf.local.toml` (gitignored), fill **account id** + zone/hosts — see [`docs/deploy-cloudflare.md`](../deploy-cloudflare.md). Account is never assumed by the kit.

## Contract

- Zero-edit + remotes: [`docs/product-consumer-contract.md`](../product-consumer-contract.md)
- Org map / which URL is kit parent: **operator SSoT** (outside this repo)
- CF account / zone for deploy: **local** `deploy.cf.local.toml` (not kit defaults)

## Never

- Edit kit-owned paths for product config
- `git push upstream` from a product clone
- Commit secrets
