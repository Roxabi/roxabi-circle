---
title: 'ADR-0009 — Kit namespace polarity (`*/kit`) + inheritance marker SSoT'
status: accepted
normative: true
date: 2026-08-21
axial: false
related:
  - docs/kit/architecture/adr/0001-primary-axis-packages-compose-apps.md
  - docs/kit/architecture/adr/0008-kit-schema-identity-product-compose.md
  - docs/kit/product-consumer-contract.md
  - config/kit/zero-edit-zones.json
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
| Blanket-protect `config/`, `scripts/kit/`, … | Product machine state shoved into `docs/product/` carve-outs |
| Default base = `upstream/main` | Stale tracking ref → false FORBIDDEN dual-edit (#103) |
| CI base = `docs/product/kit-baseline` via `ZERO_EDIT_BASE_REF` | Local ≠ CI; operators skip lefthook |

Allowlist islands (`docs/product/`, `scripts/product/`) worked but forced exceptions under kit-owned trees and duplicated “what is the base?” across file + env + remote.

### Alternatives considered

| Option | Verdict |
|--------|---------|
| **A** Kit-as-root + product islands only (`config/product/` carve-out) | Viable; rejected for long-term clarity |
| **B** Inverted `config/kit` · `scripts/kit/kit` · `docs/kit/kit` | **Accepted** — path encodes ownership |
| Thin #103 fix (fallback to kit-baseline only) | Rejected as throwaway during B |

## Decision

### D1 — Symmetric namespaces under `config/` · `scripts/kit/` · `docs/kit/`

```text
{config,scripts,docs}/kit/**      → kit-owned (protected)
{config,scripts,docs}/product/**  → product-owned
anything else under those three trees → inventory FAIL (unclassified)
```

After migration there is **no** “rest of `config/` is product by default”. Ownership is only via the two explicit namespaces. That removes carve-out allowlists and makes D6 non-vacuous: a kit runbook under `docs/product/` is a **process** mistake caught by review / dogfood, while a file under `docs/kit/orphan.md` fails the machine gate.

Scope note: “`*/kit`” in this ADR means those three roots only — not a monorepo-wide rename of every kit path.

### D2 — Surfaces that stay prefix- or list-protected

Unchanged ownership, not folded into `scripts/kit/kit` in this ADR:

| Surface | Rule |
|---------|------|
| `packages/` | kit |
| `apps/example-api/` · `example-web/` · `mcp-example/` | kit |
| `apps/<product>-*` | product |
| `tooling/` | kit (taxonomy merge = later ADR) |
| `tools/` | folded by [ADR-0011](./0011-tools-fold-scripts-config-polarity.md) — do not add files; executable → `scripts/kit/`, data → `config/kit/` |

### D3 — Root / GitHub debt (namespace-first, not yet prefix-pure)

GitHub and monorepo tooling keep some kit files outside `{config,scripts,docs}/kit`. They remain on an explicit **`protected_files`** list until a follow-up decides façades, renames (`kit-*.yml` / `product-*.yml`), or true product ownership.

Minimum set to retain (extend if inventory finds more shared root files):

```text
package.json · bun.lock · lefthook.yml · turbo.jsonc · biome.json · tsconfig.json
AGENTS.md · CLAUDE.md · README.md · commitlint.config.*
docker-compose.yml · .license-policy.json
.claude/stack.yml · .claude/settings.json · .semctx/config.json
.github/dependabot.yml
.github/workflows/<kit workflows>   # not product-*.yml
```

`bun.lock` is **co-owned in practice** (product deps rewrite it). While listed as protected, dual-edit of the lockfile after adding a product dependency requires either an exception entry or a follow-up [#110](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/110) reconciliation rule. Do not silently drop it from the list.

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

**Threat model (honest):** zero-edit is a **process / CI gate**, not a tamper-resistant boundary. A maintainer who sets `upstreamCommit` to `HEAD` (or any descendant that already contains their kit-path edit) empties the protected diff. Provenance attestation / parent-remote fetch is **out of scope** here (conflicts with no-auto-fetch). Mitigations: human review on marker bumps, dogfood, and (optional later) CI check that `upstreamCommit` equals the merge’s first-parent tip when the commit message/subject matches an inherit merge — not required for MVP.

#### Transition (until [#107](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/107))

| Priority | Base source |
|----------|-------------|
| 1 | `config/product/inheritance.json` if present and valid |
| 2 | Legacy `docs/product/kit-baseline` SHA if present and valid |
| 3 | else fail (product) — **never** `upstream/main` |

If both marker and legacy exist and disagree → **fail**.  
`ZERO_EDIT_BASE_REF`, if set, must equal the resolved base or **fail** (no silent override). Then remove env + legacy file in #107.

### D5 — Mode detection (fail-closed)

| Condition | Mode |
|-----------|------|
| New or legacy marker present + origin not kit-allowlisted | `product` |
| No marker + origin allowlisted (Roxabi kit HEAD **or** declared mirror) | `kit` |
| Marker present on kit-allowlisted origin | **error** |
| No marker + unknown / product-shaped origin | **error** (never silent kit) |

**Allowlist SSoT:** machine list in `config/kit/zero-edit-zones.json` (post-move) with at least the Roxabi kit repo id. Additional mirrors (e.g. `go-silex/silex-boilerplate`) are **operator-extended entries** in that file when the mirror is first published — not inferred from remote topology docs outside the kit. Extractibility: a Roxabi-direct product (no mirror row) still classifies once `inheritance.json` is present; go-silex products need the mirror row after inherit.

CI prefers `github.repository`; local normalizes `origin` URL.

**`ZERO_EDIT_MODE`:** forbidden on the normal lefthook / CI path. Harness may set it only when an explicit test sentinel is also set (e.g. file under `tmp/` created by `dogfood-zero-edit.sh`); otherwise ignore or fail closed. Prefer fixture trees over env override when practical.

### D6 — Inventory gate (classification, not intent)

Under `config/` · `scripts/kit/` · `docs/kit/`, every tracked path must be under `kit/` or `product/` (or a documented exception path listed in zones). Unclassified → fail.

This gate proves **structural classification**, not “no kit content was ever misplaced under `product/`”. Misplacing kit prose under `docs/product/` remains a review / dogfood concern.

Same spirit for `.github/workflows/*`: unclassified workflow → fail (not silent product-owned).

### D7 — Relocated SSoT paths (post-migration)

| Role | Path |
|------|------|
| Zones + policy + kit-origin allowlist | `config/kit/zero-edit-zones.json` |
| Exceptions template | `config/kit/zero-edit-exceptions.example.json` |
| Exceptions (product) | `config/product/zero-edit-exceptions.json` |
| Inheritance marker | `config/product/inheritance.json` |
| Checker | `scripts/kit/check-zero-edit-zones.sh` |
| Consumer contract | `docs/kit/product-consumer-contract.md` |

### D8 — Mirror fidelity (explicit non-claim)

Kit mode on an allowlisted **mirror** does not prove bit-for-bit parity with Roxabi HEAD. Mirror drift is an **operator sync** concern ([#108](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/108)), not priced by product zero-edit. Products correctly pin the mirror tip they actually merged.

## Consequences

- Products may own machine config under `config/product/` without dual-edit exceptions for “being under `config/`”.
- Merge-upstream DX stays path-stable for `packages/` and example apps; only `config|scripts|docs` reshape once.
- Local lefthook and CI share one base resolution path → restores “local `validate:full` is the real gate”.
- One-time migration cost: Roxabi → Silex → products; script path updates; marker rewrite; transitional legacy baseline.
- Root `protected_files` (incl. lockfile tension) remains until [#110](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/110) — **assumed debt**.

## Non-goals

- Auto-`git fetch` inside the checker
- Cryptographic / remote attestation of `upstreamCommit` provenance
- Requiring products to track Roxabi HEAD when their parent is the mirror
- Enforcing mirror≡HEAD inside product zero-edit
- Moving `tooling/` / `tools/` under `scripts/kit/kit` in this ADR
- Resolving root / workflow / lockfile layout in this ADR (#110)
- Product-domain features

## Migration outline

1. Land this ADR + epic children.
2. Mechanical move in Roxabi + checker rewrite + inventory gate + allowlist field (same change set as new protection model) — [#106](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/106). Keep legacy `kit-baseline` readable.
3. Silex mirror inherit (no product marker); ensure mirror row on allowlist — [#108](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/108).
4. Products: inherit tip → write `inheritance.json` (silex tip) → prove [#103](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/103) — [#109](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/109).
5. Remove `ZERO_EDIT_BASE_REF` and `docs/product/kit-baseline` after consumers migrated — [#107](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/107).
6. Later: root / workflow / lockfile debt — [#110](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/110).

## Acceptance (epic-level)

- [ ] ADR accepted; epic tracks children
- [ ] Kit artefacts under `config|scripts|docs` live under `*/kit/`; product under `*/product/`; unclassified paths fail inventory
- [ ] `config/product/inheritance.json` is the preferred product dual-edit base; legacy baseline only until #107
- [ ] Roxabi + declared mirrors allowlisted kit mode; no product marker on mirrors
- [ ] Unknown origin without marker fails closed
- [ ] Local and CI use the same checker path; no `upstream/main` base; no auto-fetch
- [ ] `#103` regression: stale `upstream/main` cannot produce false dual-edit
- [ ] Transitional env/file removed after rollout (#107)
- [ ] Root kit surfaces remain on `protected_files` until #110
- [ ] Dogfood: kit diverge refused · product file OK · exception expiry · missing commit refused · chain Roxabi→Silex→product correct
- [ ] ADR states process-gate threat model (marker rebaseline) explicitly

## Refs

- Epic: [#105](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/105)
- Children: [#106](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/106) move · [#103](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/103) regress · [#108](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/108) silex · [#109](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/109) product · [#107](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/107) kill transitional · [#110](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/110) root debt
- Contract (pre-move path): [`docs/kit/product-consumer-contract.md`](../../product-consumer-contract.md)
- Operator lineage (not in kit): `~/projects/ssot/chemin-a-kit-lineage.ssot.md`
