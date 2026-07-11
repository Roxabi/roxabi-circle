## Summary

<!-- 1–3 sentences: what and why -->

## Related Issue

Closes #<!-- number if any -->

## Type of Change

- [ ] `feat` — New feature
- [ ] `fix` — Bug fix
- [ ] `docs` — Documentation
- [ ] `refactor` — Refactor (no behaviour change)
- [ ] `test` — Tests only
- [ ] `chore` — Maintenance
- [ ] `ci` — CI / workflows
- [ ] `perf` — Performance
- [ ] `security` — Security fix / hardening

## Changes

<!-- Bullet list of concrete changes -->

-

## Security checklist (required)

See `AGENTS.md` § *Sécurité & bon usage de l’IA*.

### Secrets & config

- [ ] No secrets, tokens, or real `.dev.vars` / `.env` values in the diff
- [ ] New env vars documented in `.env.example` / `.dev.vars.example` as **placeholders only**
- [ ] No credentials pasted into PR description or screenshots

### Auth / access (if touched)

- [ ] Guards first on mutating / sensitive routes (`requireSession` / `requireApiKey`)
- [ ] Session cookies: HttpOnly · Secure (prod) · SameSite considered
- [ ] API keys remain **per-user** (no shared team key)
- [ ] `private_key` failures do not leak existence (404)
- [ ] Org membership rules respected (upload = org members only)

### Storage / serve (if touched)

- [ ] No path traversal on R2 / slug paths
- [ ] Zip unpack: zip-slip + size limits (frame)
- [ ] Large uploads use presigned flow (not Worker body for video)

### MCP / agents (if touched)

- [ ] Tools least-privilege; no arbitrary shell/exec
- [ ] Auth via `sk_…` (or documented OAuth path); no shared key
- [ ] Destructive tools require clear auth + audit where applicable

### Errors & privacy

- [ ] Client responses do not leak stack traces / SQL / internal paths
- [ ] Stable error **codes** used where UI/i18n needs them
- [ ] Logs avoid secrets and full API keys

## Quality checklist

- [ ] PR title follows [Conventional Commits](https://www.conventionalcommits.org/)
- [ ] Self-review done on the full diff
- [ ] Tests added/updated for behaviour change (esp. auth / storage / slug)
- [ ] Lint / typecheck / test pass locally (when toolchain exists)
- [ ] Docs / `AGENTS.md` updated if stack or invariants changed
- [ ] Dual-mission: product code stays out of kit packages (`packages/*` has no share-domain strings)

## Human review required?

Tick if this PR **must** wait for a human (not AI-only review):

- [ ] Auth / cookies / API keys
- [ ] R2 / zip / serve paths
- [ ] MCP tools (write/delete/replace)
- [ ] D1 migrations
- [ ] None of the above

## Test plan

<!-- How was this verified? Commands, scenarios, screenshots if UI -->

-
