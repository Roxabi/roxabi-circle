---
title: "Platform proof — multi-tenant capability kernel"
status: active
date: 2026-08-07
ssot: true
related:
  - AGENTS.md (Mission · Direction)
  - docs/kit/architecture/adr/0001-primary-axis-packages-compose-apps.md
  - docs/kit/architecture/adr/0003-multi-tenant-rbac-modules.md
  - docs/kit/architecture/adr/0005-flows-platform-agentic-workflows.md
  - docs/kit/product-consumer-contract.md
---

# Platform proof — multi-tenant capability kernel

**SSoT** for *when the platform JTBD is met*.  
Not a roadmap, not an ADR, not an issue-bound working note.

| | |
|---|---|
| **Kit language (normative)** | Multi-tenant **capability kernel** — packages products compose |
| **Product / stretch alias** | *Company OS+++* — product-facing only · never kit ship claim |
| **Machine P0 (always wins)** | JTBD-dev — green `example-*` · banlist · zero-edit · [AGENTS.md](../../../AGENTS.md) |
| **This doc** | Falsifiable bars for **JTBD-platform** only |

**Conflict rule:** kit extractibility + bar machine + [ADR-0001](./adr/0001-primary-axis-packages-compose-apps.md) beat this proof if they conflict. Proof **does not** authorize new packages without [ADR-0005](./adr/0005-flows-platform-agentic-workflows.md) **D6**.

---

## Status

| Bar | Status | Evidence |
|---|---|---|
| **D1** Kit clone green | **Met by design** when CI / `validate:full` green | kit gates |
| **D2** Tenant shell | **Partial** — multi-tenant Phase A in kit; product tenant TBD | ADR-0003 · example seed |
| **D3** Governed plan E2E | **Not met** — pure `@kit/flows` only; no durable product run | ADR-0005 · #29–#32 |
| **Second compose** | **Not met** | needs 2nd product call site |
| **Platform JTBD** | **Not met** until D2+D3+second compose (or explicit waiver) | this table |

**Non-claim (always):** multi-tenant Phase A + pure `@kit/flows` + MCP example **≠** platform JTBD met **≠** “Company OS” shipped.

---

## Named dogfood tenant

| Mode | Role for this proof |
|---|---|
| `example-*` | Synthetic only — **does not** price platform JTBD |
| zero-edit product repo | Consumer contract only — [product-consumer-contract](../product-consumer-contract.md) |
| **Internal product deploy** | **Only** mode that can mark platform JTBD met |

**To designate (fill when chosen):**

| Field | Value |
|---|---|
| Product repo | _TBD — e.g. Roxabi ops product / Silex client / permanent product-dogfood_ |
| Org | `kind=internal` (or named client org) · **not** kit demo seed alone |
| Deploy unit | One product Worker + D1 (org space = this deploy only) |
| Single workflow under test | _TBD — one plan that exercises grant∩ + snapshot + side-effect/HITL path_ |

Until the table is filled, platform JTBD stays **open**. Kit work continues under ADR-0005 children without claiming “OS proved.”

---

## Acceptance criteria

### D1 — Dev (kit) — always required, never replaced by platform work

- [ ] `example-api` + `example-web` + `mcp-example` green (lint · typecheck · test)
- [ ] 0 product métier strings under `packages/**` and `apps/example-*/**` (banlist / extract)
- [ ] Zero-edit + deny-upstream gates green on consumer path when exercised

### D2 — Tenant shell (org + modules)

- [ ] Invite / membership → org context enforced (`organization_id` fail-closed)
- [ ] Module enable path works for a platform module used by flows (or seed module)
- [ ] Dual-auth cookie session **or** org-bound `sk_` as required by product surface

### D3 — Governed automation (one org-scoped plan)

All of the following on the **named dogfood tenant** (not only unit tests in pure package):

- [ ] Plan authored (YAML MVP OK) → parse → Zod → `check(plan, grants, registry)` pass
- [ ] Grants minted **server-side** from session / org module policy (never plan body / client / agent self-describe)
- [ ] Permits only **narrow** grants; empty/absent + effectful = fail-closed
- [ ] Create-run produces **immutable snapshot**; runner executes snapshot only
- [ ] Durable execution via **CF Workflows** (no ad-hoc DO workflow engine as default)
- [ ] Admin (or principal) gate for V0 create/run as per ADR-0005
- [ ] Side-effect path: HITL **principal-bound** (session/`sk_` + org admin V0) — no unauthenticated Workflow continue
- [ ] Observable run (list or detail + step outcome / receipt)

### Second compose (axis proof)

- [ ] A **second product** (or second app call site outside pure package tests) composes `@kit/auth` + modules + `@kit/flows` runner **without forking** the runner or copying D1 run tables into a local god module
- [ ] Promote gate [ADR-0005 D6](./adr/0005-flows-platform-agentic-workflows.md): schema stable + example dogfood + **second call site**

### Agents (after D3 — not part of platform JTBD v0)

- [ ] MCP / tools share **registry ∩ grants** with flows when both present
- [ ] No `@kit/agents` package until D3 + second call site + spend meter for multi-step tool loops
- [ ] Code-mode: **product opt-in only** · never kit default

---

## Non-goals (90 days / until platform JTBD met)

| Out | Why |
|---|---|
| Ship Cloudflare OS / gadget shell / per-file apps in kit | Axis + ADR-0005 D7 |
| End-user coding agent in kit defaults | Isomorphism + threat surface |
| Claim “Company OS+++ shipped” from kit green alone | Vacuous success |
| Ambient tool registries / `net`·`r2` permits without wrappers | Security defaults banlist |
| Product domain or company context monorepo inside kit | Zero-edit / extract |
| Cross-product single `org_id` fabric | Isolation = **deploy × org** only |
| New agent pillar packages without D6 | Unbounded incubation |

---

## Invariants (pointer)

Normative short list lives in [AGENTS.md](../../../AGENTS.md), under
“Direction — multi-tenant capability kernel” and “Seven invariants”.
Normative security detail for flows: [ADR-0005](./adr/0005-flows-platform-agentic-workflows.md) D3–D6.

Steal patterns only with multi-tenant rebind (grants ∩ permits ∩ registry · principal HITL · metered AI Gateway · enforced connectors).

---

## How to mark “met”

1. Fill **Named dogfood tenant** table.  
2. Check **D2 + D3 + Second compose** with links to PRs / runs / product repo paths.  
3. Update **Status** table at top (`Met` + evidence).  
4. Optionally note date in git history — no separate “release” of an OS.

Until then: ship ADR-0005 children (#29–#31+), keep D1 green, **do not** expand Mission language into implement-now agent packages.
