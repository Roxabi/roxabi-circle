---
title: 'ADR-0008 — Kit schema identity is module id + hash, not example-api NNNN'
status: accepted
normative: true
date: 2026-08-19
axial: false
related:
  - docs/kit/architecture/adr/0001-primary-axis-packages-compose-apps.md
  - docs/kit/product-consumer-contract.md
  - docs/kit/playbooks/start-product.md
  - docs/kit/kit-schema-sync.md
---

# ADR-0008 — Kit schema identity is module id + hash, not example-api NNNN

Extends [ADR-0001](./0001-primary-axis-packages-compose-apps.md): apps compose `@kit/*`; they do not clone `example-api` as a product.

Operator how-to: [`docs/kit/kit-schema-sync.md`](../../kit-schema-sync.md).

## Problem

`apps/example-api` is three things at once:

| Role | What it is | What products inferred |
|------|------------|------------------------|
| **Dogfood app** | Kit prove-out (routes, seed, UI) | “Copy this tree to start” |
| **Applied D1 SSoT** | Live SQL in `apps/example-api/migrations/*` | “Those `NNNN_` numbers are kit versions” |
| **Clone template** | Accidental scaffold | Hand-copy 0001–0008, then domain at 0009 |

That inference is false. **D1’s journal is the filename.** Wrangler records `0009_….sql`; you cannot reuse a number, cannot rename applied history, cannot “fix” a collision by editing `d1_migrations` in prod.

What happened (LGU-class clone):

1. Product copied `example-api` migrations 0001–0008 (auth / keys / org / modules).
2. Product used **0009+ for domain**.
3. Kit later shipped **0009–0013** (RBAC B, audit, demo, flows, tasks).
4. Merge / “stay current” wants to copy kit `0009_*.sql` onto a DB that already applied a different `0009_*.sql` → collision.

Code clone has the same shape: `example-api/src/lib/better-auth.ts` (`createBetterAuth`, `first_login` hook, email-port) is **app glue**, not a package. Products that copied it port the file on every kit merge.

## Decision

### D1 — Compose, do not clone

Happy path: new `apps/<product>-api` that **imports `@kit/*`**. `cp -R apps/example-api` is last resort, not day-0.

| Do | Do not |
|----|--------|
| New product API app + import packages | Clone `example-api` as the product |
| Sync kit SQL via `scripts/kit/kit-schema-sync.sh` | Hand-copy `example-api/migrations` then domain at 0009 |
| Last-resort clone: `--adopt` immediately | Keep dual-editing the copy forever |

Last-resort **must** `--adopt` then never add **new** domain SQL in `0001`–`0999`. Frozen history stays; new domain starts at `1000_`.

### D2 — Schema identity = module `id` + sha256

Identity is **not** the example-api filename.

| Fact | Where |
|------|--------|
| Module `id` + source path + `kitSha256` pin | Catalog `config/kit/kit-schema-modules.json` (kit) |
| sha256 of **kit source bytes** | Catalog pin; verified at sync against live catalogued file |
| Local filename in the product app | Manifest `apps/<product>-api/kit-schema-manifest.json` (product-owned, new file) |

Product local names are free (`0021_kit_rate_limit_audit.sql`). The journal may differ from the kit’s `0010_rate_limit_audit.sql`; the **hash** must match the kit source.

Manifest JSON keys (sync script): `modules.<id>.kitSha256`, `modules.<id>.productFile`.

### D3 — Applied SQL SSoT remains `apps/example-api/migrations/*`

| Tree | Status in this ADR |
|------|-------------------|
| `apps/example-api/migrations/*` | **Applied SSoT** — sync hashes and copies **these** bytes |
| `packages/*/migrations/*` | **Sketches only** — not the product apply path until a later ADR promotes them. Gate: `scripts/kit/check-wrangler-migrations-dir.sh` |

Honest debt: kit SQL still lives in the dogfood app, not in packages. This ADR does **not** move files. Promoting sketches → applied SSoT is a follow-up ADR. `@kit/auth` does **not** export `./migrations/*`. Those files are sketches (`SKETCH / NOT applied`); the apply path is `kit-schema-sync` + `apps/example-api/migrations`.

### D4 — Sync is append-only

```text
scripts/kit/kit-schema-sync.sh --app apps/<product>-api [--modules core|all|<sets>]
```

