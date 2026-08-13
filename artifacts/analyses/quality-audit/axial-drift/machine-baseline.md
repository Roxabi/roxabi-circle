# Axial Drift / Machine Baseline — Wave 0

**Date:** 2026-08-12  
**Commands:** local kit gates (not full `validate:full`)

## Results

| Gate | Exit | Signal |
|------|------|--------|
| `bun run import-boundary` | 0 | 260 files, **0 violations** (26ms) |
| `bun run banlist` | 0 | OK |
| `bun run extract-dry-run` | 0 | OK mode=kit · no product apps · all packages imported by examples |
| `bun run debt:check` | 0 (warn) | 1 untagged biome-ignore in `packages/ui/.../input-group.tsx` |
| `bun run agents-adr:check` | 0 (warn) | 7 bare ADR-NNN references in AGENTS.md |

## Interpretation

- **Structural import axis:** green — no packages→apps or forbidden layer imports detected by the machine contract.
- **Extractibility banlist:** green at time of audit.
- **Hygiene debt:** non-blocking warnings only (DEBT tag + ADR link style).

## Residual risk (for semantic agents)

Machine gates do **not** prove:

1. Semantic N×M (same retry/auth/org helper duplicated across package siblings).
2. App-local reimplementation of platform helpers that still typecheck.
3. IDOR / grant logic bugs (runtime semantic).
4. Global mutable Worker state or floating promises.

→ Hand off to Wave 1 semantic + domain agents.
