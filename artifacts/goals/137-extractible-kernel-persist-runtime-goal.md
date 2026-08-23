---
title: "Goal — Extractible kernel persist+runtime stratum"
status: ready-for-goal
priority: P0
date: 2026-08-24
repo: Roxabi/roxabi-boilerplate-cf
issue: 137
related_issues:
  - 137
  - 138
  - 139
  - 140
  - 142
  - 143
  - 144
sibling_out_of_goal:
  - 141
related_adrs:
  - docs/kit/architecture/adr/0001-primary-axis-packages-compose-apps.md
  - docs/kit/architecture/adr/0003-multi-tenant-rbac-modules.md
  - docs/kit/architecture/adr/0005-flows-platform-agentic-workflows.md
  - docs/kit/architecture/adr/0008-kit-schema-identity-product-compose.md
  - docs/kit/architecture/adr/0012-kernel-persistence-request-context.md
origin: architecture review 2026-08-23
---

# Goal 137 — Extractible kernel persist+runtime

## One-liner

> A product engineer composes kit-generic tables, org middleware and the FlowRun driver from `@kit/*` — without copying `example-api` runtime — and `extract-dry-run` proves a temp compose, not the inverse « examples import packages ».

## JTBD

| Who | Job |
|---|---|
| Kit maintainer | Price the extractible-kernel claim to instantiated code |
| Product eng | `import` schema + `requireOrgContext` + runner the way they already import `@kit/auth` |
| Agent | One program, one concern per `/ship`, no `/dev` HITL theater |

## Why now

Architecture review 2026-08-23 (Opus 5 + adversarial + 5 slices): S1 is **fatal on the claim scale**. `@kit/*` is a pure-logic kernel. Tenancy/runtime live in non-extractible `apps/example-api`. Root cause: `packages/db/src/index.ts:3` — *« Schemas live in apps. »*

**Severity scales (do not mix):**

| ID | Scale | σ |
|---|---|---|
| S1 (this goal) | claim-kill | fatal — *extractible* is false for tenancy/runtime |
| RT-01 / I3 policy-mint | exploitability | major — not this goal's exploit bar |

## Locked decisions

| ID | Decision |
|---|---|
| D1 | Process = **option B**: goal SSoT + issue AC + `/ship` per child. **Never `/dev` on #137 or its F-full children.** Never mint `status: approved` frame/spec/plan to skip HITL. |
| D2 | Program exit = **#144 closed** (claim machine-true). First increment = **#142 closed**. Wave 0 ≠ S1 killed. |
| D3 | After #142 `/ship` + auth/migrations review → **auto-enchaîner #143 puis #144**. |
| D4 | **#141 out.** Sibling under #16. Parallel `/ship` allowed. Do not sequence, mix PRs, or block #139/#142. |
| D5 | **S5:** promote `apps/example-api/migrations/*` applied bytes. Discard drifted `packages/*/migrations` sketches (composite FK `(plan_id, org_id)` vs single-column `plan_id`). |
| D6 | `#139` ADR-0012 **accepted** 2026-08-24 (operator delegated authority on this goal session). `#142` may start. |
| D7 | One concern per `/ship`. Docs ≠ ADR ≠ hygiene ≠ schema ≠ runner ≠ dry-run. |
| D8 | Every child lands via `/ship`. No naked push to `main`. |
| D9 | Closing #137 does **not** flip platform-proof D3 or JTBD-platform to met. Those need named tenant + HITL + second compose. |
| D10 | INV-04 (`api_keys.organization_id NOT NULL`) and INV-03 (`demo_*` org-scope) are **new catalog ids**, not part of the mechanical promote. Prefer split from #142 if they need new applied SQL. |
| D11 | Tenancy/RBAC tables: default **expand `@kit/auth/schema`** + `@kit/auth/hono`. New `@kit/orgs` only if file-length/folder-size forces it. **No tables in `@kit/db`.** |

## Process — replace `/dev` HITL

```text
Wave A (full-auto, no invariant bake):
  #138 docs honesty     implement → /ship     (open PR #146)
  #140 hygiene          optional ∥ if still chore-only
  #141 infer vs invoke  optional sibling under #16 — not this goal

Wave B (human-gated):
  #139 ADR              /ship as status: proposed  → STOP
                        human: accept 0012 (accepted + normative: true)
  #142 schema/hono      only after that flip + auth/migrations review
  #143 runner           auto after #142 /ship
  #144 extract-dry-run  auto after #143 /ship
```


