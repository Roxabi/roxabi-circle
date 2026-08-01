# Roxabi Circle — agent notes (product)

## What this is

Discord gated community (AI + open source DNA). Entry = GitHub OAuth + **heuristic scorer** (no LLM on code).

## Bounce

- `upstream` = `Roxabi/roxabi-cf-template` (private CF kit)
- Template `upstream` = `go-silex/silex-boilerplate`
- Never push to either upstream

## Read first

- `docs/product/decisions.md` (D1–D10)
- `docs/product/vision.md`
- `docs/product/architecture/scoring.md`
- `docs/product/architecture/overview.md`

## Stack

CF monorepo kit (Bun · Turbo · Hono examples · BA · FastMCP) + product:

- `apps/circle-api` — Worker product (scorer pure + Discord/OAuth TBD)
- D1/KV not provisioned yet

## Invariants

1. Scoring stays **pure** (`apps/circle-api/src/scoring/*`) — no network, deterministic
2. No clone of repos; no LLM code review
3. Never log OAuth / bot tokens
4. Discord interaction ACK < 3s; heavy work in `waitUntil` / deferred follow-up
5. **User-facing messages** show score total only — never axes / weights / keywords / evidence (D2)
6. Re-apply: 48h after 1st reject, then 15d (`apps/circle-api/src/lib/reapply.ts`)
7. FR copy only for now (`apps/circle-api/src/lib/messages-fr.ts`)
8. Zero-edit kit zones vs `upstream/main` (or `docs/product/kit-baseline` in CI)

## Commands

```sh
bun install
bun run --filter @roxabi/circle-api test
bun run --filter @roxabi/circle-api typecheck
bun run zero-edit
# full kit bar (slow): bun run validate:full
```
