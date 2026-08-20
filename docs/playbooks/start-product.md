# Start a product from this kit

**Audience:** engineer spinning a greenfield product that takes this monorepo as git `upstream`.

## Architecture default — compose, do not clone

Kit SQL identity is **module id + hash**, not `example-api` `NNNN_` filenames. Normative: [ADR-0008](../architecture/adr/0008-kit-schema-identity-product-compose.md) · how-to: [`docs/kit-schema-sync.md`](../kit-schema-sync.md).

| Do | Do not |
|----|--------|
| New `apps/<product>-api` importing `@kit/*` | `cp -R apps/example-api` as happy path |
| `bash scripts/kit-schema-sync.sh --app apps/<product>-api` after creating the app | Hand-copy `example-api/migrations` and then put domain SQL at 0009 |
| Product SQL from `1000_` | Reuse kit 0009–0999 for domain |
| Import `createBetterAuth` from `@kit/auth/factory` + tables from `@kit/auth/schema` + env helpers from `@kit/auth` | Copy `example-api/src/lib/better-auth.ts` as the BA factory / `better-auth-schema.ts` · skip `corsAllowlist` and pass `trustedOrigins: ['*']` |
| Existing clone: freeze history, `--adopt` (default core); later `--modules audit` (etc.) appends `NNNN_kit_*` | Rename applied files |

**Last resort:** if you already cloned `example-api`, run `--adopt` **immediately**, then never add new domain SQL in `0001`–`0999` (frozen history stays; new domain at `1000_`).

```bash
bash scripts/kit-schema-sync.sh --app apps/<product>-api --adopt
```

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
   `CORS_ORIGINS` is required outside `development|test` (never `*` / `null`; localhost default is local-only).
5. Configure CI App vars/secrets on the **product** repo if you want merge-on-green (`CI_APP_ID` / `CI_APP_PRIVATE_KEY`) — see [`docs/ci-app-setup.md`](../ci-app-setup.md).
6. Add product apps only under `apps/<product>-*`.
7. When `apps/<product>-api` exists: `bash scripts/kit-schema-sync.sh --app apps/<product>-api` (default `--modules core`). Last-resort clones: `--adopt` immediately (fail-closed if copied bytes drifted). Do not hand-copy `apps/example-api/migrations`. Product domain SQL starts at `1000_`.
8. Auth: `createBetterAuth` from `@kit/auth/factory` (per-request factory, magic-link + reset EmailPort, optional `onFirstSession`). Env helpers (`getBetterAuthSecret`, `assertBetterAuthConfigured`, `allowPublicSignup`) from `@kit/auth`. Tables: `@kit/auth/schema`. See `example-api/src/lib/better-auth.ts` only as a **thin Env adapter**, not the factory.
9. Keep `bun run validate:full` green (kit bar). Wire product-validate when product apps exist ([`docs/templates/`](../templates/)).
10. Cloudflare: copy `config/deploy.cf.example.toml` → `config/deploy.cf.local.toml` (gitignored), fill **account id** + zone/hosts. Planes / `[env.staging]` / `[env.production]` / cookies: [`docs/environments.md`](../environments.md). Showcase CD commands (kit HEAD only): [`docs/deploy-cloudflare.md`](../deploy-cloudflare.md). Account is never assumed by the kit.

## Contract

- Zero-edit + remotes: [`docs/product-consumer-contract.md`](../product-consumer-contract.md)
- Org map / which URL is kit parent: **operator SSoT** (outside this repo)
- CF account / zone for deploy: **local** `deploy.cf.local.toml` (not kit defaults)

## Never

- Edit kit-owned paths for product config
- `git push upstream` from a product clone
- Commit secrets
- Point wrangler `migrations_dir` at `packages/*/migrations` (sketches; applied SSoT is `apps/<api>/migrations`)
