# #24 TypeScript 7 — inventory & ship notes

## Pre-bump (2026-08-08)

| Manifest | Range | Lock resolution |
|----------|-------|-----------------|
| `package.json` (root) | `^5.9.0` | `typescript@5.9.3` |
| `packages/core` | `^5.9.0` | same |
| `packages/auth` | `^5.9.0` | same |
| `packages/db` | `^5.9.0` | same |
| `packages/storage` | `^5.9.0` | same |
| `packages/types` | `^5.9.0` | same |
| `packages/ui` | `^5.9.0` | same |
| `packages/email` | `^5.9.0` | same |
| `packages/i18n` | `^5.9.0` | same |
| `packages/mcp` | `^5.9.0` | same |
| `packages/flows` | `^5.9.0` | same |
| `packages/api-client` | `^5.9.0` | same |
| `apps/example-api` | `^5.9.0` | same |
| `apps/example-web` | `^5.9.0` | same |
| `apps/mcp-example` | `^5.9.0` | same |

- **Count:** 15 manifests with `typescript` pin (root + 14 workspaces)
- **`@kit/config`:** no `typescript` pin (exports `tsconfig.base.json` only)
- **`packages/ui/tsconfig.json`:** `"baseUrl": "."` + `paths` `@/*` → `./src/*` (6/7 hard-deprecation landmine)
- **AGENTS.md Language row:** `TypeScript 5.9+ strict`
- **Registry:** `typescript@7.0.2` latest stable; **6.x bridge exists** (`6.0.2` / `6.0.3`)
- **Dependabot PR #12:** OPEN, MERGEABLE — `chore(deps-dev): bump typescript from 5.9.3 to 7.0.2` (same 15 files). **Not ship unit.** Close **before** dedicated merge; never label `reviewed`.

## Post-bump (2026-08-08)

| Field | Value |
|-------|--------|
| Pin used | `^7.0.2` (resolved `typescript@7.0.2`) on all 15 manifests |
| `bun run ts-major` | OK — `scripts/check-typescript-major.sh` green |
| Forced typecheck | `TURBO_FORCE=true bun run typecheck` — **14/14 green, 0 new diagnostics** |
| `build:kit` | exit 0 |
| `validate:full` | exit 0 (includes `ts-major`) |
| Compile fixes | **only** drop `baseUrl` from `packages/ui/tsconfig.json` (paths kept `./src/*`) |
| Dual-install | none — kit has no `import 'typescript'`; pure `typescript@7.0.2` |
| Hatch | **single hop 5.9→7** — no intermediate 6 needed |
| `tsc --version` | Version 7.0.2 |

### Triage attestation (anti–manifest-only)

- Clean install: `rm -rf node_modules && bun install` → `typescript@7.0.2`
- D2: `bun run ts-major` → OK (15 pins ^7; no typescript@5/6 in lock)
- Forced typecheck under 7.x: **0 new first-party diagnostics** after clean install + force
- Forced config fix: `packages/ui` remove `baseUrl` (TS 6/7 hard deprecation) — required for legal config, not a diagnostic flood

## PR body bullets (T7)

- Title: `chore(deps): wave5b typescript7 monorepo pin + ts-major gate`
- Closes #24
- **Supersedes Dependabot #12** — close #12 **before** dedicated merge; do not label #12 `reviewed`
- D2: permanent `scripts/check-typescript-major.sh` + `bun run ts-major` in `validate` / `validate:full` (mirror `zod-major`)
- Force typecheck after clean install (`TURBO_FORCE=true`); build:kit + validate:full green
- First-party only; skipLibCheck baseline unchanged; no dual-install
- Compile fix: drop `packages/ui` `baseUrl`
- Docs: AGENTS Language row → TypeScript 7+ strict
- No product domain / other majors; no #30/#31 redesign