| Rule | |
|------|--|
| Default | `--modules core` = example-api **0001–0008** |
| Opt-in sets | `rbac` · `audit` · `demo` · `flows` · `tasks` (catalog is SSoT for ids/files) |
| `all` | Every catalogued module — **not** the default; skip sets the product does not mount |
| Write | Append a **new** local file + manifest row |
| Never | Rewrite an applied file · reuse a local `NNNN` · edit `d1_migrations` |
| Hash change | If a **published** module `id` changes bytes → **fail**. Add a **new** `id` (new source file). Do not mutate the old id |

Set ↔ current applied files (catalog remains SSoT):

| Set | example-api today |
|-----|-------------------|
| `core` | `0001`–`0008` |
| `rbac` | `0009_organization_roles_grants.sql` |
| `audit` | `0010_rate_limit_audit.sql` |
| `demo` | `0011_demo_items.sql` |
| `flows` | `0012_flows_plans_runs.sql` |
| `tasks` | `0013_tasks_comments.sql` |

### D5 — Product SQL numbering

| Kind | Band | Rule |
|------|------|------|
| **Greenfield** after sync | Kit local `0001`–`0999` (`NNNN_kit_*`) | Product domain starts at **`1000_`** (gap) |
| **Existing clone** (LGU) | Domain already at `0009`–`0020` | **Freeze** that history. `--adopt` core. Later kit modules **append** (`0021_kit_*`…). New domain at **`1000_`** |
| Last-resort `cp` | Applied 0001–0008 (or more) | `--adopt` immediately; no new domain SQL below `1000_` |

### D6 — Code glue is importable (`@kit/auth`)

**Shipped 2026-08-20.** Products **import**; they do not port `example-api/src/lib/better-auth.ts`.

| Piece | Where |
|-------|--------|
| `createBetterAuth({ database, secret, baseURL, emailPort, … })` | `@kit/auth/factory` (not the root barrel — SPA/MCP stay free of `better-auth`) |
| Drizzle BA tables | `@kit/auth/schema` |
| Env helpers (`getBetterAuthSecret`, `betterAuthBaseURL`, cors, signup, cookies) | `@kit/auth` — **required** with the factory (min-32 + placeholder denylist also runs inside `createBetterAuth`) |
| Magic-link + reset send via EmailPort | `@kit/auth/factory` (`sendMagicLinkMail` / `sendResetPasswordMail`) using `@kit/email` templates |
| `first_login` hook | `@kit/auth` `onFirstSession` / `createFirstSessionAfterHook` — product supplies the audit insert (`tryFirstLogin`) when the audit module is mounted |
| Welcome / invite mail | already `@kit/email` `build*EmailText` + app `resolveEmailPort` |

`example-api/src/lib/better-auth.ts` is a thin **Env adapter** (dogfood): maps Worker env → factory opts + lazy `emailPort` + `onFirstSession`. It is the mapping example, not a second factory. Do not `cp` it as the BA implementation.

`emailPort.send` runs only when BA sends mail. Do **not** call `resolveEmailPort(env)` at factory construction — that 500s every request (including `/health`) when staging/prod lacks `EMAIL_TRANSPORT`. Wrap: `emailPort: { send: (input) => resolveEmailPort(env).send(input) }`.

SQL identity is still D1–D5 (this ADR). D6 does **not** move applied SQL into `packages/*/migrations`.

## Consequences

- Second product compose (ADR-0001 test) does not fork D1 numbers.
- Kit can add 0009+ in example-api; products already on 0009-domain still append via sync.
- Manifest is an allowed product file (zero-edit free). Products **must not** edit `apps/example-api/migrations`.
- Opt-in sets are capabilities, not a “stay current” obligation.

## Anti-patterns

| Anti | Why |
|------|-----|
| Copy kit `0009_*.sql` into a product that already has `0009_*.sql` | D1 journal collision |
| Rewrite `d1_migrations` in prod (or any applied DB) | History is the database |
| Rename applied migration files to “make room” | Same — journal = filename |
| `--modules all` / port `demo_items` · flows · tasks “to stay current” when the product does not mount those routes | Dead schema + merge noise |
| Dual-edit kit `better-auth.ts` (or kit migrations) in the product | Forever-conflicts; import `@kit/auth/factory` |
| Treat `packages/*/migrations` as applied SSoT | Sketches; hashes would drift from example-api |

## Non-goals

- Implementing product domain SQL in the kit
- Moving applied SSoT into `packages/*/migrations` (later ADR)
- Editing `apps/lgu-*` or any product tree from the kit
