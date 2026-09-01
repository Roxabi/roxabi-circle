# Roxabi Circle — agent notes (product)

## What this is

Discord gated community (AI + open source DNA). Entry = GitHub OAuth + **PR d’entrée (D11)** + **heuristic scorer** (no LLM on code). Monorepo public **AGPL**.

## Upstream (direct)

- `origin` = `Roxabi/roxabi-circle` (this product)
- `upstream` = `Roxabi/roxabi-cf-template` (Chemin A kit HEAD) — **fetch / merge only**, never push
- Pull kit: `git fetch upstream && git merge upstream/main`
- `docs/product/kit-baseline` = last merged `upstream/main` SHA

## Read first

- `docs/product/decisions.md` (D1–D14)
- `docs/product/vision.md`
- `docs/product/architecture/scoring.md`
- `docs/product/runbooks/discord-setup.md`

## Stack (live MVP)

| Piece | Status |
|---|---|
| `apps/circle-api` | **Live** CF Worker on **https://circle.roxabi.dev** |
| Discord | Ed25519 `/interactions` · `/apply` scaffold · appeal tickets · Gateway `#github-to-watch` / `#news-actu` · `@Lyra` mention → `LYRA_GROK_WEBHOOK_URL` |
| Scoring | **Pure lib** `src/scoring/*` + tests — **not** wired to HTTP yet |
| OAuth GitHub | Path stub **501** — not implemented |
| D1 / KV | Not provisioned |
| Kit apps | `apps/example-*`, `packages/@kit/*` — zero-edit kit surface (not product deploy) |

**Not in MVP (do not invent as live):** `apps/circle-web`, `apps/circle-mcp`, admin SPA, D1 live config UI.

### CF deploy (ops)

| | |
|---|---|
| Account | Mickael (`b5e90be9…`) — zone `roxabi.dev` |
| Host | `circle.roxabi.dev` · `workers_dev = false` |
| Secrets | `wrangler secret` + local `apps/circle-api/.dev.vars` |
| Gateway wake | cron `*/15` · DO alarms · manual ensure + `X-Ops-Secret` (`?force=1` after token rotate) · never from `/health` |
| GitHub digest | cron 12:30 Europe/Paris → `#daily-digest` · ops `POST /internal/github-digest` |

## D11 entry rail

- GitHub: https://github.com/Roxabi/circle-applications  
- Local sibling (not nested in monorepo): `~/projects/circle-applications`  
- Doc: `docs/product/circle-applications.md`

## Invariants

1. Scoring **pure** (`apps/circle-api/src/scoring/*`) — no network, deterministic  
2. **No score** until D11 PR unlock on circle-applications  
3. No clone of user repos; no LLM code review  
4. Never log OAuth / bot tokens  
5. Discord ACK < 3s ; heavy work in `waitUntil`  
6. DM/ephemeral : **total only** — axes = ops only (algo still open in git)  
7. Re-apply 48h then 15d  
8. FR copy (`messages-fr.ts`)  
9. Zero-edit kit zones vs `upstream` / `kit-baseline`  
10. Secrets never in git  

## Commands

```sh
bun install
bun run --filter @roxabi/circle-api test
bun run --filter @roxabi/circle-api typecheck
cd apps/circle-api && bun run deploy   # needs CF Mickael credentials
```
