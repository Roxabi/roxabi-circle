---
title: 'ADR-0005 — Flows platform: governed plans + durable runs (agentic SaaS kit)'
status: accepted
date: 2026-08-05
amended: 2026-08-06
related:
  - docs/architecture/adr/0001-primary-axis-packages-compose-apps.md
  - docs/architecture/adr/0002-session-hmac-interim-vs-better-auth.md
  - docs/architecture/adr/0003-multi-tenant-rbac-modules.md
  - packages/ (target @kit/flows, later @kit/flows-ui)
  - Cloudflare Workflows / AI Gateway
  - 'GitHub #16'
  - artifacts/reviews/16-adversarial.md
---

# ADR-0005 — Flows platform for agentic SaaS (Chemin A)

## Status

**Accepted** (2026-08-06) — direction + normative security AC after adversarial review (`artifacts/reviews/16-adversarial.md`). Implementation tracks **#16** children (#27–#36), phased P0–P3.

> Pre-amendment text was `proposed`. Amend incorporates: grant∩permits, run snapshot, YAML MVP, admin-only V0, deferred `agent`/net/r2 until enforced.

## Context

SaaS “3.0 agentic-ready” needs more than chat: **repeatable work** that is:

1. **Declared** as a reviewable plan (intent as code — Nika-like)
2. **Governed** (authority from **grants**, plan permits only **narrow**; default-deny)
3. **Checked** before spend (schema, DAG, tools, ceilings) **and** metered at runtime where dynamic
4. **Durable** across failures and human waits (Cloudflare Workflows)
5. **Observable** (list runs, step timeline, enable/disable plans)
6. **Authorable** — **YAML MVP** for digestible plans; UI create/edit later (P3)

Without a kit axis, products invent Cron + Queue + ad-hoc agent loops → N×M drift, no shared console, no shared security model.

**Out of scope for this ADR:** shipping Cloudflare OS as kit; embedding Nika’s Rust binary; visual n8n builder day-1; product-domain plan strings inside packages.

### External inspiration (not dependencies)

| Source | Steal | Refuse |
|---|---|---|
| **Nika** / nika-spec | Intent-as-code, `check` before spend, permits spirit, verbs, receipts | AGPL engine, full CEL, `exec` shell on Workers, conformance claim |
| **roxabi-factory** | `job_id`=run lifecycle, workerEngine ≠ harness, tool ACL, control-plane console patterns | NATS/Quadlet/Python runtime as kit default |

## Options considered

### Option A — Ops-only repo forever (`roxabi-flows` standalone)

- **Pros:** Fast iterate; zero kit zero-edit risk  
- **Cons:** Never extractible SaaS capability; dual-edit; no dogfood in `example-*`

### Option B — Full platform day-1 (builder UI + Gatekeepers + multi-tenant create for all roles)

- **Pros:** Vision complete early  
- **Cons:** Scope bomb; empty packages; blocks other kit work

### Option C — **Platform packages, phased** (chosen)

- **Pros:** Aligns ADR-0001; dogfood; products compose; room to incubate  
- **Cons:** Discipline required so ops/product plans stay out of `packages/*`

## Decision

### D1 — Capability = kit module (primary axis packages)

