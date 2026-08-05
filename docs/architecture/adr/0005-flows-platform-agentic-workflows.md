---
title: 'ADR-0005 — Flows platform: governed plans + durable runs (agentic SaaS kit)'
status: proposed
date: 2026-08-05
related:
  - docs/architecture/adr/0001-primary-axis-packages-compose-apps.md
  - packages/ (future @kit/flows, @kit/flows-ui)
  - Cloudflare Workflows / AI Gateway
  - 'GitHub #16'
---

# ADR-0005 — Flows platform for agentic SaaS (Chemin A)

## Status

**Proposed** — incubate then promote to `@kit/flows` (+ UI). No implementation required to accept the direction.

## Context

SaaS “3.0 agentic-ready” needs more than chat: **repeatable work** that is:

1. **Declared** as a reviewable plan (intent as code — Nika-like)
2. **Governed** (default-deny tools / hosts / bindings — permits)
3. **Checked** before spend (schema, DAG, cost ceiling)
4. **Durable** across failures and human waits (Cloudflare Workflows)
5. **Observable** (list runs, step timeline, enable/disable plans)
6. **Eventually authorable** in-product (create/edit plans — after engine solid)

Without a kit axis, products will each invent Cron + Queue + ad-hoc agent loops → N×M drift, no shared console, no shared security model.

**Out of scope for this ADR:** shipping Cloudflare OS as kit; embedding Nika’s Rust binary; visual n8n builder day-1; product-domain plan strings inside packages.

## Options considered

### Option A — Ops-only repo forever (`roxabi-flows` standalone)

- **Pros:** Fast iterate; zero kit zero-edit risk; no consumer noise  
- **Cons:** Never becomes extractible SaaS capability; dual-edit if products need the same runner; no dogfood in `example-*`

### Option B — Full platform day-1 in kit (builder UI + Gatekeepers + multi-tenant create)

- **Pros:** Vision complete early  
- **Cons:** Scope bomb; empty packages; conflicts with “2 call sites or ADR”; blocks other kit work

### Option C — **Platform packages, phased** (chosen)

- **Pros:** Aligns ADR-0001; dogfood in examples; products compose; room to incubate first  
- **Cons:** Temporary incubate→promote hop; discipline required so ops plans stay out of `packages/*`

## Decision

### D1 — Capability = kit module (primary axis packages)

| Package (target) | Role |
|---|---|
| **`@kit/flows`** | Plan schema (Zod), `check()`, permits, tool registry interface, run lifecycle, CF Workflows adapter, D1 models for `plans` / `runs` / receipts |
| **`@kit/flows-ui`** | Console shell: list plans/runs, detail + step timeline, enable/disable, HITL approve actions (no product copy) |

Apps compose packages:

- `apps/example-api` — routes + Workflows binding + dogfood tools  
- `apps/example-web` — `/admin/flows` dogfood  
- Products — same packages + **product tools + product plans** under `apps/<product>-*` only  

**Axial test (ADR-0001):** second product adds tools/plans in its app — it does **not** fork the runner or copy D1 run tables into a local god module.

### D2 — Runtime = Cloudflare Workflows (do not reimplement durable engine)

```text
plan (definition)  →  check()  →  Workflow instance (run)
                                    step.do / sleep / waitForEvent
```

| Layer | Owner |
|---|---|
| Durable steps, retries, hibernation | **CF Workflows** |
| Plan language, permits, check, tool allowlist | **`@kit/flows`** |
| LLM routing / budgets | **AI Gateway** (preferred) + env model ids |
| Optional dynamic tenant code load | `@cloudflare/dynamic-workflows` only if product needs upload-and-run **code**; default = interpreted plans |

**Forbidden:** custom DO workflow engine when Workflows suffice; shell `exec` as first-class verb on Workers.

### D3 — Plan contract (Nika-inspired, not Nika binary)

Minimum plan surface (v0):

```text
id · description?
model? · max_cost / max_tokens ceilings
permits: { tools[], net?, r2? }
tasks: { id → invoke | infer | agent | when? | with? }
outputs?
```

| Verb | Meaning on CF |
|---|---|
| `invoke` | Allowlisted tool from registry |
| `infer` | Bounded LLM call |
| `agent` | Optional leashed tool-loop (max turns + tools ⊆ permits) |

