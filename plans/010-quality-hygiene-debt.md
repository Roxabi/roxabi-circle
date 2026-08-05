# Plan 010 — Quality hygiene (DEBT expiry · optional folder size · AGENTS ADR hygiene)

> **Status:** DONE (GH #70)  
> **Date:** 2026-08-02  
> **Source:** roxabi-factory `docs/debt-tracking.md` + `debt_expiry` + `agents_no_adr_refs` + folder size gate  
> **Orthogonal to:** [007](007-quality-gates-post-review.md) B7 process · [008](008-mcp-agent-contracts.md) · [009](009-layer-import-gate.md)  
> **Epic:** Spark **#134** · GH **[#70](https://github.com/go-silex/silex-boilerplate/issues/70)** · p2 · todo · onRoadmap  
> **Priority:** P2 — ship **after** #19 Phase A and/or when suppressions grow

---

## Issue mapping

| | |
|---|---|
| Spark | **#134** |
| GitHub | **[#70](https://github.com/go-silex/silex-boilerplate/issues/70)** |
| Priority | p2 · todo · onRoadmap |

---

## Problem

Factory treats technical debt as **visible + time-bounded**:

- suppressions must carry `— DEBT:<slug>`
- markers untouched 6+ months without issue ref → **pre-push fail**
- AGENTS.md must not cite `ADR-NNN` as operational law (point to domain pages)

Kit has Biome/TS strictness coming (007 Phase C) but **no** policy for silent `biome-ignore` / `@ts-expect-error` accumulation. File length exists; **folder** god-dirs do not.

---

## Goals

1. **DEBT tagging convention** for kit suppressions (Biome / TS).  
2. **Optional expiry gate** (start warn, then fail) — copy factory spirit, simpler.  
3. **AGENTS hygiene soft rule:** prefer domain doc links over `ADR-000x` as the only pointer (or allow ADR in “see also” only — decide in implement).  
4. **Optional** folder size gate (max files per dir under `apps|packages`) — same tools as factory light.

---

## Non-goals

| Out | Why |
|---|---|
| Full factory debt registry + audit JSON | Overkill kit |
| Importlinter / ACL / quadlet | N/A |
| Blocking B7 or 008 | P2 only |

---

## Design (v1)

### DEBT markers

```ts
// biome-ignore lint/suspicious/noExplicitAny: transitional parser — DEBT:any-parser #68
// @ts-expect-error legacy binding — DEBT:legacy-wrangler-env #19
```

| Rule | |
|---|---|
| Every `biome-ignore` / `@ts-expect-error` / `@ts-ignore` in `apps|packages` | Must match `DEBT:<slug>` |
| Slug | kebab-case, registry optional file `docs/debt-registry.md` (light table) |
| Issue ref | Optional `#N` — required if age > grace for fail mode |

### Expiry gate (`scripts/check-debt-expiry.ts`)

| Mode | When |
|---|---|
| `warn` | First land — print stale, exit 0 |
| `fail` | After 1 sprint or DEBT_EXPIRY_MODE=fail | 

Stale = file mtime or git blame of marker line older than **6 months** AND no `#issue` on line (factory-aligned).

### AGENTS ADR refs

- Soft: script warns if `AGENTS.md` contains `ADR-[0-9]+` without a markdown link to `docs/architecture/…`  
- Or: document “ADR ok in Related; operational rules must be self-contained” without CI at first

### Folder size (optional slice)

| Config | |
|---|---|
| `QG_FOLDER_MAX` | e.g. 25 files under `apps/*/src` / `packages/*/src` |
| Metric | file count `.ts`/`.tsx` |
| Exemptions | `tools/folder_exemptions.txt` |

---

## Acceptance criteria

| # | Criterion |
|---|---|
| AC1 | Doc `docs/debt-tracking.md` (kit) with marker format |
| AC2 | Script lists untagged suppressions (fail or warn) |
| AC3 | Expiry policy documented; default warn on first merge |
| AC4 | testing.md row CP-DEBT |
| AC5 (opt) | folder size gate wired like file length |

---

## Sequencing

```text
S1  docs + untagged scanner (warn)
S2  expiry warn
S3  optional fail mode + folder size
```

**Effort:** S  
**Priority:** P2

---

## Chain

| | |
|---|---|
| Predecessor | factory debt-tracking analysis |
| After | Prefer after 007 Phase A; can land anytime as docs+warn |
| Do not block | #19, #68 |
