# Quality Audit Strategy — Chemin A CF kit

**Repo:** `roxabi-boilerplate-cf`  
**Date:** 2026-08-12  
**Playbook:** adapted from `roxabi-plugins/playbooks/multi-agent-audit-playbook.md` v1.1  
**Scale:** ~317 TS/TSX source · 63 tests · **28 agents** (mid: 200–500 files) · wave size 4

## Scope

| In | Out |
|----|-----|
| `packages/*` (`@kit/*`) | `node_modules`, `dist`, `.wrangler` |
| `apps/example-*`, `apps/mcp-example` | Product-only repos (not in this tree) |
| `scripts/`, `tooling/`, `.github/workflows/` | Secrets / `.dev.vars` values |
| ADRs + AGENTS kit rules | Narrative product frame as implementation backlog |

**Goals:** pre-release quality gate · kit extractibility health · multi-tenant / auth security posture · tech-debt score.

## Primary axis (ADR-0001 · `axial: true`)

```
packages/*  = platform capabilities (@kit/*)
apps/*      = compose packages; own domain + entrypoints only
product domain never under packages/**
layers (secondary, per API app): routes → services → repos
```

**Anti-patterns to hunt:** AppError forked in apps · auth/storage/email reimplemented per app · product markers in packages · wrong-axis duplication (same concern copy-pasted across package siblings instead of shared helper).

## Domains

| Domain | Focus (Chemin A) |
|--------|------------------|
| Axial Drift | ADR-0001 violations · packages↔apps · N×M across `@kit/*` siblings |
| Architecture | Layering routes/services/repos · packages ↛ apps · circular deps |
| Security | Auth dual-path · cookies · IDOR org-scope · sk_ keys · secrets · R2 path |
| Code Smells | God files · DRY · long handlers · dead code |
| Type Safety | `any` · unsafe casts · Zod boundary gaps · `@ts-expect-error` |
| Workers/Async | Floating promises · global state · DO misuse · blocking in Worker · queue/cron |
| Error Handling | AppError discipline · swallowed errors · leaky stacks · bare catch |
| Test Quality | Coverage gaps on auth/RBAC · flaky · missing IDOR matrix |
| Tech Debt | TODO/FIXME · DEBT tags · deprecated · magic numbers |
| Kit Extractibility | banlist · zero-edit · product string leak · orphan packages |

## Partitioning

| ID | Patterns | Description |
|----|----------|-------------|
| P1 | `packages/core/**`, `packages/types/**`, `packages/config/**`, `packages/api-client/**` | Kernel + types + client |
| P2 | `packages/auth/**` | Better Auth SessionPort · sk_ · org helpers |
| P3 | `packages/db/**`, `packages/storage/**`, `packages/email/**` | D1 · R2 · email transports |
| P4 | `packages/ui/**`, `packages/i18n/**` | UI shell · locale engine |
| P5 | `packages/flows/**`, `packages/tasks/**`, `packages/comments/**`, `packages/mcp/**` | Incubating kernels + MCP |
| P6 | `apps/example-api/**` | Hono Worker API dogfood |
| P7 | `apps/example-web/**` | TanStack SPA dogfood |
| P8 | `apps/mcp-example/**`, `scripts/**`, `tooling/**`, `.github/**` | MCP example · gates · CI |
| T1 | `packages/**/*.test.ts` | Package unit tests |
| T2 | `apps/example-api/**/*.test.ts` | API tests (auth/RBAC critical) |
| T3 | `apps/example-web/**/*.{test,spec}.{ts,tsx}` | Web tests |
| T4 | Coverage floors + e2e scripts | Aggregate quality of test strategy |

## Execution waves

| Wave | Domain | Agents |
|------|--------|--------|
| 0 | Machine baseline | import-boundary · banlist · extract-dry-run · debt · agents-adr |
| 1 | Axial Drift | 2 (structural gates + semantic ADR-0001 review) |
| 2 | Architecture | 4 (P1–P2 · P3–P4 · P5–P6 · P7–P8) |
| 3 | Security | 4 (auth · storage/email · example-api · web+mcp) |
| 4 | Code Smells | 3 (packages SaaS · incubating · apps) |
| 5 | Type Safety | 3 (packages · api · web) |
| 6 | Workers/Async + Error Handling | 4 |
| 7 | Test Quality | 3 (T1–T2 · T3 · T4 strategy) |
| 8 | Tech Debt + Kit Extractibility | 3 |
| 9 | Synthesis | 1 → `AUDIT-SUMMARY.md` |

**Total agents:** 28 (+ wave 0 machine = free).

## Machine baseline (Wave 0 — recorded)

| Gate | Result |
|------|--------|
| import-boundary | OK — 260 files, 0 violations |
| banlist | OK |
| extract-dry-run | OK (mode=kit) |
| debt:check | WARN — 1 untagged biome-ignore (`input-group.tsx`) |
| agents-adr:check | WARN — 7 bare ADR-NNN lines in AGENTS.md |

## Severity

| Level | Meaning |
|-------|---------|
| P0 | Security vuln · data leak · auth bypass · kit extractibility broken |
| P1 | Bug risk · confirmed axial drift · critical coverage hole |
| P2 | Refactor · probable drift · medium debt |
| P3 | Cleanup · hygiene · style |

## Output root

`artifacts/analyses/quality-audit/`
