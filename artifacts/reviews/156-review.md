---
verdict: green
issue: 156
branch: feat/156-3-exception-extract-dry-run-attendre-le-kit
spec: artifacts/specs/156-3-exception-extract-dry-run-attendre-le-kit-spec.md
date: 2026-08-24
---

# Review — #156 Extract honours product identity

**Range:** `main...HEAD` (`61b6055`) · 4 code/doc files (+ plan/spec artifacts)
**Reviewer:** build-review-156 (single reviewer, no delegation)

## Verdict

### `green`

All seven Acceptance items are met and machine-proven. Findings below are **non-blocking** (P2/P3): none of them
lets a defect reach lefthook/CI, and none requires re-opening the spec.

## Acceptance ledger

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Product tree with product apps passes without patching the gate | **PASS** | `resolveTreeIdentity` → `mode=product` on marker+non-allowlisted origin; `extract-dry-run.sh` takes the `else` branch and skips the allowlist. Observed live: `mode=product … NOTE: product app present (expected on product tree): apps/acme-api`, run continues to banlist. Self-test 5. |
| 2 | Kit tree with a non-example app fails | **PASS** | Real gate on a kit-identity fixture containing `apps/acme-api`: `UNEXPECTED app (not in kit allowlist): apps/acme-api`, exit 1. Self-test 6. |
| 3 | Harness force-kit on a product tree still fails on product apps | **PASS** | `EXTRACT_MODE=kit` + sentinel → `mode=kit` on a product-classified tree; allowlist then rejects `acme-api`. Self-test 7. |
| 4 | Permissive override cannot green a kit tree / rejected without sentinel | **PASS** (see R₁-1) | Without sentinel any `EXTRACT_MODE` throws (self-test 8). `EXTRACT_MODE=mono` + sentinel on a kit tree stays `mode=kit` and still fails `acme-api` — verified through the real gate, exit 1. Self-test 9. |
| 5 | Product apps = complement of the example set, never a product-name enum | **PASS** | The old `for product_app in apps/share-api apps/share-web` enum is deleted; both branches derive from `KIT_APP_ALLOW` complement. |
| 6 | Residency + temp compose unchanged | **PASS** | Both steps untouched and still unconditional (outside the mode branch). Live run: `extract-residency: OK (23 kit-generic tables indexed)` · `extract-compose-proof: OK (typecheck + org 200/404)`. |
| 7 | Extract stays a named step of the single bar | **PASS** | `validate:full` still chains `extract-dry-run` and `test:extract-dry-run`. `check:bar-ssot` OK, `test:bar-ssot` 13/13, `doc:check` OK after the CP-EXTRACT row edit. |

**Invariant 3** (one identity) holds: the new classifier reads the same `config/kit/zero-edit-zones.json`
(`kit_origin_allowlist` + `inheritance_file`), applies the same marker-on-allowlisted-origin fatal, and the same
`GITHUB_REPOSITORY || origin` precedence as `check-zero-edit-zones.sh`. Marker presence alone is not sufficient —
`upstreamCommit` is required and an unclassified tree throws with the two-branch remedy, never silently kit.

## Proof run

```
CP-EXTRACT self-test: 13 passed, 0 failed
extract-dry-run: OK (mode=kit)        # live tree, identity=Roxabi/roxabi-boilerplate-cf
check-bar-ssot: OK · CP-BAR-SSOT: OK (13/13) · check-doc-hygiene: OK
```

## R₁ findings (non-blocking)

| ID | P | Finding | C |
|----|---|---------|---|
| **R₁-1** | P2 | `EXTRACT_MODE=product` is an unguarded allowlist bypass on a kit-classified tree, defeating the `mono` guard beside it | 0.90 |
| **R₁-2** | P2 | Self-test asserts against `check_kit_allowlist()`, a copy of the gate, not against `extract-dry-run.sh` | 0.85 |
| **R₁-3** | P3 | `KIT_EXAMPLE_APPS` / `isKitExampleApp` / `isProductAppPath` are exported but imported nowhere — a third, dead copy of the example set | 0.95 |
| **R₁-4** | P3 | An unparsed `MODE` falls into the permissive `else` branch — the mode dispatch fails open, not closed | 0.70 |

### R₁-1 — `EXTRACT_MODE=product` bypasses the kit allowlist (`scripts/kit/resolve-tree-identity.mjs:121-126`)

