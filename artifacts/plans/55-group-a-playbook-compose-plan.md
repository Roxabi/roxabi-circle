---
title: "Plan: Group A — playbook compose + foreign-org CI + env:check honesty + deploy checklist"
issue: 55
spec: artifacts/specs/55-group-a-playbook-compose-spec.md
complexity: 4/10
tier: F-lite
generated: 2026-08-01
status: approved
---

## Summary

Docs-only rewrite so product bootstrap defaults to the **compose `@gosilex/*` spine**, teaches live **`CI_APP_*`** for foreign orgs, documents **env:check = example-api only**, and adds a **pre-deploy checklist**. Four sequential micro-tasks (one doc-writer instance + one tester gate); no runtime code.

## Architecture

**Data flow:** [Author → docs → eng](../visuals/55-group-a-playbook-compose-data-flow.html)  
**File map:** [Files × tasks](../visuals/55-group-a-playbook-compose-file-map.html)

## Bootstrap Context

- Worktree: `.claude/worktrees/55-group-a-playbook-compose`
- Branch: `feat/55-group-a-playbook-compose`
- Frame + spec approved on branch
- Live CI names: `CI_APP_ID` / `CI_APP_PRIVATE_KEY` (not `GOSILEX_CI_APP_*`)

## Agents

| Agent | Instance | Tasks | Files |
|-------|----------|-------|-------|
| doc-writer | doc-writer-A | T1–T3 | playbook, contract, CI setup, testing.md, check-env header |
| tester | tester-A | T4 | verify greps + `validate:full` (or docs-safe subset if full too heavy) |

## Wave Structure

2 waves, max 1 parallel agent (sequential docs). Elapsed ~1 short session.

| Wave | Trigger | Agents | Tasks |
|------|---------|--------|-------|
| 1 | start | doc-writer-A | T1 → T2 → T3 |
| 2 | Wave 1 done | tester-A | T4 (RED-GATE) |

### Budget — per task

| Task | Items | Class | Est. ops | Split? |
|------|-------|-------|----------|--------|
| T1 | playbook compose rewrite | judgmental | 6 | — |
| T2 | foreign-org CI_APP_* across 3 docs | bounded | 4 | — |
| T3 | env:check + deploy checklist | bounded | 3 | — |
| T4 | verify SC greps + validate | bounded | 3 | — |

**Total estimated ops: ~16**

### Budget — per agent instance

| Instance | Tasks | Σ ops | Subjects | Split? |
|----------|-------|-------|----------|--------|
| doc-writer-A | T1–T3 | 13 | playbook, contract, env | — |
| tester-A | T4 | 3 | verify | — |

## Consistency Report

| | |
|--|--|
| Covered SC | SC1–SC10 via T1–T4 |
| Uncovered | none |
| Untraced tasks | none |
| Exemptions | no runtime tests (docs-only) |

## Micro-Tasks

### Slice S1 — Compose spine playbook

#### T1 — Rewrite playbook default architecture (compose spine)

| Field | Value |
|-------|-------|
| Description | Rewrite `docs/playbooks/start-product.md` so default path is compose `@gosilex/*` (Hono `createApp`, core packages); anti bare `ExportedHandler` dual stack; anti full SaaS clone as default; link ADR-0001 + axis test prose; multi-tenant BA/RBAC/feedback **opt-in only**; `cp -R example-*` last-resort + strip list |
| File path | `docs/playbooks/start-product.md` |
| Code snippet | New sections: `## Architecture default (compose)`, `## Last resort: copy examples`, link to `../architecture/adr/0001-primary-axis-packages-compose-apps.md` |
| Verify | `grep -n 'compose\\|ADR-0001\\|createApp\\|last.resort\\|ExportedHandler' docs/playbooks/start-product.md` |
| Expected | compose + ADR + createApp + last-resort language present; bare dual-stack discouraged |
| Time | 8 min |
| `[P]` | N |
| Agent | doc-writer |
| Agent instance | doc-writer-A |
| Subject | playbook |
| Spec trace | SC1–SC4 · U1–U4 · S1 |
| Slice | S1 |
| Phase | GREEN |
| Difficulty | 3 |

### Slice S2 — Foreign-org CI_APP_*

#### T2 — Foreign-org checklist + CI_APP_* names

