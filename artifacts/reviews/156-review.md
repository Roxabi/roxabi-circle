---
verdict: green
issue: 156
branch: feat/156-3-exception-extract-dry-run-attendre-le-kit
spec: artifacts/specs/156-3-exception-extract-dry-run-attendre-le-kit-spec.md
date: 2026-08-24
---

# Review — #156 Extract honours product identity

**Range:** `4b4e55e..HEAD` (`e99bf78`) · 4 code/doc files (+ plan/spec/review artifacts)
**Reviewer:** build-review-156-2 (single reviewer, no delegation)
**Rounds:** R₁ on `61b6055` (4 findings) → fixed by `e99bf78` · R₂ on `e99bf78` (this pass)

## Verdict

### `green`

All seven Acceptance items are met and machine-proven, including Acceptance 1 end-to-end through the **real**
gate on a full product-identity tree. The four R₁ findings are resolved. The remaining R₂ findings are
non-blocking (P2/P3): none lets a defect reach lefthook/CI, none re-opens the spec.

## Acceptance ledger

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Product tree with product apps passes without patching the gate | **PASS** | Full clone of the live tree, `.git` re-inited with origin `acme/product-consumer`, `config/product/inheritance.json` added, `apps/acme-api/` added. Real gate, unpatched: `mode=product identity=acme/product-consumer classified=product` → `NOTE: product app present (expected on product tree): apps/acme-api` → banlist OK → residency OK → compose proof OK → `extract-dry-run: OK (mode=product)`, **exit 0**. No zero-edit exception, no gate edit. |
| 2 | Kit tree with a non-example app fails | **PASS** | Kit-identity fixture with `apps/acme-api`, real gate: `== product-app allowlist (kit mode) ==` → `UNEXPECTED app (not in kit allowlist): apps/acme-api`, exit 1. Failure is at the allowlist step, not an incidental earlier step (verified by reading the run's stdout). Self-test cases 2 and 6. |
| 3 | Harness force-kit on a product tree still fails on product apps | **PASS** | `EXTRACT_MODE=kit` + sentinel on the product fixture → `mode=kit`, allowlist then rejects `acme-api`, exit 1. Self-test 7. |
| 4 | Permissive override cannot green a kit tree / rejected without sentinel | **PASS** | Any `EXTRACT_MODE` without a usable sentinel throws before anything else (self-test 8). With sentinel, `mono` **and** `product` on a kit-classified tree both resolve to `mode=kit` and the real gate still rejects `acme-api`, exit 1 (self-test 9, 10). Classification runs *before* override handling, so an unclassifiable tree cannot be papered over by a flag. |
| 5 | Product apps = complement of the example set, never a product-name enum | **PASS** | The `for product_app in apps/share-api apps/share-web` enum is deleted. Both branches derive from the single `KIT_APP_ALLOW` array by complement. `grep` finds no residual `share-*` / `lgu-*` enumeration in the gate. |
| 6 | Residency + temp compose unchanged | **PASS** | Both steps are untouched and remain unconditional, outside the mode branch. Live kit run: `extract-residency: OK (23 kit-generic tables indexed)` · `extract-compose-proof: OK (typecheck + org 200/404)`. Same two lines observed on the product-identity run. |
| 7 | Extract stays a named step of the single bar | **PASS** | `validate:full` still chains `extract-dry-run` **and** `test:extract-dry-run`; `validate` still chains `extract-dry-run`. `check-bar-ssot: OK`. `check-doc-hygiene: OK (18 standards, 42 Markdown files, 260 internal links)` after the CP-EXTRACT row edit. |

**Invariant 3 (one identity).** `resolve-tree-identity.mjs` reads the same `config/kit/zero-edit-zones.json`
(`kit_origin_allowlist`, `inheritance_file`), applies the same `GITHUB_REPOSITORY || origin` precedence, the same
`normalizeOriginUrl` (SSH + HTTPS + `.git` strip), the same marker-on-allowlisted-origin fatal, and the same
two-branch remedy text as `check-zero-edit-zones.sh:137-180`. Marker presence alone is *not* sufficient —
`upstreamCommit` is required. An unclassified tree throws; it never silently becomes kit. See R₂-3 on the fact
that this is a *copy* of the classifier rather than a shared import.

**Invariant 4 (kit HEAD fail-closed).** Holds on the release path: neither CI nor `lefthook.yml` sets
`EXTRACT_MODE`; `grep` across `docs/`, `.github/`, `config/`, `scripts/`, `package.json`, `lefthook.yml` finds
no stale `EXTRACT_MODE=mono` / `=strict` caller left behind by the mode rename.

## Proof run

```
CP-EXTRACT self-test: 15 passed, 0 failed
extract-dry-run: OK (mode=kit)         # live tree, identity=Roxabi/roxabi-boilerplate-cf
extract-dry-run: OK (mode=product)     # product-identity clone + apps/acme-api, exit 0
check-bar-ssot: OK
check-doc-hygiene: OK (18 standards, 42 Markdown files, 260 internal links)
```

## R₁ findings — all resolved in `e99bf78`

| ID | P | Finding | Status |
|----|---|---------|--------|
| **R₁-1** | P2 | `EXTRACT_MODE=product` was an unguarded allowlist bypass on a kit-classified tree | **fixed** — clamped like `mono`; self-test 10 pins it through the real gate |
| **R₁-2** | P2 | Self-test asserted against `check_kit_allowlist()`, a copy of the gate | **fixed** — `run_extract_gate()` drives `extract-dry-run.sh` itself; the mirror helper is deleted |
| **R₁-3** | P3 | `KIT_EXAMPLE_APPS` / `isKitExampleApp` / `isProductAppPath` exported but imported nowhere | **fixed** — dead exports removed |
| **R₁-4** | P3 | Unparsed `MODE` fell into the permissive branch (fail-open dispatch) | **fixed** — `elif [[ "$MODE" == "product" ]]` + `else … exit 1` |

## R₂ findings (non-blocking)

| ID | P | Finding | C |
|----|---|---------|---|
| **R₂-1** | P2 | The product-mode case never asserts the gate goes green — Acceptance 1's exit status is discarded by `\|\| true` | 0.90 |
| **R₂-2** | P3 | `mono` and `product` override branches are now exact no-ops, yet still advertised as choices | 0.95 |
| **R₂-3** | P2 | The D5 classifier now exists twice (deliberate deferral — tracked, not blocking) | 0.95 |
| **R₂-4** | P3 | Exec bit dropped on `scripts/kit/test-extract-dry-run.sh` (100755 → 100644) | 0.95 |

### R₂-1 — Product-mode case does not pin the exit status (`scripts/kit/test-extract-dry-run.sh:165-167`)

Acceptance 1's headline claim is *"passes extract"*, but the only assertion for the product path greps for the
`NOTE:` line while `|| true` discards the gate's exit status:

```
"out=\$(run_extract_gate '${PRODUCT}' 2>&1 || true); echo \"\$out\" | grep -E 'NOTE: product app present.*apps/acme-api'"
```

The stub fixture in fact exits non-zero: `seed_extract_gate_stubs` (`:56-75`) seeds
`check-zero-edit-zones.sh` — which the extract gate never invokes — but **not** `check-banned-strings.sh`, which
it does invoke at `extract-dry-run.sh:131`. So the run dies at the banlist step and the `|| true` hides it. A
regression that made the product branch `exit 1` *after* printing the NOTE would leave the suite green.

I closed the gap by hand on a full product-identity clone (`extract-dry-run: OK (mode=product)`, exit 0), so the
gate is correct — the suite just does not pin it. Swap the dead `check-zero-edit-zones.sh` copy for the scripts
the gate actually shells out to, then assert exit 0 alongside the NOTE.

```suggestion
  cp "${ROOT}/scripts/kit/check-banned-strings.sh" "${dir}/scripts/kit/"
  cp "${ROOT}/scripts/kit/resolve-tree-identity.mjs" "${dir}/scripts/kit/"
```

### R₂-2 — `mono` / `product` overrides are no-ops (`scripts/kit/resolve-tree-identity.mjs:106-116`)

`mode` is initialised to `classifiedMode`, and `classifiedMode` is already one of `kit | product`. Both remaining
branches therefore evaluate to the value `mode` already holds:

```
let mode = classifiedMode
…
} else if (modeEnv === 'mono')    { mode = classifiedMode === 'kit' ? 'kit' : 'product' }
else if (modeEnv === 'product')   { mode = classifiedMode === 'kit' ? 'kit' : 'product' }
```

After the R₁-1 fix the only override with any effect is `kit` / `strict` (force-kit, i.e. strictly tighter).
`EXTRACT_MODE=mono` and `EXTRACT_MODE=product` are now indistinguishable from setting nothing — yet the
validation error at `:104` still advertises them (`use kit|product|strict|mono`), which invites a reader to
believe they do something. Fail-closed behaviour is correct; the surface is misleading. Collapse the two dead
branches into the default and say so.

```suggestion
    let mode = classifiedMode
    if (modeEnv === 'kit' || modeEnv === 'strict') {
      mode = 'kit'
    }
    // 'product' / 'mono' are permissive labels: they can only ever restate the
    // classified mode — they never relax a kit-classified tree.
    return { mode, identity, classifiedMode }
```

### R₂-3 — Two implementations of the D5 classifier (`scripts/kit/resolve-tree-identity.mjs:38-92`)

`check-zero-edit-zones.sh:137-180` keeps its own inline copy of the classifier; the new module re-implements it.
The module's docstring is explicit that this is a deferral (*"shared by extract-dry-run and (future)
zero-edit"*), so this is a deliberate design choice, not an oversight — recorded for traceability, not as a
defect. I diffed both: on the unforced paths they agree exactly (allowlist, marker, `GITHUB_REPOSITORY ||
origin`, marker-on-kit fatal, remedy text), so **Invariant 3 holds in substance today** and Acceptance is
unaffected. The residual risk is drift: two copies must now be edited in lockstep. The clean cutover is for
`check-zero-edit-zones.sh` to `import` the module instead of inlining it — worth a follow-up ticket, out of
scope here.

### R₂-4 — Exec bit dropped on the self-test (`scripts/kit/test-extract-dry-run.sh:1`)

The patch changes the file mode `100755 → 100644`. 47 of the 50 shell scripts under `scripts/kit/` are `100755`,
and this file was `100755` before the patch. Nothing breaks today — `package.json:64` invokes it as
`bash scripts/kit/test-extract-dry-run.sh` — but `./scripts/kit/test-extract-dry-run.sh` now fails with
`permission denied`, and the file silently diverges from its siblings. Restore with
`git update-index --chmod=+x scripts/kit/test-extract-dry-run.sh`.

## Praise

- Acceptance 1 is real, not asserted: an unmodified product tree with a product app runs the whole bar green,
  including residency and the compose proof, with no gate patch and no zero-edit exception.
- Fail-closed default is genuinely closed. Classification happens *before* override handling, so a harness flag
  cannot paper over an unclassifiable tree, and the throw spells out both remedies.
- The R₁ fixes are structural, not cosmetic: the mirror helper `check_kit_allowlist()` is gone and every
  allowlist assertion now drives `extract-dry-run.sh` itself, so the gate's own branch is pinned.
- The `share-api` / `share-web` hardcoded enum is gone. Acceptance 5 is met by construction (complement of
  `KIT_APP_ALLOW`), not by widening a list.
- `unset GIT_DIR GIT_WORK_TREE GIT_COMMON_DIR` + `env -u …` in every fixture pre-empts the hook-contamination
  class that `36d4c34` had to fix.
- CP-EXTRACT row, `check:bar-ssot` and `doc:check` kept in sync in the same patch — no doc drift.

## Security

No security findings.

Reviewed the complete production change in `scripts/kit/resolve-tree-identity.mjs` and
`scripts/kit/extract-dry-run.sh`, plus its test and bar callsite. The attacker-influenceable inputs are the Git
origin / `GITHUB_REPOSITORY`, inheritance marker, app names, and harness override variables. None reaches a
dangerous sink: Git is invoked through `execFileSync` with a fixed argument vector (no shell interpolation), and
the remaining values are exact-compared, quoted, or printed only.

The identity-to-allowlist control remains fail-closed. An unclassified tree is rejected; a marker on a
kit-allowlisted identity is rejected; and no accepted `EXTRACT_MODE` can relax a kit-classified tree to product
mode. The existence-based harness sentinel is only a test tripwire, not an authentication boundary, and even a
caller that can satisfy it gains no permissive transition. Product-app relaxation is therefore confined to a
tree already classified as product, while banlist, residency, and compose checks remain unconditional.

review: green
