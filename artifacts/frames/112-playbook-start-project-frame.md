---
title: "Docs — playbook start projet (Auth/RBAC/MasterData/UI/tokens)"
issue: 112
status: approved
tier: F-lite
date: 2026-08-04
spark: "silex#88"
parent_spark: "silex#84"
---

## Problem

Starting a GOSILEX product on Chemin A still requires tribal knowledge for the foundation stack: Better Auth flows/env/guards, RBAC matrix and check points, MasterData conventions, Hono layer/envelope patterns, shadcn shell, and design tokens. Spark **#84** (Plugins) defines the opinionated playbook; Spark **#88** / GH **#112** is the boilerplate half — a kit-side guide branched on the real monorepo.

Residual (triage 2026-08-03): `docs/playbooks/start-product.md` + `fork-to-first-issue.md` already ship zero-edit consumer compose and fork flow. They are **not** the full foundation checklist (Auth → epics → DoD). Missing: `docs/playbooks/start-project.md` (or equivalent named guide) with copiable checklists, epic-split template, and cross-links — without duplicating #84 or re-authoring consumer contract.

## Who

- **Primary:** Eng (or agent) spinning a new `go-silex/<product>` (or foreign-org) repo on this kit as `upstream`.
- **Secondary:** Lucy / agents executing start-project playbooks; founders reviewing DoD “projet starté”.

## Constraints

- Kit-only docs under `docs/playbooks/` (+ light README / index cross-links). **0 product domain strings.**
- Compose, not dual-edit: point at live packages/examples (`@gosilex/auth`, ADR-0002/0003, `example-*`) — do not invent a second stack.
- Cross-link existing playbooks (`start-product`, `fork-to-first-issue`, product-consumer-contract) — complete residual gaps, do not rewrite B5 consumer path.
- Parent Spark **#84** lives on Plugins; this issue ships the **boilerplate** SSoT; avoid infinite duplication.
- Docs-only change; no runtime package / API surface required for this slice.

## Out of Scope

- Implementation of a concrete client product.
- Skill in `silex-plugins` (optional later; kit doc is the P0 deliverable).
- Full MasterData package code (conventions + pointers only; B6 patterns remain reference).
- Replacing or forking `start-product.md` zero-edit contract.
- OAuth GitHub product flows beyond “product later” notes already in AGENTS.

## Premise Validity

**Success in 6 months:** A dev cloning the kit can open one playbook and complete Auth/RBAC/MasterData/Endpoints/UI/tokens + epic split + DoD checklist without rediscovering seams from AGENTS.md archaeology or stale epic tickets.

**Failure in 6 months:** New products still bootstrap via copy of `example-*` + Slack DMs; foundation checklists missing or only point at closed epics (B6/B5) without actionable steps; residual “partial” stays forever.

**Simplest alternative:** Rename `start-product.md` → `start-project.md` and close the ticket.
**Why not simplest:** `start-product` is the **zero-edit consumer compose** path (upstream remote, deny-push, apps composition). Ticket #88 wants the **opinionated foundation checklist** (Auth→tokens→epics→DoD) as companion, not a rename of the consumer contract playbook.

## Complexity

**Tier: F-lite** — single domain (docs/playbooks), clear residual vs already-shipped companions, no new architecture.

Signals: docs-only · residual partial explicit · single package of deliverables · user-selected F-lite via `/dev`.
