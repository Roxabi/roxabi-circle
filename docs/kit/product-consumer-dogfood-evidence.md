# Product consumer dogfood evidence

Record proof of zero-edit / deny-upstream for the **consumer contract** (ADR-0009 / #107).

| Kind | Status |
|------|--------|
| **Self-sim harness** (`bun run dogfood:zero-edit`) | **Current** — local temp repos only; wired in `validate:full` via `test:dogfood-zero-edit` |
| **Live product clone** | **Not re-run since ADR-0009 / #107** — historical row below is superseded semantics |

> **Threat model:** inheritance marker + zero-edit are a **process / CI gate**, not tamper-resistant provenance. Self-sim proves checker behaviour; live product proof requires a real product repo with `config/product/inheritance.json` (not `docs/product/kit-baseline` / `ZERO_EDIT_BASE_REF` — removed in #107).

---

## Historical — live product-mode (superseded semantics)

**Date:** 2026-08-13 · **Operator:** Mickael · **Product:** `Roxabi/roxabi-circle`

This run predates ADR-0009 `#107` cleanup. It used **`docs/product/kit-baseline`** and **`upstream/main`**-shaped wording — **not** the current normative base (`config/product/inheritance.json` → `upstreamCommit` only). Keep for audit trail only; do **not** treat as current live proof until re-run on a product with the inheritance marker.

| Field | Value (2026-08-13) |
|-------|---------------------|
| Product repo | `Roxabi/roxabi-circle` · local `~/projects/roxabi/roxabi-circle` |
| Origin | `git@github.com:Roxabi/roxabi-circle.git` |
| Kit parent remote | `upstream` fetch `git@github.com:Roxabi/roxabi-boilerplate-cf.git` · **push `no_push`** |
| Kit parent SHA (dogfood time) | `628d942b856058e3cea10e789caa0e48fb670bcc` |
| Product inherit commit | `9755f90` (`chore(kit): merge upstream/main @ 628d942`) |
| Legacy baseline file (removed #107) | `docs/product/kit-baseline` → `628d942…` |
| Harness | `bash scripts/kit/dogfood-zero-edit.sh ~/projects/roxabi/roxabi-circle` → exit 0 |
| Also | `bun run dogfood:zero-edit` (`--self-sim`) → exit 0 |

### Results (2026-08-13 — historical)

| Check | Result |
|-------|--------|
| `upstream` push URL | `no_push` |
| deny-upstream (`name=upstream`) | blocked |
| `@roxabi/circle-api` tests after inherit | 102 pass |

**Not claimed then or now:** platform JTBD D2/D3 / second compose. This file only prices the **consumer zero-edit contract**.

---

## Current — self-sim only (kit repo)

Re-run from kit HEAD:

```bash
bun run dogfood:zero-edit
# or: bun run test:dogfood-zero-edit   # same harness, in validate:full
```

Proves (local temp repos, no network):

- Roxabi kit → mirror → product chain with three distinct commits
- `config/product/inheritance.json` base; stale `refs/remotes/upstream/main` ignored (#103)
- Protected dual-edit fails · upstream push URL `no_push` · deny-upstream blocks product → `upstream`

**Not claimed:** live greenfield product on a real remote with inheritance marker post-#107. Re-fill a **Live product** section after the next product inherit using `config/product/inheritance.json`.

Do not commit secrets.