- **`check(plan)`** is pure: schema, unknown tools, DAG edges, missing permits, unbounded cost → fail **before** first token  
- Plans in kit dogfood = **generic** (e.g. “echo → infer summary → write R2 demo”) — **zero** Roxabi/Silex business strings in `packages/*`  
- Product plans live in product app, DB, or product-owned R2 — not promoted into `@kit/*` as domain content  

### D4 — Security model (permits + dual auth)

- Default-deny: task tool ∉ `permits.tools` → refuse at check **and** at dispatch  
- Credentials never in plan body; tools use Worker bindings / secrets  
- Runs authenticated: session cookie **or** Bearer `sk_` (ADR-0002 dual-path)  
- Multi-tenant: every plan/run row scoped `org_id` (ADR-0003); list/detail enforce membership  
- Receipts: redacted inputs/outputs; no secrets/tokens in D1 logs  
- HITL: `waitForEvent` / approve tool — human gate for side effects (email send, revoke, external write)

Inspiration (not dependency): Nika `permits`, CF OS Gatekeepers (capability introduce + observation). **Do not** require Cloudflare OS deploy for kit MVP.

### D5 — Product console surface (phased)

| Phase | Ship | Non-goal yet |
|---|---|---|
| **P0** | Schema + check + 1 generic Workflow runner + D1 run rows + tests | UI polish, builder |
| **P1** | API: list/get plans & runs, create run, enable/disable plan, HITL approve | Drag-drop editor |
| **P2** | `@kit/flows-ui` + example-web `/admin/flows` (timeline, status, toggle) | Agent invents prod plans without review |
| **P3** | Create/edit plan in UI or agent-draft → check → human save | Full n8n parity |

Enable/disable = plan flag (`enabled`); does not delete history. Kill/cancel run = best-effort Workflow terminate API where available.

### D6 — Incubation & promote gate

| Gate | Rule |
|---|---|
| **Incubate** | Allowed in temporary `apps/` playground **or** short-lived external dogfood — must not block kit green indefinitely |
| **Promote `@kit/flows`** | Schema stable + `example-api` + **one** product (or second example path) call site **or** this ADR accepted + implementation PR series |
| **No empty packages** | No `@kit/flows` stub without runner + tests (AGENTS package rule) |
| **Banlist** | Product domain compounds never under `packages/**` |

Ops-only Roxabi plans (standup, founder digests) = **product/ops app** consuming the kit — not kit default plans.

### D7 — Explicit non-goals (this ADR)

- Porting Nika CLI / AGPL engine into Workers  
- Replacing FastMCP / `McpAgent` product MCP surfaces  
- Cloudflare OS gadgets as default kit shell  
- Visual workflow builder as P0  
- Multi-repo split of `@kit/flows` (stays monorepo kit)

## Consequences

### Positive

- Clear home for agentic orchestration in Chemin A  
- Products get console + governance without inventing runners  
- Aligns durable work with CF Workflows billing/ops model  
- Keeps extractibility: examples + packages, domain in apps  

### Negative

- Non-trivial surface (schema, runner, UI, tenant) — multi-PR  
- Workflows + D1 + AI Gateway ops cost to document  
- Risk of overbuilding builder before engine solid (process: phases)  

### Neutral

- `@kit/jobs` (Queues/cron helpers P1) may later **trigger** flows; flows own multi-step AI plans  
- Dynamic Workflows lib reserved for advanced multi-tenant code loading  

## Anti-patterns

- Product plan copy in `@kit/flows` defaults  
- Ambient tool access (all MCP tools on every run)  
- `waitUntil` multi-day pipelines instead of Workflows  
- Claiming “agentic ready” = chat only without plans/runs/permits  
- God `example-api` handler with inline YAML parse + LLM + R2  

## Related

- [ADR-0001](./0001-primary-axis-packages-compose-apps.md) — packages compose apps  
- [ADR-0002](./0002-session-hmac-interim-vs-better-auth.md) — dual credential  
- [ADR-0003](./0003-multi-tenant-rbac-modules.md) — org scope  
- CF: [Workflows](https://developers.cloudflare.com/workflows/), [Agents + Workflows](https://developers.cloudflare.com/agents/), AI Gateway  
- Concept refs (not deps): [Nika](https://nika.sh/), CF OS Gatekeepers, Consensys c0 workflows (patterns only)  
- Tracking: [GitHub #16](https://github.com/Roxabi/roxabi-cf-template/issues/16)  