**Remaining human gates**
1. Accept this goal (done 2026-08-24: exit=#144, auto-chain after #142, launch=#138∥#139).
2. ADR-0012 flipped to `accepted` + `normative: true` (delegated 2026-08-24).
3. Each `/ship` review (agent + `reviewed` + CI green).
4. #142 extra: human review auth / ACL / migrations (constitution).
5. #143 extra: confirm snapshot-only + org fail-close on the moved driver.

**Forbidden:** `/dev #137`, `/dev --from implement`, fake-approved artifacts, kitchen-sink PR.

## Staged binary exits

| Stage | Issues | Consumer gets | Not yet |
|---|---|---|---|
| **Wave A** | #138 (+ #140 if chore) | Honest D3/I3/I7. No ADR authority change. | Claim still false. |
| **Wave B pin** | #139 **proposed** | Decision text on disk; ADR-0008 D3 still binding | Not accepted. #142 forbidden. |
| **Slice 1** | #142 after human accept | Compose schema+repos+`requireOrgContext` from `@kit/*` | Still copy ~709 LOC FlowRun driver. extract-dry-run theater. |
| **Program exit** | #143 then #144 | Driver is a package export; extract-dry-run proves temp compose | D6 second call site, HITL, policy mint, named tenant, JTBD-platform |

## Wave graph

```text
#138 docs honesty          Wave A — merge anytime
#140 hygiene               Wave A optional
#141 infer (parent #16)    Wave A optional sibling — not this goal

#139 ADR-0012 proposed     Wave B — /ship then STOP
        │  human accept (accepted + normative: true)
        ▼
#142 promote applied schema/repos/hono
        │
        ├─► #143 FlowRun driver → @kit/flows
        │         │
        │         └─► #33 console (existing — not this goal)
        │
        └─► #144 extract-dry-run compose proof
```

## Slice pin — #142 (F-full sketch)

**(a) Boundaries**

| Module | Owns |
|---|---|
| `@kit/tasks/schema` · `@kit/comments/schema` · `@kit/flows/schema` | Capability tables |
| `@kit/auth/schema` (+ `./hono`) | Tenancy/RBAC + `requireOrg*` |
| `@kit/db` | Handle + types + chunking — **no tables** |
| `apps/example-api` | `demo_*` + thin Env / wrangler apply path |

**(b) Data flow** — product compose `{ ...kitSchema, ...productTables }` → kit repos take `KitDb` → Hono middleware from `@kit/auth/hono`.

**(c) State** — applied D1 journal stays the product apply path until wrangler is retargeted; kit-schema-sync hashes **promoted applied bytes**, never sketches.

**(d) Integration** — `kit-schema-sync`, `check-wrangler-migrations-dir.sh`, IDOR tests (plan/run/task/comment/key).

**S5 copy direction:** `apps/example-api/migrations/0012_flows_plans_runs.sql` (composite FK) → package / catalog. Delete or retire `packages/flows/migrations/0001_flows_plans_runs.sql`.

## Slice pin — #143 (move, don't redesign)

Export existing `drive` / `persist` / `invoke-step` / `infer-step` / `ports`. App keeps only `WorkflowEntrypoint` + wrangler `[[workflows]]`. Persist talks to kit flow tables. Snapshot-only (`parseRunnerView`; never reread live `flow_plans`). Do not bind infer unless #141 already did. Stay incubating (D6 unmet).

## Binary program exit (DoD)

Goal **exits** when **all** are true:

1. [ ] #138 merged — D3 one-liner honest; I3 split; I7 fenced; #16 body matches shipped #30/#31
2. [ ] #139 accepted + `normative: true` + indexed; ADR-0008 D3/D4 amended by this ADR
3. [ ] #142 merged — no kit-generic table declared only in `example-api`; applied composite-FK is promote SSoT; org middleware is `@kit/auth/hono`
4. [ ] #143 merged — driver is a `@kit/flows` export; snapshot-only + org fail-close hold
5. [ ] #144 merged — `extract-dry-run` fails if kit-generic schema/middleware re-declared under `apps/example-api`; temp compose typechecks + one org-scoped request
6. [ ] Each of the above has a `/ship` PR (URL in exit note)
7. [ ] `validate:full` green on kit
8. [ ] platform-proof D3 / JTBD-platform still **Not met** (named tenant + HITL + second compose remain)

**Not required:** `#141`, `#140` if deferred, `#32` HITL, `#33` console, `@kit/agents`, second product app, policy mint.

## Security pins

| Pin | Rule |
|---|---|
| S5 | Never promote sketches that lost composite `(plan_id, org_id)` |
| I1/I2/I4 | Grants narrow-only; snapshot-only; fail-closed empty permits — must survive the move |
| IDOR | Org-scoping tests still pass after #142/#143 |
| INV-03 | New catalog id **or** D8 scope narrowed — not a silent sketch promote |

## Anti-goals

- `/dev` on the epic or F-full children
- Kitchen-sink PR (#142+#143+#144)
- Folding #141 into this close definition
- Baking ADR-0012 as accepted, or starting #142, without an explicit human accept
- Declaring JTBD-platform met from example-api
- Creating `@kit/tenancy` / putting tables in `@kit/db` without ADR
- Leaving drifted sketches on a hashable promote path


## Next command
```text
#138  /ship PR #146          ← Wave A, merge anytime
#139  /ship PR #147          ← Wave B start: ADR proposed, then STOP
#140  optional ∥ Wave A
#141  optional sibling #16 — not this goal
#142  FORBIDDEN until ADR-0012 accepted by a human
```
