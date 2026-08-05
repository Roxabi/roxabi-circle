# Roxabi Circle — agent notes (product)

## What this is

Discord gated community (AI + open source DNA). Entry = GitHub OAuth + **PR d’entrée (D11)** + **heuristic scorer** (no LLM on code). Monorepo public **AGPL**.

## Bounce

- `upstream` = `Roxabi/roxabi-cf-template` (chassis ; rebrand Roxabi progressif)
- Template `upstream` = `go-silex/silex-boilerplate`
- Never push to either upstream

## Read first

- `docs/product/decisions.md` (D1–D14)
- `docs/product/vision.md`
- `docs/product/architecture/scoring.md`

## Stack (MVP)

- `apps/circle-api` — Hono + `@gosilex/*` (→ `@roxabi/*` post-rebrand) : Discord, OAuth, scorer, D1 config
- `apps/circle-web` — admin ops (`/admin`)
- `apps/circle-mcp` — tools ops (`sk_`)
- D1 config live (threshold/weights) ; override staff auditable

## Invariants

1. Scoring **pure** (`apps/circle-api/src/scoring/*`) — no network, deterministic
2. **No score** until D11 PR unlock on circle-applications
3. No clone of repos; no LLM code review
4. Never log OAuth / bot tokens
5. Discord ACK < 3s ; heavy work in `waitUntil`
6. DM/ephemeral : **total only** (`toCandidateView`) — axes = ops only (algo still open in git)
7. Re-apply 48h then 15d
8. FR copy (`messages-fr.ts`)
9. Zero-edit kit zones vs `upstream` / `kit-baseline`
10. CI product + optional `BANNED_REPO_TERMS` list (env/secret)

## Commands

```sh
bun install
bun run --filter @roxabi/circle-api test
bun run --filter @roxabi/circle-api typecheck
bun run zero-edit
```
