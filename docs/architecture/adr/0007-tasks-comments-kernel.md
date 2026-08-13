---
title: 'ADR-0007 — Tasks + comments as kit capability (incubating)'
status: accepted
normative: true
date: 2026-08-11
axial: false
related:
  - docs/architecture/adr/0001-primary-axis-packages-compose-apps.md
  - docs/architecture/adr/0003-multi-tenant-rbac-modules.md
  - packages/tasks/
  - packages/comments/
---

# ADR-0007 — Tasks + comments as kit capability (incubating)

## Context

Multiple products need a **work-item** core:

| Product | Signal |
|---------|--------|
| **Metalyde** | Boards, visibility staff/client, assignees, sub-work |
| **Ether** (2026-08-10) | Project → phase → task + subtasks, dependencies, livrables later |
| **CompanyOS / Spark** | Single `Task` table, links parent/blocks, `internal` hide-client |

CompanyOS docs candidated `@kit/work`; operator choice: package name **`@kit/tasks`**, module id **`tasks`**.

Without a pure kit model, each product reimplements visibility, stages, and link cycles (N×M).

## Decision

### D1 — Packages

| Package | Role |
|---------|------|
| **`@kit/tasks`** | Pure: Zod task/stage/link, visibility, opaque scope, link rules, stage helpers, optional mutation hooks |
| **`@kit/comments`** | Pure: multi-target comments (`target_type` + `target_id`), same visibility enum |

No Worker bindings, no D1/Drizzle in packages. Apps apply SQL + routes (same pattern as `@kit/flows`).

### D2 — Task model (kernel)

- **`org_id` NOT NULL** (tenant spine ADR-0003)
- **Stages table**: `board_key` + stage rows (`position`, `is_default`, `is_terminal`); task has `stage_id`
- **`visibility`**: `internal` \| `shared` (not free-world “public”)
- **Opaque scope**: optional `scope_kind` + `scope_id` (both or neither) — product vocab (`project`, `client`, …); kit never interprets
- **Assignees**: M2M user ids
- **Links**: `parent` \| `blocks` \| `duplicates` — cycle check per kind; single incoming parent
- **No intake_status** in kit (product-only if needed)
- **No resource links** until a resource system exists
- **No recurrence** in V0
- **Project / phase / poles / GitHub** = product-only

### D3 — AudiencePort

Visibility enforcement uses **`staff` \| `external`**, resolved by the **product** (not hardcoded kit role names). Pure helpers: `canViewTask`, `filterTasksForAudience`.

Apps **must** apply filter on every list/get (object ACL after module ACL — ADR-0003 D12).

### D4 — Comments

- Target: open `target_type` string (known: `task`, `project`, …) + `target_id`
- Visibility: same `internal` \| `shared`
- Compose: `taskCommentTarget(taskId)` helper

### D5 — Module ids

- `TASKS_MODULE_ID = 'tasks'`
- `COMMENTS_MODULE_ID = 'comments'` (optional separate enable; dogfood may co-enable)

### D6 — Incubate vs promote

| | |
|--|--|
| **Incubate** | Pure packages + tests + sketch SQL; usable by products |
| **Dogfood** | example-api/web (later tranche): migration, module ON on demo org |
| **Promote** | Schema stable + example green + **first real product compose** (Ether or Metalyde) |

Package.json: mark incubating until promote. ADR presence ≠ promote (same class as flows D6).

### D7 — UI

Do **not** extract Metalyde task UI. Missing chrome comes from **shadcn** into `@kit/ui` (Date Picker, Combobox multi, …) in a later tranche. Kanban = product/example composition.

### D8 — Side-effects

Optional `TaskMutationHooks.afterMutation` only — apps own single write path and notif/audit (Spark ADR-005 lesson).

## Consequences

- Products map Ether project / Metalyde client → `scope_*`; boards → `board_key` + stages seed
- Resource attach waits for resource rail (CompanyOS pilier 03 / storage)
- Parallel to flows P0-incubating (operator priority: both)

## Non-goals

- `@kit/tickets` Spark schema dump  
- Poles / creative subcategory / MER  
- Intake approval workflow in kit  
- Resource kind closed enum in kit  
