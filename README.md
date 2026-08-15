# CF Chemin A kit

**Full Cloudflare SaaS monorepo** (Bun · Turborepo · Workers/Hono · D1/R2 · TanStack SPA · Better Auth + `sk_` · FastMCP).

SSoT kit for product apps that pull this repo as git `upstream` (zero-edit contract).

| | |
|---|---|
| **Start a product** | [`docs/playbooks/start-product.md`](docs/playbooks/start-product.md) · `git fetch upstream` · **push upstream = DENY** |
| **Foundations** | [`docs/playbooks/start-project.md`](docs/playbooks/start-project.md) |
| **First issue** | [`docs/playbooks/fork-to-first-issue.md`](docs/playbooks/fork-to-first-issue.md) |
| **Consumer contract** | [`docs/product-consumer-contract.md`](docs/product-consumer-contract.md) |
| **ADRs** | [0001 axis](docs/architecture/adr/0001-primary-axis-packages-compose-apps.md) · [0002 BA-only session](docs/architecture/adr/0002-session-hmac-interim-vs-better-auth.md) · [0003 multi-tenant](docs/architecture/adr/0003-multi-tenant-rbac-modules.md) · [0004 CF Email](docs/architecture/adr/0004-email-transport-cf-default.md) |
| **Agent** | [`AGENTS.md`](AGENTS.md) |
| **Kit parent URL / lineage** | operator SSoT (outside this monorepo) |

## Quick start (local)

```bash
bun install
bun run lint && bun run typecheck && bun run test

# Coverage (thresholds enforced)
bun run test:coverage

# API (Worker + D1 + R2 local)
cp apps/example-api/.dev.vars.example apps/example-api/.dev.vars
bun run db:migrate
bun run db:seed
cd apps/example-api && bun run dev
# → http://127.0.0.1:8787/health

# Web (other terminal)
cd apps/example-web && bun run dev
# → http://127.0.0.1:5173  (proxy /api → :8787)

# Worker mail = EMAIL_TRANSPORT=log (wrangler console, redacted). Not Mailpit.
# Mailpit is Node @kit/email/server only — never wrangler + smtp (throws on Worker).
# Optional Node catcher: docker compose up -d mailpit  # UI http://127.0.0.1:8025
# See docs/email-cf-runbook.md

# MCP stdio
cd apps/mcp-example && bun run start

# Extractability
bun run banlist && bun run extract-dry-run

# Browser smoke (API + web up)
bun run test:e2e:design-system
```

### Demo credentials (seed SSoT: `apps/example-api/src/seed/demo-data.ts`)

| User | Password | Role |
|---|---|---|
| `staff@kit.local` | `demo-password-change-me` | **staff** multi-org (health demoLogin) |
| `demo@kit.local` | `demo-password-change-me` | admin kit demo (BA seed) |
| `demo-b@kit.local` | `demo-password-b-change-me` | user (IDOR demos) |
| `super@kit.local` | `demo-password-change-me` | super_admin platform |

**Auth (ADR-0002):** browser session = **Better Auth only**. Dual credential = **cookie session** *or* **Bearer `sk_`**.

### Local secrets

- `apps/example-api/.dev.vars` from `.dev.vars.example` — **gitignored**
- Never commit secrets

## Packages

| Package | Role |
|---|---|
| `@kit/config` | Shared tsconfig + Vitest presets |
| `@kit/types` | Error codes + `ApiErrorBody` |
| `@kit/api-client` | Browser `apiFetch` + `ApiError` |
| `@kit/core` | `AppError`, `requestId` |
| `@kit/db` | Drizzle D1 factory |
| `@kit/storage` | R2 helpers + light presign |
| `@kit/auth` | Better Auth SessionPort + `sk_` helpers |
| `@kit/ui` | shadcn Base UI shell |
| `@kit/email` | Templates + transports `log` / `smtp` / `cf` / `resend` |
| `@kit/i18n` | Locale engine (catalogs in apps) |
| `@kit/mcp` | MCP helpers + contracts |

## Quality gates

Local primary gate: `bun run validate:full` (lefthook pre-push).  
CI is the guardrail. See [`docs/testing.md`](docs/testing.md).

## License

Private kit — not for public redistribution unless explicitly opened.