| Package (target) | Role |
|---|---|
| **`@kit/flows`** | **Shipped (pure):** plan schema (Zod), YAML load (MVP), `check()`, **grant∩permits**, tool registry interface, **run snapshot** types/helpers, access helpers. **Later (same package or app wire):** CF Workflows adapter (#30), D1 apply + models (#29), run lifecycle at API (#31) |
| **`@kit/flows-ui`** | Console shell (P2+): list plans/runs, detail + step timeline, enable/disable, HITL approve (no product copy) |

Apps compose packages:

- `apps/example-api` — routes + Workflows binding + dogfood tools + module seed  
- `apps/example-web` — `/admin/flows` dogfood (P2)  
- Products — same packages + **product tools + product plans** under `apps/<product>-*` only  

**Axial test (ADR-0001):** second product adds tools/plans in its app — it does **not** fork the runner or copy D1 run tables into a local god module.

**Promote:** incubate allowed; promote package surface when schema stable + example dogfood + **second call site** (product or second example path). Accepting this ADR licenses incubation — it does **not** alone justify an empty or single-consumer package forever.

### D2 — Runtime = Cloudflare Workflows (do not reimplement durable engine)

```text
YAML plan  →  parse (budget)  →  Zod  →  check(plan, grants, registry)
                                          ↓ pass
                               create-run snapshot (immutable)
                                          ↓
                               Workflow instance (run)
                                 step.do / sleep / waitForEvent
```

| Layer | Owner |
|---|---|
| Durable steps, retries, hibernation | **CF Workflows** |
| Plan language, grants∩permits, check, snapshot, tool allowlist | **`@kit/flows`** |
| LLM routing / budgets | **AI Gateway** (prod preferred) + env model ids + **runtime token meter** |
| Optional dynamic tenant code load | `@cloudflare/dynamic-workflows` only if product needs upload-and-run **code**; default = interpreted plans |

**Forbidden:** custom DO workflow engine when Workflows suffice; shell `exec` as first-class verb on Workers.

**Platform limits (normative awareness):** step result size, step count, single-threaded steps, Workers for Platforms hosting constraints. V0 schema **caps** tasks / payload policy (refs to D1/R2 preferred over large step returns). Document WfP incompatibility for products on dispatch namespaces.

### D3 — Plan contract (Nika-inspired, not Nika binary)

#### Authoring & storage

| Surface | Format | Rules |
|---|---|---|
| **Author / import (MVP)** | **YAML** | Human/agent digestible; required MVP path |
| **Canonical stored plan** | **JSON** (Zod-validated) | D1 body + digest; runner consumes this |
| Parse | safe-load only | Max bytes; no custom tags / merge bombs; fail closed before Zod |

Minimum plan surface (**flows v0**):

```text
flows: v0
plan:
  id · description?
  model? · max_tokens  # REQUIRED when any task uses infer
permits:
  tools: []          # V0 only — net/r2 deferred until enforced wrappers
tasks:
  <id>:
    after?: [taskId…]
    invoke?: { tool, args? }
    infer?:  { prompt, max_tokens?, model? }
# agent: deferred until runtime meter + step budget model exist
```

| Verb | Meaning on CF | V0 |
|---|---|---|
| `invoke` | Allowlisted tool from registry | **yes** |
| `infer` | Bounded LLM call (single-shot) | **yes** |
| `agent` | Leashed tool-loop | **deferred** (schema reject until meter ships) |
| `exec` | Shell | **never** on Workers kit |

- **`check(planInput, grants, registry)`** is pure: **re-runs Zod** on `planInput` (`unknown`), then unknown tools, DAG edges/cycles, missing/empty authority, tools outside **effective** allowlist, static token ceilings → fail **before** first token  
- **`grant.registryVersion`** required and must match registry; never silently default-filled on the snapshot  

- Plans in kit dogfood = **generic** (e.g. echo → infer summary) — **zero** Roxabi/Silex business strings in `packages/*`  
- Product plans live in product app, DB, or product-owned storage — not promoted into `@kit/*` as domain content  

### D4 — Security model (authority, dual auth, tenancy)

#### Authority split (adversarial fatal fix)

```text
org/admin capability grants  →  max power (tools registry subset)
plan.permits.tools           →  may only NARROW grants
effective = grants ∩ plan.permits ∩ registry
```

- **Absent or empty plan permits** with any effectful task (`invoke` **or** `infer`) → **fail-closed** at check (NEP-0003 spirit: no ambient authority)  
- Plan **cannot expand** beyond grants  
- **Grant provenance (app):** `CapabilityGrant` is pure arithmetic — apps MUST mint grants from server session / org module policy, never from plan or client body  
- Credentials never in plan body; tools use Worker bindings / secrets  
- **V0 permits fields:** `tools` only. Do not advertise `net`/`r2` until kit wrappers enforce them  
- **plan_digest:** content-address index only (not crypto integrity); sealed plan body is authoritative  

#### Authn / authz

| Concern | Rule |
|---|---|
| Authn transport | Session cookie **or** Bearer `sk_` (ADR-0002) |
| **V0 flows capability** | **Org admin** (or owner) only for create/edit/enable/create-run/HITL approve |
| Later | Open run (and optionally edit) to members / all users via grants |
| `sk_` V0 | Prefer **read** of runs/status; mint scoped keys before allowing create-run via API key |
| Multi-tenant | Every plan/run row **`org_id` NOT NULL**; list/detail enforce membership (IDOR tests from P0) |
| Module catalogue | Register **`flows`** in platform modules (ADR-0003); V0 = available + admin write path |
| Receipts | Redacted inputs/outputs; no secrets/tokens in D1 logs |

#### Run snapshot (adversarial TOCTOU fix)

On **create-run**, freeze and persist:

```text
plan_digest · sealed_plan_json · effective_permits · grant_snapshot
registry_version · ceilings · org_id · actor_id · created_at
```

- Runner **must** execute the **snapshot**, never the live plan row  
- Plan edits create a new version; in-flight runs unchanged  
- `enabled=false` blocks **new** runs; cancel/kill = best-effort Workflow terminate (document non-idempotent tool risk)

#### Runtime spend

- Static `check` ceilings are **necessary, not sufficient**  
- Every `infer` (and later `agent` turn) **meters tokens** and hard-aborts when ceiling crossed  
- Prod: prefer AI Gateway budget binding when available  

#### HITL (P1+)

- Human gate for side effects (email, revoke, external write)  
- **Not** raw unauthenticated `waitForEvent` from the internet  
- Approve only via app route: dual-auth + org admin (V0) + run membership; event body = **server-signed ticket** or D1 decision polled by Workflow  

### D5 — Product console surface (phased)

| Phase | Ship | Non-goal yet | Tracking |
|---|---|---|---|
| **P0** | Schema + YAML + `check` + grant∩ + snapshot + D1 + Workflows thin + Vitest + dogfood + admin helpers | UI, builder, `agent`, net/r2 | #28–#30 |
| **P1** | API list/create plan/run, enable/disable, HITL principal-bound | Drag-drop editor | #31–#32 |
| **P2** | `@kit/flows-ui` + `/admin/flows` | Agent invents prod plans without review | #33 |
| **P3** | Create/edit or agent-draft → check → human save | Full n8n parity | #34 |

### D6 — Incubation & promote gate

| Gate | Rule |
|---|---|
| **Incubate** | Temporary playground OK; must not block kit green indefinitely |
| **Promote `@kit/flows`** | Schema stable + `example-api` dogfood + **second call site** |
| **No empty packages** | No `@kit/flows` stub without check + tests |
| **Banlist** | Product domain compounds never under `packages/**` |

Ops-only Roxabi plans = **product/ops app** consuming the kit — not kit default plans.

### D7 — Explicit non-goals

- Porting Nika CLI / AGPL engine into Workers  
- Claiming Nika-spec conformance  
- Replacing FastMCP / `McpAgent` product MCP surfaces  
- Cloudflare OS gadgets as default kit shell  
- Visual workflow builder as P0  
- Multi-repo split of `@kit/flows`  
- Shell `exec` verb on Workers  
- Self-granted plan permits as sole authority model  

## Consequences

### Positive

- Clear home for agentic orchestration in Chemin A  
- Products get console + governance without inventing runners  
- Aligns durable work with CF Workflows  
- Adversarial holes closed in normative AC  

### Negative

- Multi-PR surface  
- V0 admin-only narrower than end-state “everyone”  
- Risk of overbuilding builder before engine solid  

### Neutral

- `@kit/jobs` may later **trigger** flows  
- Dynamic Workflows lib reserved for advanced code loading  

## Anti-patterns

- Product plan copy in `@kit/flows` defaults  
- Ambient tool access  
- **Self-granted permits without grant intersection**  
- **Runner reading live plan row after create-run**  
- `waitUntil` multi-day pipelines instead of Workflows  
- Claiming “agentic ready” = chat only  
- Unauthenticated Workflow continue as “HITL”  
- Advertising `permits.net` / `r2` before enforcement  

## Related

- [ADR-0001](./0001-primary-axis-packages-compose-apps.md) · [ADR-0002](./0002-session-hmac-interim-vs-better-auth.md) · [ADR-0003](./0003-multi-tenant-rbac-modules.md)  
- CF Workflows · AI Gateway · [Nika](https://nika.sh/) (concepts)  
- Adversarial: [`artifacts/reviews/16-adversarial.md`](../../../artifacts/reviews/16-adversarial.md)  
- Epic: [GitHub #16](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/16) · children #27–#36  
