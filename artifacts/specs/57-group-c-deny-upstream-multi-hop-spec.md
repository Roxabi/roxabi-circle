---
title: "Group C — deny-upstream multi-hop + CP-DENY tests"
issue: 57
status: approved
tier: F-lite
date: 2026-08-02
parent: 54
frame: artifacts/frames/57-group-c-deny-upstream-multi-hop-frame.md
expert_review: "architect+doc-writer+product-lead 2026-08-02 — path resolution, Bun JSON, harness matrix, validate:full, SC4/SC7/SC9 tightened"
---

## Context

- **Source:** approved frame `artifacts/frames/57-group-c-deny-upstream-multi-hop-frame.md` (analyze skipped, F-lite)
- **Parent:** #54 Group C — deny-upstream multi-hop + proof (bounce safety)
- **Siblings:** #55 Group A (playbook, closed) · #56 Group B (product-validate templates, closed)
- **Promoted-from:** frame + issue #57 body (work item 1 + design constraints)

## Goal

Multi-hop / private-bounce product clones cannot accidentally push the kit **or** an intermediate chassis: extend `deny-upstream-push.sh` with axis-safe config/env extension, prove it with **CP-DENY** table tests, and document bounce remotes + client-side limits.

## Users

| Role | Need |
|------|------|
| Product eng (bounce) | Chassis URL denied without forking the kit script; escape via documented env/config only |
| Kit maintainer | Kit defaults stay `upstream` + `silex-boilerplate`; no chassis product names in kit code |
| Reviewer / dogfood | Automated proof of deny paths; honest “client-side UX” docs |
| CI | Harness fails if guard is deleted/weakened |

## Expected Behavior

1. **Kit repo** (`origin` URL contains kit identity, default `silex-boilerplate`) → script **no-ops** (exit 0) for any remote — including `upstream` if present.
2. **Product repo** → push to remote named **`upstream`** → **denied** (exit 1) with clear stderr (generic: denied parent/kit remote — not kit-only copy).
3. **Product repo** → push to any remote whose URL contains **`silex-boilerplate`** → **denied** (rename trick).
4. **Product repo** → push to a remote whose URL matches an **extended** substring:
   - via **env alone** (`DENY_UPSTREAM_URL_SUBSTRINGS`), **and**
   - via **product JSON alone** (`docs/product/deny-upstream.json`)  
   each independently denies a non-kit chassis URL (multi-hop).
5. **Product repo** → push to an innocent remote (e.g. `origin` → product URL, no deny substrings) → **allowed**.
6. **Extension without dual-edit:** product sets env and/or commits product JSON — never patches `scripts/deny-upstream-push.sh`.
7. **Optional kit config reader:** script may read `config/deny-upstream-remotes.json` when present (`urlSubstrings[]`). **Do not ship product chassis names.** Prefer **omit file** until kit needs a generic extra default (missing = empty extend). No SC requiring the file to exist.
8. **CP-DENY** harness (`scripts/test-deny-upstream.sh`) runs the normative table below in **temp git repos** (mirror dogfood self-sim: rename origin so kit substring does not false-trigger kit mode). Invokes script with remote name/URL args; origin from real remotes in the fixture tree.
9. **`test:deny-upstream`** is wired in root `package.json` and **required** in `validate:full` (pure bash harness is cheap).
10. **Docs (both surfaces):**
    - `docs/product-consumer-contract.md` — remotes § + optional product files list includes `docs/product/deny-upstream.json`
    - `docs/playbooks/start-product.md` — §2 deny / remotes: bounce topology, multi-hop extension recipe, client-side honesty
    - Content checklist: `origin` = product · `upstream` = immediate parent only · `pushUrl=no_push` · env + product JSON recipe · hook is client-side (`LEFTHOOK=0` / `--no-verify` bypass) · real integrity = GH write ACLs · misconfigured product with `origin` still kit stays kit no-op
11. **`docs/testing.md`** adds **CP-DENY** inventory row (same shape as other CP-\* rows: claim + path to harness).

## Data Model & Consumers

Policy domain — “entities” are deny inputs and effective rules, not DB tables.