| Field | Value |
|-------|-------|
| Description | Add foreign-org section: same kit contract names **`CI_APP_ID`** / **`CI_APP_PRIVATE_KEY`**, org-local App, evaluate-only until set; update playbook config table (replace any `GOSILEX_CI_*`); align contract + `gosilex-ci-app-setup.md` checklist “first product on foreign org” |
| File path | `docs/playbooks/start-product.md`, `docs/product-consumer-contract.md`, `docs/gosilex-ci-app-setup.md` |
| Code snippet | Checklist bullets + table row for foreign org |
| Verify | `grep -n 'CI_APP_ID\\|CI_APP_PRIVATE_KEY\\|foreign' docs/playbooks/start-product.md docs/product-consumer-contract.md docs/gosilex-ci-app-setup.md` and `! grep -n 'GOSILEX_CI_APP_' docs/playbooks/start-product.md docs/product-consumer-contract.md docs/gosilex-ci-app-setup.md` (or only migration notes) |
| Expected | primary names = CI_APP_*; no GOSILEX_CI_APP_* as primary teaching |
| Time | 6 min |
| `[P]` | N (depends T1 for playbook continuity) |
| Agent | doc-writer |
| Agent instance | doc-writer-A |
| Subject | contract |
| Spec trace | SC5–SC6 · U5 · S2 |
| Slice | S2 |
| Phase | GREEN |
| Difficulty | 2 |

### Slice S3 — env:check + deploy honesty

#### T3 — env:check example-only + deploy checklist

| Field | Value |
|-------|-------|
| Description | Playbook + `docs/testing.md` CP-ENV: kit `env:check` = **example-api only**; product owns env inventory later. Tighten `scripts/check-env-sync.ts` header if needed. Add playbook “before first deploy”: never `ENVIRONMENT=development`; CF secrets for BA/session; CORS not localhost |
| File path | `docs/playbooks/start-product.md`, `docs/testing.md`, `scripts/check-env-sync.ts` |
| Code snippet | CP-ENV row + deploy checklist section |
| Verify | `grep -n 'example-api\\|env:check\\|ENVIRONMENT\\|CORS' docs/playbooks/start-product.md docs/testing.md` |
| Expected | example-only claim + deploy bullets present |
| Time | 5 min |
| `[P]` | N |
| Agent | doc-writer |
| Agent instance | doc-writer-A |
| Subject | env |
| Spec trace | SC7–SC8 · U6–U7 · S3 |
| Slice | S3 |
| Phase | GREEN |
| Difficulty | 2 |

### RED-GATE (all slices)

#### T4 — Verify SC1–SC10 + validate:full

| Field | Value |
|-------|-------|
| Description | Run greps for SC1–SC8; confirm no product package names added to scripts; run `bun run validate:full` (docs-only must stay green) |
| File path | (verification) |
| Code snippet | n/a |
| Verify | See commands below |
| Expected | all greps pass; validate:full exit 0 |
| Time | 10 min |
| `[P]` | N |
| Agent | tester |
| Agent instance | tester-A |
| Subject | verify |
| Spec trace | SC1–SC10 |
| Slice | S1–S3 |
| Phase | RED-GATE |
| Difficulty | 2 |

**T4 verify commands:**

```bash
# compose / ADR / last-resort
grep -E 'compose|ADR-0001|createApp|last.resort' docs/playbooks/start-product.md
# CI names
grep -E 'CI_APP_ID|CI_APP_PRIVATE_KEY' docs/playbooks/start-product.md docs/product-consumer-contract.md docs/gosilex-ci-app-setup.md
# no primary GOSILEX_CI_APP in target docs (allow historical migration note)
! grep -E 'GOSILEX_CI_APP_' docs/playbooks/start-product.md || true
# env + deploy
grep -E 'example-api|env:check|ENVIRONMENT' docs/playbooks/start-product.md docs/testing.md
bun run validate:full
```

## Task Seeding Blueprint

<!-- Used by /implement to seed TaskCreate calls on session start.
     Format: T{n} | agent-instance | blockedBy | subject -->

### Wave 1 — no deps (sequential on doc-writer-A)

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T1 | doc-writer-A | — | playbook |
| T2 | doc-writer-A | T1 | contract |
| T3 | doc-writer-A | T2 | env |

### Wave 2 — after Wave 1

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T4 | tester-A | T3 | verify |

## Task IDs

<!-- Filled on plan approval -->
- T1: pending — playbook
- T2: pending — contract
- T3: pending — env
- T4: pending — verify
