---
title: "fix(quality): add a product-owned file-length exemption surface"
description: "Merge a product-owned file-length register with the kit register; refuse kit-path exemptions and cap-less product lines."
type: spec
status: approved
issue: 118
tier: F-lite
---

## Context

**Promoted from:** [product-owned file-length exemption frame](../frames/118-file-length-exemption-surface-frame.md) (approved, F-lite)
**GitHub issue:** [#118](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/118)
**Refs:** [product-consumer-contract](../../docs/kit/product-consumer-contract.md) · [ADR-0001](../../docs/kit/architecture/adr/0001-primary-axis-packages-compose-apps.md) · [ADR-0009](../../docs/kit/architecture/adr/0009-kit-namespace-polarity-inheritance-marker.md) · `tools/check_file_length.sh` · `tools/file_exemptions.txt` · `config/kit/zero-edit-zones.json` (`tools/` is a `protected_prefix`) · adversarial panel 2026-08-08 item 7

Expert fold (draft): architect + doc-writer + product-lead + adversarial + devops. Allow predicate tightened to `apps/<product>-{api,web,mcp}/` (issue + contract, not `isFreeProductAppPath`). Staged apply uses index bytes. Harness is a temp git repo.

## Intent

The 300-line file-length gate already walks `apps/` + `packages/`, including `apps/<product>-*`. The only exemption register is `tools/file_exemptions.txt`, which is kit-owned and zero-edit protected. Products with tracked god-file debt have no legal surface, so they dual-edit the kit register and then block `boilerplate → mirror → product` cascades.

Why now: LGU and EtherOs already did that dual-edit. The kit must grow a product-owned register before the next cascade.

## Goal

A product can declare explicit file-length caps for `apps/<product>-{api,web,mcp}/**` in `config/product/file_exemptions.txt`. The checker merges that file with the kit register. A product line that targets a kit path, omits a cap, wildcards, uses a non-canonical path, duplicates a kit path, or exceeds its declared N fails the gate. A missing product file is a no-op.

## Users

- **Primary:** product engineers keeping `quality-gates:check` green without patching kit files.
- **Secondary:** kit maintainers merging upstream — `tools/file_exemptions.txt` stays kit-only.

## Expected Behavior

### Surfaces

| File | Owner | Zero-edit | Role |
|------|--------|-----------|------|
| `tools/file_exemptions.txt` | kit | protected (`tools/`) | Shared kit register. Unchanged semantics. |
| `config/product/file_exemptions.txt` | product | free (`config/product/`) | Optional product register. Absent = accept. Kit clone ships **no** live file (keep `config/product/.gitkeep` only). |
| `config/kit/file_exemptions.example.txt` | kit | protected (`config/kit/`) | Header + one **commented** product-app example line. Products copy; they do not edit the example in place. |

Format stays the kit line shape:

```text
<repo-relative-path>  # <N> lines — <tracking> <rationale>
```

Example template line (commented):

```text
# apps/<product>-web/src/god.tsx  # 400 lines — <ticket> <rationale>
```

`N` is a local cap, not a bypass. Comments (`#` first non-space) and blank lines are ignored. Paths must not contain spaces (existing `assert_exempt_no_spaces`).

### Product-app path (normative, one predicate)

A product exemption `$1` is allowed only when **all** hold:

1. Repo-relative, no spaces.
2. Canonical: no leading `/`, no leading `./`, no path component `.` or `..`.
3. Matches `^apps/([^/]+)-(api|web|mcp)/`.
4. Capture group 1 is **not** `example` (refuses `apps/example-api/` and `apps/example-web/`).
5. First path segment is **not** `mcp-example`.

This is the issue/frame `apps/<product>-*` plus the consumer-contract suffixes. It is **narrower** than zero-edit `isFreeProductAppPath` (which allows `apps/acme/foo.ts` and `apps/example-web-branded/...`). Do not exec `check-zero-edit-zones.sh`. Restate the rule in `tools/check_file_length.sh`.

Refused examples: `packages/...`, `tools/...`, `apps/example-web/...`, `apps/example-web-branded/...`, `apps/mcp-example/...`, `apps/acme/foo.ts`, `apps/acme-web/../../packages/ui/...`, `./apps/acme-web/...`.

### Load + merge (both `QG_FILE_MODE=staged` and `tree`)

Order is load-bearing. Runs at script top level **before** `case "$MODE"` (same place as `assert_exempt_no_spaces`), including when staged TS is empty.

1. **Kit register source (live):** always `tools/file_exemptions.txt`. Missing kit file → no kit exemptions (today's `is_exempt` miss).
2. **Product register path (live):** always `config/product/file_exemptions.txt`. Missing worktree file → skip product load.
3. **Validate** every product **data** line in the worktree file (if present) **before** any merge:
   - uniqueness and kit-dup keys are awk `$1` (not the raw line);
   - cap pattern is the same as `exempt_cap`: `# *[0-9]+ *lines` (`QG_EXEMPT_UNIT=lines`);
   - path passes the product-app predicate above;
   - path contains no `*`, `?`, `[`;
   - `$1` is not already in the kit register;
   - `$1` is unique in the product file.
4. Any validation failure exits non-zero with the **source register path** (never the mktemp path) plus the reason. Do not skip bad lines.
5. **Apply set** (which product lines may exempt a scanned file):
   - `staged`: lines from the **index** (`git show :config/product/file_exemptions.txt`). Missing from index = no product exemptions applied.
   - `tree`: lines from the worktree file (CI checkout ≡ HEAD).
   Worktree-only lines still go through step 3 (a dirty kit-path line fails even on a docs-only commit) but do not exempt in staged mode.
6. Merge is union: kit lines + **apply-set** product lines. Write a merged temp file, `trap 'rm -f "$MERGED"' EXIT`, point `EXEMPT_FILE` at it, reuse `is_exempt` / `exempt_cap`. Do **not** edit `tools/check_lib.sh` (shared with folder-size; header forbids project-side edits).
7. Cap check: exempt file with `lines > N` fails. Non-exempt file with `lines > 300` fails. Over-cap stderr names the **register that granted the cap** (`config/product/file_exemptions.txt` vs `tools/file_exemptions.txt`). Never tell a product operator to update the kit file for a product cap.
8. Staged vs tree still differ on **which TypeScript files are scanned**. Product validation (step 3) is identical.

No env flag that disables the kit register. This is not zero-edit “product mode” and not a `QG_FILE_MODE` value. Presence of the product file is the only extra input.

`QG_FILE_EXEMPTIONS`, `QG_FILE_PRODUCT_EXEMPTIONS`, `QG_FILE_MAX`, `QG_FILE_ROOTS` are **harness-only**. Live invocations (`lefthook.yml` file-length, `quality-gates:check`) set only `QG_FILE_MODE` and must `env -u` the other `QG_FILE_*` vars so ambient shell exports cannot replace the kit register. Honor those vars only when a harness sentinel file exists (same class as `ZERO_EDIT_HARNESS_SENTINEL`). Products create the default path; they do not export `QG_FILE_PRODUCT_EXEMPTIONS`. Consumer contract: product-validate / product CI must not export `QG_FILE_MAX` or `QG_FILE_EXEMPTIONS`.

Three-way default literal, kept in sync: `config/product/file_exemptions.txt` in `tools/qg.conf` (`: "${QG_FILE_PRODUCT_EXEMPTIONS:=config/product/file_exemptions.txt}"`), `.claude/stack.yml` `quality_gates.file_length.product_exemptions_file`, and the script fallback after source.

### Error contract

| Input | Exit | stderr must name |
|-------|------|------------------|
| Product path not matching the product-app predicate (incl. `packages/`, `tools/`, `apps/example-web/`, `apps/example-web-branded/`, `apps/mcp-example/`, `apps/acme/foo.ts`, `scripts/`, `config/`, repo root) | ≠ 0 | **product file path** + path + not-product-app |
| Product path with `.` / `..` / leading `./` / absolute `/` | ≠ 0 | product file path + path + non-canonical |
| Product line without `# *[0-9]+ *lines` | ≠ 0 | product file path + path + missing cap |
| Product path with `*` / `?` / `[` | ≠ 0 | product file path + path + wildcard |
| Product `$1` already in kit register | ≠ 0 | product file path + path + duplicate vs kit |
| Same `$1` twice in product file (even if comments differ) | ≠ 0 | product file path + path + duplicate |
| Product file absent | 0 (if tree otherwise green) | — |
| Product file comments-only | 0 (if tree otherwise green) | — |
| Product-allowed path, `lines > N` | ≠ 0 | path + exceeds exemption cap N + **product** register path |
| Product-allowed path, `lines ≤ N` | 0 for that file | — |
| Invalid product file + `staged` + zero staged TS | ≠ 0 | product file path + reason |

### Docs + wiring

- `docs/kit/product-consumer-contract.md`: add `config/product/file_exemptions.txt` to the optional product-only files list (~L284) and to the “configuration without forking kit files” table (L73). Document copy-from-`config/kit/file_exemptions.example.txt`. Cutover: after pull, **one commit** deletes product rows from `tools/file_exemptions.txt` and adds them to the product file (a two-step add-then-delete fails the kit-dup check). Pre-migration (product rows still only in the kit file) keeps working via unchanged kit semantics. product-validate must not export `QG_FILE_MAX` / `QG_FILE_EXEMPTIONS`.
- `.claude/stack.yml` `quality_gates.file_length`: keep `exemptions_file: tools/file_exemptions.txt`, add `product_exemptions_file: config/product/file_exemptions.txt`.
- `tools/qg.conf`: default `QG_FILE_PRODUCT_EXEMPTIONS` to that same literal.
- `lefthook.yml` file-length: comment names both registers; hook stays `QG_FILE_MODE=staged` live checker only (`env -u` other `QG_FILE_*`). Do **not** add `test:file-length` to lefthook or to the short `validate` script. Do **not** nest the self-test inside `quality-gates:check`.
- `docs/kit/testing.md`: add **CP-FILE-LENGTH** naming `bun run test:file-length`, `scripts/kit/test-file-length.sh`, and `(in validate:full)` only. Do not enumerate sibling bar steps (CP-BAR-SSOT).
- Root `package.json`: `test:file-length` → `scripts/kit/test-file-length.sh`, included in `validate:full` (SSoT). CI needs no edit (`ci.yml` already runs `validate:full` by name).

### Tests (CP-FILE-LENGTH)

`scripts/kit/test-file-length.sh` builds a **temp git repo** (`mktemp` + `git init`), unsets `GIT_DIR` / `GIT_WORK_TREE` / `GIT_COMMON_DIR`, plants repo-relative `apps/<product>-web/…` plus both registers, `git add`s for staged rows, invokes the **live** `tools/check_file_length.sh` by absolute path with `-C "$TMP"`. Create the harness sentinel before setting `QG_FILE_*`. Keep `QG_FILE_ROOTS=apps packages`. Never plant under the live `apps/` or `packages/`. Never run staged mode against the caller index.

| Case | Expect |
|------|--------|
| Allowed `apps/acme-web/...` under declared cap | exit 0 |
| Same path over declared cap | exit ≠ 0; stderr names product register |
| Product path `packages/...` | exit ≠ 0 |
| Product path `apps/example-web/...` | exit ≠ 0 |
| Product path `apps/example-web-branded/...` | exit ≠ 0 |
| Product path `apps/mcp-example/...` | exit ≠ 0 |
| Product path `apps/acme/foo.ts` (no suffix) | exit ≠ 0 |
| Product path `apps/acme-web/../../packages/ui/...` | exit ≠ 0 |
| Product path `./apps/acme-web/...` | exit ≠ 0 |
| Product path `tools/...` | exit ≠ 0 |
| Product line without cap | exit ≠ 0 |
| Product wildcard path | exit ≠ 0 |
| Path listed in both registers | exit ≠ 0 |
| Two product lines, same `$1`, different comments | exit ≠ 0 |
| Product file absent | exit 0 (otherwise green tree) |
| Invalid product file + `staged` + zero staged TS | exit ≠ 0 |
| Staged TS over 300 + matching product line only in worktree (not index) | exit ≠ 0 |
| Same allow + kit-path refuse in `staged` and `tree` | both modes agree on exit |

## Out of Scope

- Disabling the 300-line default for product trees.
- Cap-less product exemptions or global / recursive wildcards.
- Making kit files (`tools/file_exemptions.txt`, `tools/qg.conf`) consumer-configurable.
- Executing the LGU / EtherOs file moves in those product repos.
- Folder-size product surface (`tools/folder_exemptions.txt`).
- Changing kit-register semantics (kit lines may still omit a cap = full bypass, existing back-compat).
- Policing a product wrapper that still exports `QG_FILE_MAX` after the contract sentence (kit invoke sites are pinned; product-validate is docs).

## Data Model & Consumers

### Data structure

| Record | Fields | Frozen / mutable |
|--------|--------|------------------|
| Exemption line | `$1` path (canonical repo-relative), cap `# N lines`, optional tracking/rationale | Format frozen; product cap mandatory |
| Kit register | set of `$1` | Kit-owned; this issue does not rewrite live kit rows |
| Product register | set of `$1` | Product-owned; optional file |
| Apply set | subset of product `$1` | staged = index; tree = worktree |
| Merged register | union(kit, apply set) | Ephemeral mktemp; trap-cleaned |
| Product-app path | `apps/<name>-{api,web,mcp}/` with `name ≠ example` and first segment ≠ `mcp-example` | Narrower than zero-edit `isFreeProductAppPath` |

No D1 / API / UI types.

### Consumers

| Consumer | Fields consumed | When | Status |
|----------|----------------|------|--------|
| `tools/check_file_length.sh` | both registers, validate, apply set, merge | every gate run | This issue |
| `tools/qg.conf` | default product path literal | source at start | This issue |
| Lefthook pre-commit `file-length` | staged TS + index apply set | pre-commit | This issue |
| `quality-gates:check` | tree scan | `validate:full` / pre-push | This issue |
| `scripts/kit/test-file-length.sh` | fixture registers | `validate:full` | This issue |
| Product repos (LGU, EtherOs) | product file rows | after they pull | Not this repo |

## Breadboard

### Gate

| ID | Affordance | Handler | Data |
|----|------------|---------|------|
| G1 | Kit register load | `tools/check_file_length.sh` + `qg.conf` | always `tools/file_exemptions.txt` live |
| G2 | Product register load | same | always `config/product/file_exemptions.txt` live; absent = skip |
| G3 | Product-line validator | same, **before** `case "$MODE"` | predicate, cap, canonical path, `$1` unique, no kit-dup |
| G4 | Merge + cap check | mktemp → `is_exempt` / `exempt_cap` | union(kit, apply set); over-cap names source |
| G5 | `QG_FILE_MODE=staged` | `scan_staged` after G1–G4 | apply set = index |
| G6 | `QG_FILE_MODE=tree` | `scan_tree` after G1–G4 | apply set = worktree |

### Docs / contract

| ID | Affordance | Handler | Data |
|----|------------|---------|------|
| D1 | Consumer contract | `docs/kit/product-consumer-contract.md` | optional-files list + config table + one-commit cutover |
| D2 | stack.yml + qg.conf | `.claude/stack.yml` + `tools/qg.conf` | same literal product path |
| D3 | Example template | `config/kit/file_exemptions.example.txt` | commented `apps/<product>-web/...` line |
| D4 | CP-FILE-LENGTH | `docs/kit/testing.md` + `package.json` `validate:full` | `test:file-length` only |
| D5 | Lefthook comment + `env -u` | `lefthook.yml` file-length | staged live checker; both registers named |

### Tests

| ID | Affordance | Handler | Data |
|----|------------|---------|------|
| T1 | Temp **git** repo matrix | `scripts/kit/test-file-length.sh` | allow / refuse / dup / cap / absent / staged-empty / unstaged apply / both modes |

### Wiring

```text
G1 → G2 → G3 → G4 → (G5 | G6)
lefthook pre-commit: MODE=staged + env -u other QG_FILE_*  → live checker only
quality-gates:check: MODE=tree + env -u other QG_FILE_*     → live checker
test:file-length:    temp git repo + sentinel + abs script  → validate:full only
```

G5/G6 never skip G3. V2 demos `bash scripts/kit/test-file-length.sh`. V3 adds the npm script name to `validate:full`.

## Slices

| # | Name | Scope (IDs) | Demo criteria |
|---|------|-------------|---------------|
| V1 | Checker merge + fail-closed product validation | G1–G6 | Product `apps/acme-web` under cap passes; kit-path / unsuffixed / branded-example / no-cap / wildcard / `..` / dup fail; staged empty + bad product file fails; staged TS + worktree-only exemption fails |
| V2 | CP-FILE-LENGTH harness | T1 | `bash scripts/kit/test-file-length.sh` green on the matrix |
| V3 | Contract + stack + example + bar wiring | D1–D5 | Contract table + optional list; both stack.yml paths; example exists; lefthook comment; `package.json` `test:file-length` listed in `validate:full` |

## Success Criteria

- [ ] `tools/file_exemptions.txt` remains the kit-owned register and stays under the `tools/` zero-edit prefix
- [ ] A product can declare explicit caps for `apps/<product>-{api,web,mcp}/**` in `config/product/file_exemptions.txt`
- [ ] A product exemption that is not a canonical `apps/<product>-{api,web,mcp}/` path fails the gate

```yaml
priced:  "a product exemption line cannot exempt a kit-owned or non-product-app path"
not:     "a comment in the consumer contract, or a denylist of example filenames grepped in docs"
oracles:
  - "product file lists packages/ui/src/components/ui/sidebar.tsx → gate exit ≠ 0"
  - "product file lists apps/example-web/src/routes/notes.tsx → gate exit ≠ 0"
  - "product file lists apps/example-web-branded/src/god.tsx → gate exit ≠ 0"
  - "product file lists apps/mcp-example/src/index.ts → gate exit ≠ 0"
  - "product file lists apps/acme/foo.ts → gate exit ≠ 0"
  - "product file lists tools/check_file_length.sh → gate exit ≠ 0"
  - "product file lists apps/acme-web/../../packages/ui/src/components/ui/sidebar.tsx → gate exit ≠ 0"
claim:   [fail-closed]
```

- [ ] A product line without an explicit `# *[0-9]+ *lines` cap fails the gate

```yaml
priced:  "product exemptions require an explicit integer cap; absence is not a bypass"
not:     "kit-register back-compat (cap-less kit line still bypasses)"
oracles:
  - "product file lists apps/acme-web/src/god.tsx with no # N lines → gate exit ≠ 0"
claim:   [fail-closed]
```

- [ ] A product wildcard (`*`, `?`, `[`) fails the gate

```yaml
priced:  "product exemption paths are exact; globs do not match a tree"
not:     "documentation that says no wildcards"
oracles:
  - "product file lists apps/acme-web/** → gate exit ≠ 0"
  - "product file lists apps/acme-web/*.tsx → gate exit ≠ 0"
claim:   [fail-closed]
```

- [ ] A product `$1` already listed in the kit register fails (product cannot override or neutralize a kit cap)

```yaml
priced:  "union merge does not let the product replace a kit cap"
not:     "last-line-wins concatenation"
oracles:
  - "same path in tools/file_exemptions.txt and the product file → gate exit ≠ 0"
claim:   [fail-closed]
```

- [ ] Duplicate `$1` inside the product file fails even when comments differ

```yaml
priced:  "product uniqueness is the path field, not the raw line"
not:     "first-match silent ignore of the second cap"
oracles:
  - "two product lines same $1 different comments → gate exit ≠ 0"
claim:   [fail-closed]
```

- [ ] Declared product cap is enforced: `lines > N` fails and stderr names the product register; `lines ≤ N` passes
- [ ] A missing product exemptions file is accepted
- [ ] Product validation runs before scan in both modes, including `staged` with zero staged TS
- [ ] `staged` apply set is the index; a worktree-only product line does not exempt a staged over-length file
- [ ] CP-FILE-LENGTH covers the matrix in Tests (temp git repo; no live apps/packages plant)
- [ ] Consumer contract and `.claude/stack.yml` document both surfaces at the literal path `config/product/file_exemptions.txt`
- [ ] `config/kit/file_exemptions.example.txt` exists with a commented product-app line
- [ ] After pull, listing the moved rows only in `config/product/file_exemptions.txt` is sufficient; this repo does not perform the LGU/EtherOs move; cutover is one commit (delete kit rows + add product file)
- [ ] `test:file-length` is invoked from root `validate:full`; not from leftover or the short `validate` script
- [ ] Folder-size exemptions are unchanged
- [ ] `tools/check_lib.sh` is not edited

## Edge Cases

| Case | Handling |
|------|----------|
| Product file missing | Skip product load; kit register only |
| Product file comments / blank only | Valid empty register |
| Kit file missing | No kit exemptions; product validation still runs if product file exists |
| Cap-less **kit** line | Unchanged full bypass (back-compat). Product lines must not get this. |
| Path with spaces | Fail via existing `assert_exempt_no_spaces` (name the source register, not mktemp) |
| `apps/example-api/...` / `apps/example-web/...` | Refuse (`name=example`) |
| `apps/example-web-branded/...` | Refuse (no `-(api\|web\|mcp)` suffix on that segment) |
| `apps/acme-api/foo.ts` / `apps/acme-web/...` / `apps/acme-mcp/...` | Allow if other rules pass |
| `apps/acme/foo.ts` | Refuse (no required suffix) |
| `apps/../packages/...` or `apps/acme-web/../../packages/...` | Refuse (non-canonical) |
| Kit clone | No live `config/product/file_exemptions.txt`; keep `.gitkeep`; example lives under `config/kit/` |
| Ambient `QG_FILE_EXEMPTIONS` / `QG_FILE_MAX` at leftover / `quality-gates:check` | Unset; kit register stays `tools/file_exemptions.txt` |
| Product wrapper exports `QG_FILE_MAX` | Contract forbids; not priced in the kit checker |
| Staged TS, product line only in worktree | Validate worktree (may fail); do not apply the line |
| Pre-migration product rows still in kit file only | Still work (kit semantics). Do not also list them in the product file until the kit rows are gone. |

## Open Questions

None.