**Data structure:** [Deny policy layered model](../visuals/57-group-c-deny-upstream-multi-hop-data-model.html)  
**Consumer map:** [Who uses deny-upstream policy](../visuals/57-group-c-deny-upstream-multi-hop-consumers.html)

| Consumer | Facts consumed | When | Status |
|----------|----------------|------|--------|
| Product eng | remote name/url, env, `docs/product/deny-upstream.json` | every `git push` (lefthook) | this issue |
| Kit maintainer | builtin rules + optional kit config reader | kit PRs | this issue |
| CP-DENY harness | script exit codes per fixture | `validate:full` / pre-push | this issue |
| Reviewer | playbook + contract bounce § | PR review | this issue |
| GitHub ACLs | org write perms | always | future (docs only) |

### Effective policy (normative)

```text
REPO_ROOT := git rev-parse --show-toplevel   # NOT $PWD — harness/lefthook cwd may differ
origin_url := git -C REPO_ROOT remote get-url origin

is_kit := origin_url case-sensitive-contains "silex-boilerplate"
if is_kit → exit 0

substrings := { "silex-boilerplate" }
           ∪ read_json(REPO_ROOT/config/deny-upstream-remotes.json).urlSubstrings?   # optional; missing=∅
           ∪ read_json(REPO_ROOT/docs/product/deny-upstream.json).urlSubstrings?     # product; missing=∅
           ∪ env_tokens(DENY_UPSTREAM_URL_SUBSTRINGS)  # comma-split, trim, drop empty

if remote_name == "upstream" → deny
if any s in substrings where remote_url case-sensitive-contains s → deny
else → exit 0
```

**JSON parse:** use **Bun** (same family as zero-edit tooling). Missing file → empty. Invalid JSON → **warn once on stderr + ignore file** (still apply other sources). **Do not require `jq`.**

**Product config schema (minimal):**

```json
{
  "urlSubstrings": ["my-private-chassis"]
}
```

Prefer **repo-unique** substrings (full chassis repo slug), not generic tokens (`api`, `cf`) to reduce false positives.

## Breadboard

### U — User / machine affordances

| ID | Affordance | Handler (file) | Data / fact |
|----|------------|----------------|-------------|
| U1 | Multi-hop deny decision | `scripts/deny-upstream-push.sh` | REPO_ROOT resolution; name + URL union; kit no-op; generic deny message |
| U2 | Optional kit config reader | same script + optional `config/deny-upstream-remotes.json` | missing = empty; no required commit |
| U3 | Product extend file | `docs/product/deny-upstream.json` (product) | zero-edit free path |
| U4 | Env extend | `DENY_UPSTREAM_URL_SUBSTRINGS` | comma-split · trim · drop empty |
| U5 | Lefthook pre-push wire | `lefthook.yml` | unchanged call shape `{1}{2}` |
| U6 | CP-DENY table harness | `scripts/test-deny-upstream.sh` | temp git fixtures; 6-row matrix + weaken probe |
| U7 | package.json + validate:full | root `package.json` | `test:deny-upstream` **required** in `validate:full` |
| U8 | testing.md CP-DENY | `docs/testing.md` | row: claim + `scripts/test-deny-upstream.sh` |
| U9 | Bounce remotes docs | **both** contract + `start-product.md` | checklist in EB10 |

### N — Narrative nodes

| ID | Node | Role |
|----|------|------|
| N1 | Deny script | Single decision point |
| N2 | Policy sources | Builtin + optional kit config + product + env |
| N3 | Lefthook | Invokes U1 on pre-push |
| N4 | Harness | Proves matrix in temp repos |
| N5 | Docs SSoT | Contract + playbook + testing |
| N6 | Kit origin | Escape hatch for kit itself |

### S — System edges

| From | To | Edge |
|------|-----|------|
| N3 | U1 | pre-push passes remote name/url |
| U2,U3,U4 | N2 | extend substrings |
| N2 | U1 | effective denylist |
| N6 | U1 | early exit allow |
| U6 | U1 | invokes script under fixture trees |
| U8,U9 | N5 | docs |
| U7 | U6 | CI/local + validate:full |

## Slices