`mono` is deliberately neutered on kit-classified trees (`mode = classifiedMode === 'kit' ? 'kit' : 'product'`,
comment: *"never bypass kit allowlist on kit-classified trees"*), but the very next branch sets `mode = 'product'`
unconditionally. Verified end-to-end against the real gate on a kit-identity tree carrying `apps/acme-api`:

```
== extract-dry-run: mode=product identity=Roxabi/roxabi-boilerplate-cf classified=kit ==
NOTE: product app present (expected on product tree): apps/acme-api
```

The stray app passes. This stays inside Acceptance 4 because the sentinel is required and is absent on normal
lefthook/CI (matching the `ZERO_EDIT_MODE` / `QG_FILE_*` precedent, where a sentinel likewise grants a full mode
override), so **Invariant 4 holds on the release path** — hence non-blocking. But it makes the `mono` guard
decorative: anyone reaching for a harness bypass will reach for `product`. Either extend the guard, or drop the
`mono` special case as misleading.

```suggestion
    } else if (modeEnv === 'product') {
      // Permissive label — never bypass the kit allowlist on kit-classified trees.
      mode = classifiedMode === 'kit' ? 'kit' : 'product'
    }
```

### R₁-2 — Self-test proves a mirror of the gate (`scripts/kit/test-extract-dry-run.sh:57-71`)

`check_kit_allowlist()` (pre-existing, but now load-bearing for the four new cases 5/6/7/9) re-implements the
allowlist loop in the test file. The new assertions therefore prove the *classifier* plus a *copy* of the gate;
a regression in `extract-dry-run.sh`'s own `if [[ "$MODE" == "kit" ]]` branch would leave the suite green.
The gate branch is currently correct — I verified it directly — but the suite does not pin it. Driving one case
through `EXTRACT_ROOT=<fixture> bash scripts/kit/extract-dry-run.sh` would close the loop.

### R₁-3 — Dead exports duplicating the example set (`scripts/kit/resolve-tree-identity.mjs:13-26`)

`grep` across `scripts/`, `docs/`, `config/`, `package.json`, `lefthook.yml`, `.github/` finds no importer:
`extract-dry-run.sh` still uses its own `KIT_APP_ALLOW` bash array, and the self-test a third `allow=(…)` array.
The example set now lives in three places that can drift independently. Delete the unused exports, or make the
gate consume them.

### R₁-4 — Mode dispatch fails open (`scripts/kit/extract-dry-run.sh:34-36`, `:82`, `:99`)

`MODE` comes from `sed -n 's/^mode=\([^ ]*\).*/\1/p'`. If that ever yields empty or an unexpected token, the
`if [[ "$MODE" == "kit" ]]` test is false and control lands in the permissive product branch, silently skipping
the allowlist. Not reachable today (the classifier's stdout is exactly one `mode=…` line and a failed
substitution exits via the `||` handler), so P3 — but on a fail-closed gate the residual branch should reject.

```suggestion
if [[ "$MODE" == "kit" ]]; then
```
```suggestion
elif [[ "$MODE" == "product" ]]; then
```
```suggestion
else
  echo "extract-dry-run: unresolved tree mode '${MODE}'" >&2
  exit 1
fi
```

## Praise

- Fail-closed default is genuinely closed: unclassified trees throw with both remedies spelled out, and the
  override is evaluated *after* classification, so a harness flag cannot paper over an unclassifiable tree.
- The `share-api`/`share-web` hardcoded product enum is gone — Acceptance 5 is met by construction, not by
  widening a list.
- `unset GIT_DIR GIT_WORK_TREE GIT_COMMON_DIR` + `env -u …` in the fixtures pre-empts the hook contamination
  class that `36d4c34` had to fix.
- CP-EXTRACT row, `bar-ssot` and `doc:check` were kept in sync in the same patch — no doc drift.

## Security

No security findings.

The identity inputs and the mode-to-allowlist path fail closed on the normal release paths: an unclassified tree
is rejected, an inheritance marker on a kit-allowlisted identity is rejected, and neither CI nor Lefthook sets
the harness override. `git` is invoked through `execFileSync` with an argument vector, so the repository origin
cannot inject a command. The documented `EXTRACT_MODE=product` behavior can bypass the kit allowlist only when
the explicitly harness-only sentinel is also supplied; that environment is not reachable from pull-request
content in the reviewed CI or pre-push configuration. The sentinel remains a harness tripwire, not an
authentication boundary, and must not be configured on normal gates.

review: green
