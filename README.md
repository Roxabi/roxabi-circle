# CF Chemin A kit

Cloudflare SaaS monorepo kit built with Bun, Turborepo, Workers/Hono, D1/R2, TanStack, Better Auth and MCP conventions. Product repositories inherit it as a fetch-only `upstream` and compose capabilities without editing kit-owned paths.

## Start here

| Goal | Home |
|---|---|
| Understand documentation authority and find any kit document | [`docs/kit/README.md`](docs/kit/README.md) |
| Read the agent constitution | [`AGENTS.md`](AGENTS.md) |
| Start a product | [`docs/kit/playbooks/start-product.md`](docs/kit/playbooks/start-product.md) |
| Establish project foundations | [`docs/kit/playbooks/start-project.md`](docs/kit/playbooks/start-project.md) |
| Ship the first issue | [`docs/kit/playbooks/inherit-to-first-issue.md`](docs/kit/playbooks/inherit-to-first-issue.md) |
| Apply the zero-edit consumer contract | [`docs/kit/product-consumer-contract.md`](docs/kit/product-consumer-contract.md) |
| Understand stack and architecture | [`docs/kit/standards/stack.md`](docs/kit/standards/stack.md) · [`docs/kit/architecture/index.md`](docs/kit/architecture/index.md) |
| Test or verify a change | [`docs/kit/testing.md`](docs/kit/testing.md) |
| Develop safely with agents | [`docs/kit/processes/dev-process.md`](docs/kit/processes/dev-process.md) |
| Configure environments and deploy | [`docs/kit/environments.md`](docs/kit/environments.md) · [`docs/kit/deploy-cloudflare.md`](docs/kit/deploy-cloudflare.md) |

The kit parent URL and repository lineage are operator concerns outside this monorepo.

## Local onboarding

From the repository root:

```bash
bun install
cp apps/example-api/.dev.vars.example apps/example-api/.dev.vars
bun run db:migrate
bun run db:seed
bun run dev
```

The local API health endpoint is `http://127.0.0.1:8787/health`; the web app is served at `http://127.0.0.1:5173`. `.dev.vars` is gitignored and must contain only local values.

### Demo users

The seed source of truth is `apps/example-api/src/seed/demo-data.ts`.

| User | Password | Role |
|---|---|---|
| `staff@kit.local` | `demo-password-change-me` | staff, multi-org |
| `demo@kit.local` | `demo-password-change-me` | demo admin |
| `demo-b@kit.local` | `demo-password-b-change-me` | user for IDOR scenarios |
| `super@kit.local` | `demo-password-change-me` | platform super-admin |

Browser authentication uses Better Auth cookies; machine clients use Bearer `sk_` keys.

For individual app startup, MCP smoke, email behavior and the complete quality gate, follow the machine map in [`.claude/stack.yml`](.claude/stack.yml) and the [testing strategy](docs/kit/testing.md). The root `package.json` remains the source of truth for executable commands.

## Repository shape

| Area | Role |
|---|---|
| `packages/*` | Reusable `@kit/*` capabilities |
| `apps/example-api` | Hono/D1/R2 composition proof |
| `apps/example-web` | TanStack and `@kit/ui` composition proof |
| `apps/mcp-example` | MCP catalogue and transport proof |
| `docs/kit` | Standards, architecture, processes, playbooks and evidence |

Product domain belongs in new product-owned apps and product repositories, never in `packages/*` or the example apps.

## Quality and security

Use the root `package.json` script `validate:full` as the kit gate; its internal steps are intentionally not duplicated here. Security-sensitive auth, tenancy, storage, archive, MCP, migration and deployment changes require targeted proof plus human review.

Never commit secrets. Never push to a consumer repository's `upstream`. See the [development process](docs/kit/processes/dev-process.md) for the complete operating rules.

## License

Private kit — not for public redistribution unless explicitly opened.
