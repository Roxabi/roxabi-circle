# silex-boilerplate — GOSILEX Chemin A kit

**Full Cloudflare SaaS monorepo** (Bun · Turborepo · Workers/Hono · D1/R2 · TanStack SPA · dual auth · FastMCP).

SSoT kit for product apps (e.g. **silex-share** pulls this via git `upstream`).

| | |
|---|---|
| **GitHub** | [`go-silex/silex-boilerplate`](https://github.com/go-silex/silex-boilerplate) (private) |
| **Local** | `~/projects/gosilex/silex-boilerplate/` |
| **Consumer example** | [`go-silex/silex-share`](https://github.com/go-silex/silex-share) · `git fetch upstream && git merge upstream/main` · **push upstream = DENY** (product-side hook + `no_push`) |
| **Goal** | [`artifacts/goals/001-chemin-a-boilerplate-goal.md`](artifacts/goals/001-chemin-a-boilerplate-goal.md) |
| **Axial ADR** | [`docs/architecture/adr/0001-primary-axis-packages-compose-apps.md`](docs/architecture/adr/0001-primary-axis-packages-compose-apps.md) |
| **Agent** | [`AGENTS.md`](AGENTS.md) |

## Quick Start (local)

```bash
bun install
bun run lint && bun run typecheck && bun run test

# Coverage (HTML → coverage/<pkg>/index.html · thresholds enforced)
bun run test:coverage

# API (Worker + D1 + R2 local)
cp apps/example-api/.dev.vars.example apps/example-api/.dev.vars
bun run db:migrate          # D1 schema
bun run db:seed             # users + demo notes (idempotent)
# bun run db:seed:reset     # wipe demo tables + reseed
# bun run db:reset          # migrate + seed --reset
cd apps/example-api && bun run dev
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

# Browser smoke (API + web up): design-system overlays, no Base UI pageerrors
bun run test:e2e:design-system
```

### Demo credentials (seed SSoT: `apps/example-api/src/seed/demo-data.ts`)

| User | Password | Role |
|---|---|---|
| `demo@gosilex.local` | `demo-password-change-me` | **admin** (design system) |
| `demo-b@gosilex.local` | `demo-password-b-change-me` | user (IDOR demos) |

```bash
bun run db:seed           # idempotent
bun run db:seed:reset     # DELETE demo tables + reseed
bun run db:reset          # migrate + seed:reset
```

Also: first login still **lazy-seeds users** via `ensureDemoUsers` if you skip `db:seed` (notes only via seed script).
- After login: cookie session `gosilex_session` (HttpOnly) · mint `sk_` via `POST /api/keys`

### Local secrets / env (do not deploy as-is)

- `apps/example-api/.dev.vars` from `.dev.vars.example` — **gitignored**
- `ENVIRONMENT` must be **explicit** `development` or `test` for the known session-secret fallback
- Missing / `production` / `staging` without `SESSION_SECRET` (min 32) → **fail closed**
- Cookie `Secure` is set when `ENVIRONMENT` is not `development`|`test`
- Never ship wrangler `ENVIRONMENT=development` to a public Worker

## Package map

| Package | Role |
|---|---|
| `@gosilex/config` | Shared `tsconfig.base.json` |
| `@gosilex/types` | Error codes + `ApiErrorBody` envelope |
| `@gosilex/core` | `AppError`, `toApiErrorBody`, `requestId` |
| `@gosilex/db` | Drizzle D1 factory (schemas stay in apps) |
| `@gosilex/storage` | R2 put/get/delete + safe key join (`demo/` prefix in example) |
| `@gosilex/auth` | Session cookie HMAC + `sk_` hash/generate/Bearer parse |
| `@gosilex/ui` | **shadcn official** `base-nova` + `@base-ui/react` (Button, Dialog, Sidebar, Sonner, …) |
| `@gosilex/email` | Demo email text builder |
| `@gosilex/mcp` | `ping` / `whoami` helpers + no-share-tools guard |

## Apps (examples only)

| App | Role |
|---|---|
| `example-api` | Hono Worker · health · dual auth · notes CRUD · D1/R2 · demo email |
| `example-web` | Vite SPA · TanStack · shadcn Base shell · notes/keys/settings · **design system (admin)** · FR/EN · dark mode |
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

## Testing & coverage

**SSoT strategy:** [`docs/testing.md`](docs/testing.md) — effective/risk-targeted tests, axial ownership, critical paths (CP-\*), local-first gates.

```bash
# Full local gate (same as Lefthook pre-push) — run before every push
bun run validate:full

# Static contracts (also inside validate / validate:full)
bun run env:check          # Zod schema ↔ .dev.vars.example
bun run i18n:check         # FR/EN messages contract
bun run license:check      # dependency SPDX allowlist

# Coverage only (HTML → coverage/<pkg>/index.html · thresholds enforced)
bun run test:coverage
```

| | |
|---|---|
| Reports | `coverage/<pkg>/index.html` + `coverage-summary.json` |
| Shared config | `packages/config/vitest-coverage.mjs` |
| Runner | `scripts/test-coverage.sh` |

### Thresholds (stmts / lines — enforced by Vitest)

| Package | Floor | Notes |
|---|---|---|
| `example-api` | **80%** | T0 backend kit bar |
| `auth` | **80%** | T0 keys / session |
| `core` | **75%** | AppError |
| `storage` · `db` · `types` · `mcp` | **70%** | small pure packages |
| `email` | **50%** | still thin |
| `ui` | **20%** | large surface; contract tests, not every primitive |
| `example-web` | **10%** | SPA chrome low; pin FE auth client contracts |
| `mcp-example` | **50%** stmts/lines (funcs 0%) | handlers not invoked in unit tests |

Coverage HTML is gitignored (`coverage/`). **% is a ratchet** — see `docs/testing.md` for critical paths over vanity UI coverage.

### Hooks + CI (local first)

| Gate | When | What | Role |
|---|---|---|---|
| **Lefthook pre-commit** | every commit | Biome (staged) | fast format/lint |
| **Lefthook pre-push** | every push | **`validate` + `test:coverage`** (`validate:full`) | **primary gate** |
| **GitHub Actions CI** | PR / main / staging | same suite + secret scan | **guardrail** (hooks skipped / env drift) |

```bash
# Install git hooks (once per clone) — required
bunx lefthook install
```

Do **not** push red hoping CI will catch it. Do **not** habitually use `LEFTHOOK=0` / `--no-verify`.

## CI / hygiene

| Artefact | Role |
|---|---|
| `.github/workflows/ci.yml` | Guardrail: lint · typecheck · test · **coverage** · banlist · extract |
| `.github/workflows/secret-scan.yml` | TruffleHog |
| `.github/workflows/merge-on-green.yml` | Label `reviewed` + green checks (ops track) |
| `lefthook.yml` | pre-commit Biome · **pre-push = full validate:full** · commitlint |
| [`docs/testing.md`](docs/testing.md) | Test doctrine + CP-\* inventory |

Ops companion (GitHub App `gosilex-ci`, DNS, CF deploy) = **out of local kit exit** — see [`docs/gosilex-ci-app-setup.md`](docs/gosilex-ci-app-setup.md).

## Dual mission

| Priority | What |
|---|---|
| **P0** | This kit green local + extract dry-run |
| **P1** | Product from [`artifacts/frames/001-share-platform-frame.md`](artifacts/frames/001-share-platform-frame.md) after exit |
