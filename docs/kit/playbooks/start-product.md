# Start a product from this kit

**Audience:** engineer spinning a greenfield product that takes this monorepo as git `upstream`.

## Architecture default — compose, do not clone

Kit SQL identity is **module id + hash**, not `example-api` `NNNN_` filenames. Normative: [ADR-0008](../architecture/adr/0008-kit-schema-identity-product-compose.md) · how-to: [`docs/kit/kit-schema-sync.md`](../kit-schema-sync.md).

| Do | Do not |
|----|--------|
| New `apps/<product>-api` importing `@kit/*` | `cp -R apps/example-api` as happy path |
| `bash scripts/kit/kit-schema-sync.sh --app apps/<product>-api` after creating the app | Hand-copy `example-api/migrations` and then put domain SQL at 0009 |
| Product SQL from `1000_` | Reuse kit 0009–0999 for domain |
| Import `createBetterAuth` from `@kit/auth/factory` + tables from `@kit/auth/schema` + env helpers from `@kit/auth` | Copy `example-api/src/lib/better-auth.ts` as the BA factory / `better-auth-schema.ts` · skip `corsAllowlist` and pass `trustedOrigins: ['*']` |
| Existing clone: freeze history, `--adopt` (default core); later `--modules audit` (etc.) appends `NNNN_kit_*` | Rename applied files |

**Last resort:** if you already cloned `example-api`, run `--adopt` **immediately**, then never add new domain SQL in `0001`–`0999` (frozen history stays; new domain at `1000_`).

```bash
bash scripts/kit/kit-schema-sync.sh --app apps/<product>-api --adopt
```

## Day-0 checklist

**GitHub Fork is DENY.** The Fork button leaves `origin` on a kit slug, so `deny-upstream` is a no-op and `zero-edit` stays in kit-mode. Do not use it.

1. Create an **empty** private product repo `org/<product>`. Its `origin` URL must not be a GitHub fork of an allowlisted kit (`roxabi-boilerplate-cf`, `silex-boilerplate`).
2. Inherit history without keeping the kit as `origin`:
   ```bash
   git clone <kit-parent-url> <product>
   cd <product>
   git remote rename origin upstream
   git remote add origin <product-repo-url>
   git remote set-url --push upstream no_push
   git push -u origin main
   ```
   Then pin the inherited tip and create **product** `staging`:
   ```bash
   mkdir -p config/product
   node -e "const s=require('child_process').execSync('git rev-parse upstream/main',{encoding:'utf8'}).trim(); require('fs').writeFileSync('config/product/inheritance.json', JSON.stringify({version:1,upstreamCommit:s},null,2)+'\n')"
   git add config/product/inheritance.json
   git commit -m "chore(product): pin kit inheritance"
   git branch staging
   git push -u origin staging
   ```
   The kit parent has no `staging` branch. `origin` must stay the product URL — if it still matches a kit slug, polarity gates stay in kit-mode.
3. `bun install` · ensure lefthook hooks.
4. Copy env examples → gitignored local files only (`.dev.vars`, etc.).
   Public sign-up is **off** unless you set `ALLOW_PUBLIC_SIGNUP=true` (then SPA `/sign-up` appears). Leave unset for invite/admin-only.
   `CORS_ORIGINS` is required outside `development|test` (never `*` / `null`; localhost default is local-only).
5. Configure CI App vars/secrets on the **product** repo if you want merge-on-green (`CI_APP_ID` / `CI_APP_PRIVATE_KEY`) — see [`docs/kit/ci-app-setup.md`](../ci-app-setup.md).
6. Add product apps only under `apps/<product>-*`.
7. When `apps/<product>-api` exists: `bash scripts/kit/kit-schema-sync.sh --app apps/<product>-api` (default `--modules core`). Last-resort clones: `--adopt` immediately (fail-closed if copied bytes drifted). Do not hand-copy `apps/example-api/migrations`. Product domain SQL starts at `1000_`.
8. Auth: `createBetterAuth` from `@kit/auth/factory` (per-request factory, magic-link + reset EmailPort, optional `onFirstSession`). Env helpers (`getBetterAuthSecret`, `assertBetterAuthConfigured`, `allowPublicSignup`) from `@kit/auth`. Tables: `@kit/auth/schema`. SPA forgot/reset/change-password forms from `@kit/auth/react` (app owns routes, chrome, catalogs). See `example-api/src/lib/better-auth.ts` only as a **thin Env adapter**, not the factory. Never import `@kit/auth/react` from a Worker.
9. Keep `bun run validate:full` green (kit bar). Wire product-validate when product apps exist ([`docs/kit/templates/`](../templates/)).
10. Cloudflare: copy `config/kit/deploy.cf.example.toml` → `config/kit/deploy.cf.local.toml` (gitignored), fill **account id** + zone/hosts. Planes / `[env.staging]` / `[env.production]` / cookies: [`docs/kit/environments.md`](../environments.md). Showcase CD commands (kit HEAD only): [`docs/kit/deploy-cloudflare.md`](../deploy-cloudflare.md). Account is never assumed by the kit.
11. UI locales: `apps/<product>-web` `createI18n({ defaultLocale, catalogs })`. **Catalog keys are the locale policy.** One locale → `LocaleSwitcher` is hidden (no FR/EN chrome). Kit `example-web` dogs FR+EN; do not patch it.

## Contract

- Zero-edit + remotes: [`docs/kit/product-consumer-contract.md`](../product-consumer-contract.md)
- Org map / which URL is kit parent: **operator SSoT** (outside this repo)
- CF account / zone for deploy: **local** `deploy.cf.local.toml` (not kit defaults)

## Never

- Use the GitHub **Fork** button on this repo
- Leave `origin` pointing at a kit slug
- Edit kit-owned paths for product config
- `git push upstream` from a product clone
- Commit secrets
- Point wrangler `migrations_dir` at `packages/*/migrations` (sketches; applied SSoT is `apps/<api>/migrations`)
