# Staging — example-api / example-web (B4)

**Protocol (all apps):** [`environments.md`](./environments.md).

**This page** is kit **example-*** status only. `[env.staging]` is **not** in `apps/example-*/wrangler.toml`. Do **not** run `wrangler deploy --env staging` on example-api/web. Do **not** patch example-* wrangler for a product — products add `apps/<product>-*/wrangler.toml` (zero-edit).

| Item | Status |
|------|--------|
| Protocol | [`environments.md`](./environments.md) |
| example-* `[env.staging]` + D1/R2 | **Absent** — B4 |
| Kit CD | [`deploy-cloudflare.md`](./deploy-cloudflare.md) — `main` + `--env production` only |
| Product staging | Follow [`environments.md`](./environments.md) §6 · contract [`product-consumer-contract.md`](./product-consumer-contract.md) |

**B4 (when complete):** `[env.staging]` on example-*, named D1/R2, Builds row for a **second** Worker project, `ENVIRONMENT=staging` (never `development`). Until then this checklist stays red.

Merge path (kit): PR → secret scan + CI green → label `reviewed` → merge-on-green. Free private: no branch-protection API.
