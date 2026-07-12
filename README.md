# GOSILEX Chemin A — Cloudflare SaaS kit

**Full-local monorepo boilerplate** (Bun · Turborepo · Workers/Hono · D1/R2 · TanStack SPA · dual auth · FastMCP).

Product **silex-share** is P1 (frame only) — **not** in this kit tree.

| | |
|---|---|
| **GitHub** | [`go-silex/silex-share`](https://github.com/go-silex/silex-share) (private) |
| **Goal** | [`artifacts/goals/001-chemin-a-boilerplate-goal.md`](artifacts/goals/001-chemin-a-boilerplate-goal.md) |
| **Axial ADR** | [`docs/architecture/adr/0001-primary-axis-packages-compose-apps.md`](docs/architecture/adr/0001-primary-axis-packages-compose-apps.md) |
| **Agent** | [`AGENTS.md`](AGENTS.md) |

## Quick Start (local)

```bash
bun install
bun run lint && bun run typecheck && bun run test

# API (Worker + D1 + R2 local)
cp apps/example-api/.dev.vars.example apps/example-api/.dev.vars
cd apps/example-api && bunx wrangler d1 migrations apply example-api-local --local && bun run dev
# → http://127.0.0.1:8787/health

# Web (other terminal)
cd apps/example-web && bun run dev
# → http://127.0.0.1:5173  (proxy /api → :8787)

# Mailpit (email demo)
docker compose up -d mailpit
# UI http://127.0.0.1:8025

# MCP stdio
cd apps/mcp-example && bun run start
# tools: ping, whoami only

# Extractability
bun run banlist && bun run extract-dry-run
```

### Demo credentials

- Email: `demo@gosilex.local`
- Password: `demo-password-change-me`
- After login: cookie session `gosilex_session` (HttpOnly) · mint `sk_` via `POST /api/keys`

## Package map

| Package | Role |
|---|---|
| `@gosilex/config` | Shared `tsconfig.base.json` |
| `@gosilex/types` | Error codes + `ApiErrorBody` envelope |
| `@gosilex/core` | `AppError`, `toApiErrorBody`, `requestId` |
| `@gosilex/db` | Drizzle D1 factory (schemas stay in apps) |
| `@gosilex/storage` | R2 put/get/delete + safe key join (`demo/` prefix in example) |
| `@gosilex/auth` | Session cookie HMAC + `sk_` hash/generate/Bearer parse |
| `@gosilex/ui` | CVA button/input/card/label (shadcn-style Base kit) |
| `@gosilex/email` | Demo email text builder |
| `@gosilex/mcp` | `ping` / `whoami` helpers + no-share-tools guard |

## Apps (examples only)

| App | Role |
|---|---|
| `example-api` | Hono Worker · health · dual auth · notes CRUD · D1/R2 · demo email |
| `example-web` | Vite SPA · TanStack Router/Query/Form · FR/EN · `@gosilex/ui` |
| `mcp-example` | FastMCP stdio · tools `ping` + `whoami` only |

**No** `apps/share-*` until kit goal exit.

## Error envelope

```json
{
  "error": { "code": "VALIDATION_ERROR", "message": "…", "details": {} },
  "requestId": "req_…"
}
```

## Axis (non-negotiable)

Packages = platform concerns. Apps = deployables. Product domain only later under `apps/<product>-*`.

## CI / hygiene

| Artefact | Role |
|---|---|
| `.github/workflows/ci.yml` | Workflow name **`CI`**: lint · typecheck · test · banlist |
| `.github/workflows/secret-scan.yml` | TruffleHog |
| `.github/workflows/merge-on-green.yml` | Label `reviewed` + green checks (ops track) |
| `lefthook.yml` + commitlint | Pre-commit + conventional commits |

Ops companion (GitHub App `gosilex-ci`, DNS, CF deploy) = **out of local kit exit** — see [`docs/gosilex-ci-app-setup.md`](docs/gosilex-ci-app-setup.md).

## Dual mission

| Priority | What |
|---|---|
| **P0** | This kit green local + extract dry-run |
| **P1** | Product from [`artifacts/frames/001-share-platform-frame.md`](artifacts/frames/001-share-platform-frame.md) after exit |
