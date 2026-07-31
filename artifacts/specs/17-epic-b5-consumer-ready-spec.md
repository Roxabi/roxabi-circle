---
title: "Spec — B5 · Consumer ready (playbook + zero-edit product)"
issue: 17
spark: 118
status: draft
tier: M-docs-dogfood
date: 2026-07-30
analysis: artifacts/analyses/17-epic-b5-consumer-ready-analysis.md
contract: docs/product-consumer-contract.md
axial: docs/architecture/adr/0001-primary-axis-packages-compose-apps.md
---

# Spec #17 — Epic B5 · Consumer ready

## Context

- **Issue:** [#17](https://github.com/go-silex/silex-boilerplate/issues/17) · Spark **#118**
- **Analysis:** Shape **B** (playbook + dogfood real product) — `artifacts/analyses/17-epic-b5-consumer-ready-analysis.md`
- **Contract SSoT (existing):** [`docs/product-consumer-contract.md`](../../docs/product-consumer-contract.md)
- **Related:** Spark **#88** (playbook start projet · Plugins #84), Spark **#94** (DoD template client), Spark **#124** (dogfood pull), GH epics B1–B4 as blockers/sequencing
- **Naming:** This epic **≠** AGENTS legacy phase B5 (MCP/email already shipped)

## Goal

Make the kit **consumer-ready**: one **actionable playbook** for starting a product on Chemin A, plus **one proven dogfood** product repo that merges `upstream` and stays green on **zero-edit** (+ banlist) **without** dual-editing kit paths — and **without** implementing share M0 métier.

## Users

| Persona | Need |
|---|---|
| GOSILEX engineer | Day-1 product bootstrap without reverse-engineering AGENTS |
| Product repo owner (e.g. silex-share) | Pull kit safely; zero-edit + CI baseline |
| Kit maintainer | No product PRs that fork lefthook/workflows/packages |
| Agent / AI session | Single playbook path + hard gates |

## Non-goals (out of scope)

| Out | Why |
|---|---|
| Share M0 métier (upload, slug, R2 `share/`, ACL, zip, presign video…) | Explicit epic hors scope; product frame later |
| Scaffold CLI / `create-gosilex-app` | Shape C deferred |
| Better Auth GitHub OAuth product / invites UI | B2/B3 |
| MasterData / jobs / presign **app patterns** (B6 — no `@gosilex/masterdata` package) | B6 |
| Full “extract → re-run validate:full after delete product apps” CI theatre | Gap-fix only if dogfood/extract lies |
| Branch protection (GitHub Free) | Process + merge-on-green only |
| Deploy share.gosilex.com | Product ops |

## Expected behavior

1. **Playbook** exists in the kit and is the single entry for “start a product on this boilerplate”.
2. Following the playbook, a product has: remotes (`origin` product, `upstream` kit fetch-only), lefthook from kit (deny-push), no kit path dual-edits.
3. Product may add only allowed trees: `apps/<product>-*`, `docs/product/*`, `scripts/product/*`, `.github/workflows/product-*`, design overrides under product web.
4. After `git merge upstream/main`, product updates `docs/product/kit-baseline` and `bun run zero-edit` is green (exceptions only if justified + time-boxed).
5. Banlist remains green on kit packages/examples (product domain never lands in those trees).
6. Dogfood evidence is recorded (issue comment and/or product PR): commands + SHAs.

## Playbook outline (deliverable)

**Proposed path:** `docs/playbooks/start-product.md`  
(Alternative acceptable: `docs/start-product-playbook.md` — one file, linked from README + contract.)

### 0. Preconditions

- [ ] Access to org `go-silex` private repos
- [ ] Bun + Node toolchain per kit README
- [ ] Read ADR-0001 (axial) + this playbook + contract (do not improvise dual-edit)

### 1. Create product repo

```text
1. Create private go-silex/<product> (empty or history from kit)
2. origin → product
3. upstream → git@github.com:go-silex/silex-boilerplate.git
4. git remote set-url --push upstream no_push
5. bun install && bunx lefthook install
6. Copy *.example → gitignored local env only
```

### 2. Zero-edit posture (always)

| May | Must not |
|---|---|
| New `apps/<product>-api\|web\|mcp` | Edit `packages/*` for métier/brand |
| `docs/product/**` | Edit `apps/example-*` into product |
| `product-*.yml` workflows | Edit kit `ci.yml` / `lefthook.yml` / root `package.json` scripts |
| CSS token overrides + compose wrappers | Fork `packages/ui` components |
| Time-boxed `docs/product/zero-edit-exceptions.json` | Open-ended exceptions without `expires`/`ticket` |

### 3. Capability map (pointers — not re-implementation)

| Concern | Kit where to look | Product does |
|---|---|---|
| **Auth** (BA session cookie + `sk_`) | `@gosilex/auth`, ADR-0002 **BA-only** | Mount guards; env secrets; **do not** reimplement session crypto or reintroduce HMAC |
| **Auth stack** | After B2 cut: BA-only; no `AUTH_SESSION_ADAPTER` | Wire BA + secrets; dual path is cookie \| Bearer only |
| **RBAC / multi-tenant** | ADR-0003 + example-api org/modules | Compose guards; product routes under product app |
| **UI / tokens** | `@gosilex/ui` + example-web | Import primitives; **override CSS tokens** in product app |
| **MasterData** | Not required for B5 exit — **B6 app pattern** (copy example structure; **no** `@gosilex/masterdata`) | Stub only if product needs; package only with ADR + A8 |
| **Errors / i18n** | `@gosilex/core`/`types`, example-web catalogs | Codes stable; copy in product UI |
| **MCP** | `@gosilex/mcp` + `mcp-example` | `apps/<product>-mcp` tools → same API auth |
| **Email** | `@gosilex/email` + Mailpit local + **CF Email** prod (ADR-0004) | Product templates later; no SMTP prod → catcher |
| **CI merge** | `gosilex-ci-app-setup.md` | Org vars/secrets; never fork merge-on-green |

### 4. First product surface (recommended minimum)

```text
apps/<product>-api/          # Hono worker skeleton composing @gosilex/* (health enough)
apps/<product>-web/          # optional day-1; or follow-up ticket
docs/product/AGENTS.md       # product narrative (not root AGENTS.md)
docs/product/kit-baseline    # full SHA of last-merged upstream tip
# optional:
docs/product/zero-edit-exceptions.json
.github/workflows/product-ci.yml
apps/<product>-api/scripts/product-validate.sh
apps/<product>-web/src/theme/product-tokens.css
```

**Forbidden minimum:** patching `example-web` title/brand as “the product”.

### 5. Pull kit upgrades (recurring)

```bash
git fetch upstream
git merge upstream/main          # merge commit preferred
git rev-parse upstream/main > docs/product/kit-baseline
bun run zero-edit
# product validate if present; kit validate:full still green on product tree for kit parts
```

Conflict on protected path → restore kit version; relocate change to product path or design override.

### 6. Checklists (copy into playbook)

**A. Day-1 bootstrap** — remotes, install, env, CI app, first product app dir.  
**B. Zero-edit green** — `kit-baseline`, no dirty protected paths, exceptions valid.  
**C. Design** — tokens/wrap only.  
**D. Before every upstream merge** — contract “can I pull tomorrow?” checklist.  
**E. DoD template client** (#94, short) — kit extractable, examples green, consumer contract linked, playbook linked, no métier in packages.

### 7. Anti-patterns (playbook footer)

Mirror contract: dual-edit lefthook/package.json/workflows; brand examples; domain in packages; `git push upstream`; infinite exceptions.

## Dogfood procedure (deliverable)

### Target selection

| Priority | Repo | When |
|---|---|---|
| **1** | `go-silex/silex-share` | Default named consumer |
| **2** | New `go-silex/silex-consumer-dogfood` | If share dual-edit debt > ~1 day |

### Steps (evidence required)

1. Clone product; confirm remotes (`upstream` fetch, push denied / `no_push`).
2. `git fetch upstream` · note `upstream/main` SHA.
3. Merge `upstream/main` (resolve **only** by restoring kit on protected paths if needed).
4. Ensure `docs/product/kit-baseline` = full SHA of merged kit tip.
5. Run:
   ```bash
   bun run zero-edit
   bun run banlist
   # optional: bun run extract-dry-run
   # product-only: product-validate.sh if exists
   ```
6. **Pass criteria:** zero-edit exit 0; banlist exit 0; no uncommitted dual-edit “fixes” left on protected paths without exception entries.
7. Optional stub: empty/minimal `apps/share-api` (or dogfood name) **health-only** — **no** share domain schema/R2 paths.
8. Record evidence on GH #17 (and product PR if changes pushed to product origin):
   - product repo + branch
   - `upstream/main` SHA
   - `kit-baseline` content
   - command outputs (zero-edit + banlist)
   - list of protected-path restores / exceptions (if any)

### Dogfood failure handling

| Failure | Action |
|---|---|
| zero-edit red on protected path product changed | Restore from base ref; move to product path |
| base ref missing in CI | Add `docs/product/kit-baseline`; full fetch-depth already in kit ci.yml |
| banlist red in packages/examples | **Kit bug or product leaked** — fix in kit PR if kit; never “allow share strings” in packages |
| deny-push not active | Ensure product uses kit lefthook (not a forked divergent file) |

## Kit gaps (only if dogfood proves them)

| Gap | Response in-epic |
|---|---|
| Playbook missing | **Add** playbook file + links from contract (and README pointer if B1 allows) |
| Template missing for product AGENTS | Optional `docs/templates/product-AGENTS.example.md` |
| zones false positive/negative | Patch `config/zero-edit-zones.json` / checker with test note |
| extract-dry-run misleading | Doc note in extract script header / testing.md; hard change only if broken |
| share cannot converge | Document remediation; dogfood greenfield; open product ticket |

## Gates (machine + process)

| Gate | Command / artifact | Epic role |
|---|---|---|
| **CP-ZERO-EDIT** | `bun run zero-edit` | **Must** green on dogfood product |
| **Banlist** | `bun run banlist` | Green on kit trees (run from product clone OK) |
| **Extract** | `bun run extract-dry-run` | Kit tree sanity; gap-fix if needed |
| **Deny upstream** | lefthook + `deny-upstream-push.sh` | Present via kit; smoke: push to upstream fails on product |
| **CI baseline** | `docs/product/kit-baseline` | Present on product for Actions |
| **validate:full** | kit pre-push | Kit remains green; product may add `product-validate` |
| **Playbook review** | human | Checklists complete; no secret examples with real values |

## Success criteria (DoD)

### Playbook

- [ ] Playbook file landed in kit (`docs/playbooks/start-product.md` or agreed path)
- [ ] Sections 0–7 covered (bootstrap, zones, capability map, first surface, pull upgrades, checklists, anti-patterns)
- [ ] Links to contract, zero-edit zones, exceptions example, kit-baseline template, gosilex-ci setup, ADR-0001
- [ ] Auth/RBAC/UI tokens map present (BA default marked provisional until B2 DoD if needed)
- [ ] README and/or contract cross-link playbook (minimal if B1 owns README rewrite)

### Dogfood

- [ ] ≥1 product repo (`silex-share` or dogfood) has correct remotes
- [ ] `git merge upstream/main` completed on that repo (this cycle or documented SHA)
- [ ] `docs/product/kit-baseline` committed and matches merged kit tip
- [ ] `bun run zero-edit` exit 0 on product
- [ ] `bun run banlist` exit 0
- [ ] Evidence commented on GH #17 (paths, SHAs, outputs summary)
- [ ] No share M0 métier introduced in kit packages/examples

### Template / DoD client (#94 overlap)

- [ ] Short “template client ready” checklist exists (playbook appendix **or** `docs/templates/client-ready-dod.md`) covering: examples green, extract/banlist, consumer contract, playbook, zero product strings in packages

### Extract gaps

- [ ] Either no gaps found, **or** filed/fixed kit gap with note in testing.md / extract script
- [ ] Do **not** block epic on full “suite after drop product” unless a concrete false green is proven

## Slices (implementation order)

| Slice | Demo-able increment | Depends |
|---|---|---|
| **S1 — Playbook draft** | Playbook file + links; no product code | B1 preferred for auth truth; can draft provisional |
| **S2 — Dogfood pull** | Product merge + kit-baseline + zero-edit/banlist green + #17 evidence | S1 recommended; B1; remotes |
| **S3 — Kit gapfix** | Zones/scripts/templates only if S2 fails for kit reasons | S2 |
| **S4 — DoD template client** | Short checklist appendix (#94) | S1 |

## Edge cases

| Case | Handling |
|---|---|
| Product has only examples, no `apps/<product>-*` yet | Allowed for zero-edit proof if `docs/product/*` + baseline OK; playbook still recommends first product app |
| Exception required | Valid JSON entry with `expires` + `ticket` + alternatives; renew or delete |
| Shallow CI clone | kit ci.yml already `fetch-depth: 0`; baseline SHA must be in history |
| Product renames remote away from `upstream` | zero-edit uses `ZERO_EDIT_BASE_REF` / kit-baseline; deny-push still blocks kit URL |
| Local archived share vs GH | Dogfood on live clone of GitHub product, not only `.archived` |
| Agent wants to edit `packages/ui` for brand | Playbook: design override only; kit PR if primitive missing |

## Test plan

| ID | Check | How |
|---|---|---|
| T1 | Kit zero-edit still kit-mode OK | `bun run zero-edit` on boilerplate |
| T2 | Product zero-edit OK after dogfood | same on product clone |
| T3 | Banlist OK | `bun run banlist` |
| T4 | Deny push | `git push upstream HEAD` fails on product (expect hook/url deny) |
| T5 | Playbook dry-run | Second engineer or agent follows S1 only on throwaway dir (optional) |
| T6 | No métier leak | banlist + PR review kit paths |

## Dependencies & sequencing

```text
B1 (SSoT vérité) ──► playbook auth/RBAC claims accurate
B2 mini (BA default) ──► playbook “default adapter” section final
B3 mini (optional) ──► pointers to shells/invites when exist
B4 (gosilex-ci) ──► product CI merge story (playbook links; not hard-block dogfood local)
        │
        ▼
B5 (#17) playbook + dogfood zero-edit
        │
        ▼
B6+ product patterns / share métier elsewhere
```

Epic text: blocked by **B2+B3 mini, B1**. Spec allows **S1 provisional** before B2 if every BA-default sentence is labeled provisional.

## Status

**draft** — analysis Shape B accepted for planning; implementation waits on sequencing + human dogfood product access.

## Refs

| Doc | Role |
|---|---|
| [`docs/product-consumer-contract.md`](../../docs/product-consumer-contract.md) | Zero-edit contract |
| [`config/zero-edit-zones.json`](../../config/zero-edit-zones.json) | Protected paths |
| [`scripts/check-zero-edit-zones.sh`](../../scripts/check-zero-edit-zones.sh) | Gate |
| [`scripts/check-banned-strings.sh`](../../scripts/check-banned-strings.sh) | Banlist |
| [`scripts/extract-dry-run.sh`](../../scripts/extract-dry-run.sh) | Extract |
| [`scripts/deny-upstream-push.sh`](../../scripts/deny-upstream-push.sh) | Push DENY |
| [`docs/gosilex-ci-app-setup.md`](../../docs/gosilex-ci-app-setup.md) | CI app consumer checklist |
| [`docs/testing.md`](../../docs/testing.md) | CP-ZERO-EDIT / local-first gates |
| ADR-0001 | Axial packages → apps |
