---
title: 'ADR-0009 — Kit namespace polarity (`*/kit`) + inheritance marker SSoT'
status: accepted
normative: true
date: 2026-08-21
axial: false
related:
  - docs/architecture/adr/0001-primary-axis-packages-compose-apps.md
  - docs/architecture/adr/0008-kit-schema-identity-product-compose.md
  - docs/product-consumer-contract.md
  - config/zero-edit-zones.json
---

# ADR-0009 — Kit namespace polarity (`*/kit`) + inheritance marker SSoT

Extends [ADR-0001](./0001-primary-axis-packages-compose-apps.md): apps compose `@kit/*`; product consumers merge an immediate upstream without dual-editing kit surfaces.

Closes the structural gap behind [#103](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/103) (stale `upstream/main` ≠ dual-edit).

## Context

### Consumer chain (operator)

```text
roxabi-boilerplate-cf          ← kit HEAD
        ↓ inherit
silex-boilerplate              ← kit mirror (immediate parent for go-silex products)
        ↓ inherit
product (e.g. LGU)             ← upstream = mirror · fetch-only
```

Zero-edit must answer: *did this product patch kit paths since its last inherit?*  
It must **not** answer: *is the local `upstream/main` tracking ref fetched?*

### Problem with the prior polarity

| Prior rule | Failure |
|------------|---------|
| Blanket-protect `config/`, `scripts/`, … | Product machine state shoved into `docs/product/` carve-outs |
| Default base = `upstream/main` | Stale tracking ref → false FORBIDDEN dual-edit (#103) |
| CI base = `docs/product/kit-baseline` via `ZERO_EDIT_BASE_REF` | Local ≠ CI; operators skip lefthook |

Allowlist islands (`docs/product/`, `scripts/product/`) worked but forced exceptions under kit-owned trees and duplicated “what is the base?” across file + env + remote.

### Alternatives considered

| Option | Verdict |
|--------|---------|
| **A** Kit-as-root + product islands only (`config/product/` carve-out) | Viable; rejected for long-term clarity |
| **B** Inverted `config/kit` · `scripts/kit` · `docs/kit` | **Accepted** — path encodes ownership |
| Thin #103 fix (fallback to kit-baseline only) | Rejected as throwaway during B |

## Decision

### D1 — Namespace polarity under `config/` · `scripts/` · `docs/`

```text
config/kit/**      scripts/kit/**      docs/kit/**      → kit-owned (protected)
config/**          scripts/**          docs/**          → product-owned
  (except */kit/**)
```

Including `config/product/`, `scripts/product/`, `docs/product/`, and any other non-`kit/` path under those three trees.

**No** `allowed_product_prefixes` carve-out needed for those trees after migration.

### D2 — Surfaces that stay prefix- or list-protected

Unchanged ownership, not folded into `scripts/kit` in this ADR:

| Surface | Rule |
|---------|------|
| `packages/` | kit |
| `apps/example-api/` · `example-web/` · `mcp-example/` | kit |
| `apps/<product>-*` | product |
| `tooling/` · `tools/` | kit (taxonomy merge = later ADR) |

### D3 — Root / GitHub debt (namespace-first, not yet prefix-pure)

GitHub and monorepo tooling keep some kit files outside `*/kit`. They remain on an explicit **`protected_files`** list until a follow-up decides façades, renames (`kit-*.yml` / `product-*.yml`), or true product ownership.

Minimum set to retain (extend if inventory finds more shared root files):

```text
package.json · lefthook.yml · turbo.jsonc · biome.json · tsconfig.json
AGENTS.md · CLAUDE.md · README.md · commitlint.config.*
docker-compose.yml · .license-policy.json
.claude/stack.yml · .claude/settings.json · .semctx/config.json
.github/dependabot.yml
.github/workflows/<kit workflows>   # not product-*.yml
```

ADR stance: **document the list; do not shrink it by deleting rules without a move or ownership decision.**

Workflows cannot live under `.github/workflows/kit/` (GitHub only loads the flat workflows dir). Classification = naming convention + list / inventory gate.

### D4 — Inheritance marker = sole dual-edit base (SSoT)

Product file:

```text
config/product/inheritance.json
```

Minimal schema:

```json
{
  "version": 1,
  "upstreamCommit": "<full SHA of immediate parent tip actually merged>"
}
```

| Consumer | `upstreamCommit` means |
|----------|------------------------|
| go-silex product | tip of **silex-boilerplate** merged |
| Roxabi product (direct) | tip of **roxabi-boilerplate-cf** merged |
| silex mirror | **no** marker (kit mode) |
| Roxabi kit HEAD | **no** marker (kit mode) |

Checker:

1. Reads the marker directly (local == CI).
2. Requires full SHA, object present locally, ancestor of `HEAD`.
3. Diffs protected paths against that commit (+ dirty tree).
4. **Never** uses `upstream/main` as base.
5. **Never** auto-`git fetch`.
6. Missing history → fail with actionable message (deepen checkout), not remote fallback.

`ZERO_EDIT_BASE_REF` and `docs/product/kit-baseline` are **transitional only**, then removed. During transition: marker wins; env present and disagreeing with marker → fail.

### D5 — Mode detection (fail-closed)

| Condition | Mode |
|-----------|------|
| Marker present + origin not kit-allowlisted | `product` |
| Marker absent + origin allowlisted (Roxabi kit HEAD **or** Silex mirror) | `kit` |
| Marker present on kit-allowlisted origin | **error** |
| Marker absent + unknown / product-shaped origin | **error** (never silent kit) |

CI prefers `github.repository`; local normalizes `origin` URL. Manual `ZERO_EDIT_MODE` override = harness/tests only.

### D6 — Inventory gate (kit maintainer failure mode)

Primary long-term risk under inverted polarity: a **new kit file created outside `*/kit`** becomes product-owned and drifts.

Mitigation: fail-closed inventory for sensitive trees — new files under `config/` · `scripts/` · `docs/` must be under `kit/` or an explicit product classification (`product/` or documented exception). Ambiguous → fail.

Same spirit for `.github/workflows/*`: unclassified workflow → fail (not silent product-owned).

### D7 — Relocated SSoT paths (post-migration)

| Role | Path |
|------|------|
| Zones + policy | `config/kit/zero-edit-zones.json` |
| Exceptions template | `config/kit/zero-edit-exceptions.example.json` |
| Exceptions (product) | `config/product/zero-edit-exceptions.json` |
| Inheritance marker | `config/product/inheritance.json` |
| Checker | `scripts/kit/check-zero-edit-zones.sh` |
| Consumer contract | `docs/kit/product-consumer-contract.md` |

## Consequences

- Products may own machine config under `config/product/` without dual-edit exceptions for “being under `config/`”.
- Merge-upstream DX stays path-stable for `packages/` and example apps; only `config|scripts|docs` reshape once.
- Local lefthook and CI share one base resolution path → restores “local `validate:full` is the real gate”.
- One-time migration cost: Roxabi → Silex → products; script path updates; marker rewrite.
- Root `protected_files` remains until a dedicated follow-up — **assumed debt**, not accidental.

## Non-goals

- Auto-`git fetch` inside the checker
- Requiring products to track Roxabi HEAD when their parent is the mirror
- Moving `tooling/` / `tools/` under `scripts/kit` in this ADR
- Resolving root / workflow layout in this ADR
- Product-domain features

## Migration outline

1. Land this ADR + epic children.
2. Mechanical move in Roxabi + checker rewrite + inventory gate (same change set as new protection model).
3. Silex mirror inherit (no product marker).
4. Products: inherit tip → write `inheritance.json` → drop `kit-baseline` / path shims.
5. Remove `ZERO_EDIT_BASE_REF` and `docs/product/kit-baseline` after consumers migrated.
6. Later: root / workflow debt (separate issue).

## Acceptance (epic-level)

- [ ] ADR accepted; epic tracks children
- [ ] Kit artefacts under `config|scripts|docs` live under `*/kit/`
- [ ] Outside `*/kit`, those trees are product-owned without carve-out allowlists
- [ ] `config/product/inheritance.json` is the only product dual-edit base
- [ ] Roxabi + Silex allowlisted kit mode; no product marker on mirrors
- [ ] Unknown origin without marker fails closed
- [ ] Local and CI use the same checker path; no `upstream/main` base; no auto-fetch
- [ ] `#103` regression: stale `upstream/main` cannot produce false dual-edit
- [ ] Transitional env/file removed after rollout
- [ ] Root kit surfaces remain on `protected_files` until follow-up
- [ ] Dogfood: kit diverge refused · product file OK · exception expiry · missing commit refused · chain Roxabi→Silex→product correct

## Refs

- Epic: [#105](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/105)
- Children: [#106](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/106) move · [#103](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/103) regress · [#108](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/108) silex · [#109](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/109) product · [#107](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/107) kill transitional · [#110](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/110) root debt
- Contract (pre-move path): [`docs/product-consumer-contract.md`](../../product-consumer-contract.md)
- Operator lineage (not in kit): `~/projects/ssot/chemin-a-kit-lineage.ssot.md`
