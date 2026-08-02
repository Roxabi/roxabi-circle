# silex-boilerplate — GOSILEX Chemin A kit

**Full Cloudflare SaaS monorepo** (Bun · Turborepo · Workers/Hono · D1/R2 · TanStack SPA · Better Auth + `sk_` · FastMCP).

SSoT kit for product apps that pull this repo as git `upstream` (zero-edit contract).

| | |
|---|---|
| **GitHub** | [`go-silex/silex-boilerplate`](https://github.com/go-silex/silex-boilerplate) (private) |
| **Local** | `~/projects/gosilex/silex-boilerplate/` |
| **Start a product** | [`docs/playbooks/start-product.md`](docs/playbooks/start-product.md) · `git fetch upstream` · **push upstream = DENY** (`no_push` + lefthook) |
| **First issue ship** | [`docs/playbooks/fork-to-first-issue.md`](docs/playbooks/fork-to-first-issue.md) — brief → Spark → GH issue → `/dev` (F-lite) |
| **Dogfood harness** | `bun run dogfood:zero-edit` (product-mode self-sim; real product evidence still open · B5) |
| **Live goal** | [**Goal 002**](artifacts/goals/002-product-ready-multi-tenant-goal.md) — product-ready multi-tenant (Goal 001 scaffold [superseded](artifacts/goals/001-chemin-a-boilerplate-goal.md)) |
| **ADRs** | [0001 axis](docs/architecture/adr/0001-primary-axis-packages-compose-apps.md) · [0002 BA-only session](docs/architecture/adr/0002-session-hmac-interim-vs-better-auth.md) · [0003 multi-tenant](docs/architecture/adr/0003-multi-tenant-rbac-modules.md) · [0004 CF Email](docs/architecture/adr/0004-email-transport-cf-default.md) |
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
| `staff@gosilex.local` | `demo-password-change-me` | **staff** multi-org (health demoLogin) |
| `demo@gosilex.local` | `demo-password-change-me` | admin kit demo (BA seed) |
| `demo-b@gosilex.local` | `demo-password-b-change-me` | user (IDOR demos) |
| `super@gosilex.local` | `demo-password-change-me` | super_admin platform |

```bash
bun run db:seed           # idempotent
bun run db:seed:reset     # DELETE demo tables + reseed
bun run db:reset          # migrate + seed:reset
```

Also: first login still **lazy-seeds users** via `ensureDemoUsers` if you skip `db:seed` (notes only via seed script).

**Auth (ADR-0002):** browser session = **Better Auth only** (HMAC retired). Dual credential = **cookie session** *or* **Bearer `sk_`** (MCP/machine). Login: **password** (`sign-in/email`) or **magic link** (`sign-in/magic-link`, TTL 5 min, EmailPort; public signup off by default). After session: HttpOnly cookie · mint org-bound `sk_` via `POST /api/keys`. See AGENTS.md auth matrix.

### Local secrets / env (do not deploy as-is)

- `apps/example-api/.dev.vars` from `.dev.vars.example` — **gitignored**
- `ENVIRONMENT` must be **explicit** `development` or `test` for the known session-secret fallback
- Missing / `production` / `staging` without `SESSION_SECRET` (min 32) → **fail closed**
- Cookie `Secure` is set when `ENVIRONMENT` is not `development`|`test`
- Never ship wrangler `ENVIRONMENT=development` to a public Worker

## Package map

| Package | Role |
|---|---|
| `@gosilex/config` | Shared `tsconfig.base.json` + Vitest coverage presets |
| `@gosilex/types` | Error codes + `ApiErrorBody` envelope |
| `@gosilex/api-client` | Browser `apiFetch` + `ApiError` (kit envelope, credentials include) |
| `@gosilex/core` | `AppError`, `toApiErrorBody`, `requestId` |
| `@gosilex/db` | Drizzle D1 factory (schemas stay in apps) |
| `@gosilex/storage` | R2 put/get/delete + safe key join (`demo/` prefix in example) |
| `@gosilex/auth` | Better Auth `SessionPort` + cookie SSoT + `sk_` helpers + org-role constants (ADR-0002/0003) |
| `@gosilex/ui` | **shadcn official** `base-nova` + `@base-ui/react` (Button, Dialog, Sidebar, Sonner, …) |
| `@gosilex/email` | Templates + transports `log` / `smtp` / **`cf`** (prod default) / `resend` (ADR-0004) |
| `@gosilex/i18n` | Locale engine only; FR/EN catalogs live in apps |
| `@gosilex/feedback` | Signaler → Spark Pilotage (core + Hono + React FAB) |

**Kit patterns (B6):** MasterData demo at `apps/example-*` → `/api/items` + `/app/items` (`demo_items`, no package). API client `@gosilex/api-client`. Presign: `POST /api/uploads/presign` + complete (`PRESIGN_MODE=mock`). Jobs: later B6.
| `@gosilex/mcp` | `ping` / `whoami` helpers + no-share-tools guard |

## Apps (examples only)

| App | Role |
|---|---|
| `example-api` | Hono Worker · BA + `sk_` · orgs/modules/feedback · invites · reset · D1/R2 · email |
| `example-web` | Vite SPA · TanStack · shells **`/admin`** + **`/app`** · notes/keys · design system · FR/EN · dark mode |
| `mcp-example` | FastMCP stdio · tools `ping` + `whoami` only |

**Multi-tenant:** Phase A + **Phase B kit surface shipped** (API + IDOR tests + minimal roles UI · ADR-0003 · [GH #22](https://github.com/go-silex/silex-boilerplate/issues/22)). Further product-grade polish tracked separately.

**No** product métier apps in this kit — domain lives in `go-silex/<product>` repos (zero-edit consumer).

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
# Hooks: bun install is enough (Bun on Unix-like shells).
# prepare runs `lefthook install` only when core.hooksPath is unset (fresh clone).
# If hooksPath is already set (org/personal shared hooks), install is skipped so
# existing wiring is not overwritten. Keep the vendored lefthook dep; do not force
# `lefthook install` when hooksPath is set.
bun install
# Optional check: test -f lefthook.yml && bunx lefthook version
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