| Slice | Demo | Affordance IDs | Notes |
|-------|------|----------------|-------|
| **S1 — Multi-hop deny + config/env** | Env-only chassis deny **and** product-JSON-only chassis deny; kit origin allows; generic deny stderr; REPO_ROOT reads | U1–U5 | Core |
| **S2 — CP-DENY harness + gate** | 6-row matrix green; name-deny weaken probe fails; `test:deny-upstream` in `validate:full` | U6–U7 | Proof |
| **S3 — Docs honesty** | CP-DENY row; contract remotes § + optional files; playbook §2 bounce + multi-hop recipe + client-side | U8–U9 | Edit existing § |

**Files touched (expected):** `scripts/deny-upstream-push.sh`, `scripts/test-deny-upstream.sh` (new), `package.json`, `docs/testing.md`, `docs/product-consumer-contract.md`, `docs/playbooks/start-product.md` · optional omit kit JSON file.

Vertical order: **S1 → S2 → S3**. Prefer **single PR** shipping all three.

### Normative harness matrix (S2)

| # | Mode | Setup | Assert exit |
|---|------|-------|-------------|
| 1 | Kit origin | origin URL contains `silex-boilerplate` | `upstream` → **0** |
| 2 | Product | origin product URL; remote name `upstream` | **1** |
| 3 | Product | remote URL contains `silex-boilerplate` (any name ≠ only-name case) | **1** |
| 4 | Product | env `DENY_UPSTREAM_URL_SUBSTRINGS=private-chassis-fixture` only | chassis URL → **1** |
| 5 | Product | `docs/product/deny-upstream.json` with that slug only (env unset) | chassis URL → **1** |
| 6 | Product | innocent remote name+URL | **0** |

**Weaken probe (SC7):** temporarily remove name=`upstream` deny (or equivalent) → row 2 must fail (harness detects guard missing). Implementation may use a dedicated negative subtest or documented mutation in harness comments + assert that row 2 depends on name check.

Fixture chassis slug: **`private-chassis-fixture`** (fake; never real product names).

## Edge cases

| Case | Handling |
|------|----------|
| Product renames remote to `chassis` but URL is kit | URL substring still denies |
| Product remote name `upstream` but URL is innocent | Still deny by **name** |
| Empty env / missing JSON | Builtin rules only |
| Invalid product JSON | Warn + ignore file; still apply other sources |
| Kit origin with extra remotes | Always allow |
| `LEFTHOOK=0` / `--no-verify` | Documented bypass — not fixed here |
| Chassis name in kit defaults | **Forbidden** — product config/env only |
| Short substring FPs | Docs: use repo-unique slugs |
| Case sensitivity | Case-sensitive substring (fine for GH URLs) |
| Product `origin` still points at kit | Stays kit no-op → setup bug; one line in bounce docs |
| Windows / `file://` URLs | Substring on raw URL string |
| Dogfood optional smoke | Not required if U6 covers |

## Success Criteria

- [ ] SC1: Kit origin → script exits 0 for remote name `upstream` and for kit-like URLs
- [ ] SC2: Product + remote name `upstream` → exit 1
- [ ] SC3: Product + remote URL containing `silex-boilerplate` → exit 1
- [ ] SC4a: Product + **env alone** extended substring → chassis URL exit 1
- [ ] SC4b: Product + **`docs/product/deny-upstream.json` alone** extended substring → chassis URL exit 1
- [ ] SC5: Product + innocent remote → exit 0
- [ ] SC6: No product/chassis repo names hard-coded as required kit defaults
- [ ] SC7: Harness covers SC1–SC5 (matrix rows 1–6); weaken name-deny → row 2 / SC2 fails
- [ ] SC8: `docs/testing.md` lists **CP-DENY** with path `scripts/test-deny-upstream.sh`
- [ ] SC9: **Both** `docs/product-consumer-contract.md` **and** `docs/playbooks/start-product.md` document bounce remotes + multi-hop extension + client-side limitation (checklist EB10)
- [ ] SC10: `lefthook.yml` still invokes the kit script (no product dual-edit required)
- [ ] SC11: `package.json` has `test:deny-upstream` and it is part of `validate:full`

## Non-goals (carry from frame)

- Foreign GitHub App installs
- Product CI templates (Group B)
- Full playbook rewrite (Group A) beyond bounce/deny sections
- Server-side ACL enforcement
