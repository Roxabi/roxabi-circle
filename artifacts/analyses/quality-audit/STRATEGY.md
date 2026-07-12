# Quality Audit Strategy — silex-share (Chemin A kit)

**Date:** 2026-07-12  
**Repo:** `go-silex/silex-share`  
**Scope:** Kit extractible Full Cloudflare (packages + example apps) — product `share-*` not present  
**Scale:** ~111 TS/TSX source files, ~17 test files → **~34 agents**, wave size 5  
**Playbook:** `roxabi-plugins/playbooks/multi-agent-audit-playbook.md` v1.1

## Domains

| Domain | Focus (TS / CF Workers adapted) |
|--------|----------------------------------|
| Axial Drift | Primary axis packages compose apps (ADR-0001); N×M traps; banlist share domain |
| Architecture | Layer violations (routes→services→repos), package→app deps, circular deps |
| Security | OWASP, secrets, session cookies, API keys, injection, CORS, headers |
| Code Smells | God files, long functions, DRY, dead code |
| Type Safety | `any`, `as` casts, missing strict types, Zod gaps |
| Async Patterns | Unawaited promises, race conditions, Workers streaming leaks |
| Error Handling | Swallowed errors, bare catch, AppError leakage, missing requestId |
| Test Quality | Coverage floors, flaky patterns, mock overuse, CP-* gaps |
| Tech Debt | TODO/FIXME, interim HMAC session, magic numbers, deprecated APIs |

## Partitioning (source)

| ID | Patterns | Description |
|----|----------|-------------|
| P1 | `packages/core/**`, `packages/types/**`, `packages/config/**` | Core kit primitives |
| P2 | `packages/auth/**` | Session HMAC, API keys |
| P3 | `packages/db/**`, `packages/storage/**`, `packages/email/**`, `packages/mcp/**` | Platform infra packages |
| P4 | `packages/ui/**` | shadcn Base UI kit |
| P5 | `apps/example-api/**` | Hono Worker demo API |
| P6 | `apps/example-web/**`, `apps/mcp-example/**` | SPA + MCP example |
| P7 | `scripts/**`, `tools/**`, `.github/**`, root config | Tooling / CI / gates |

## Partitioning (tests)

| ID | Patterns | Description |
|----|----------|-------------|
| T1 | `packages/**/*.{test,spec}.{ts,tsx}` | Package unit tests |
| T2 | `apps/**/*.{test,spec}.{ts,tsx}` | App tests |
| T3 | Coverage aggregates + `docs/testing.md` | Floors, CP inventory |

## Execution waves

```
Wave 1: Axial Drift (2) + Architecture P1–P3 (3)     = 5
Wave 2: Architecture P4–P7 (4) + Security P2 (1)     = 5
Wave 3: Security P1,P3–P6 (5)
Wave 4: Code Smells P1–P5 (5)
Wave 5: Code Smells P6 + T1–T2 + Type Safety P1–P3 (5)
Wave 6: Type Safety P4–P6 + Async full + Errors BE (5)
Wave 7: Errors FE + Test Quality T1–T3 + Tech Debt half (5)
Wave 8: Tech Debt rest + Cocoindex validate + Synthesis (3)
```

## Axial ADR

- Present: `docs/architecture/adr/0001-primary-axis-packages-compose-apps.md` (`axial: true`)
- Primary axis: **platform packages** compose deployable apps
- Secondary: routes → services → repos inside API apps

## Output

All findings under `artifacts/analyses/quality-audit/{domain}/`  
Final: `artifacts/analyses/quality-audit/AUDIT-SUMMARY.md`

## Severity

| Level | Meaning |
|-------|---------|
| P0 | Security vulns, data loss, axial drift blocking extract |
| P1 | Bugs, significant debt, confirmed axial drift |
| P2 | Refactors, probable drift |
| P3 | Minor cleanups |

## Technical Debt Score

0–100 (100 = pristine). Weighted: Security×3, Axial×2, Architecture×2, others×1.
