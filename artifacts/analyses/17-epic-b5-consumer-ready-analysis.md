---
title: "Analysis #17 — B5 · Consumer ready (playbook + zero-edit product)"
issue: 17
spark: 118
status: draft
date: 2026-07-30
related:
  - docs/product-consumer-contract.md
  - config/zero-edit-zones.json
  - scripts/check-zero-edit-zones.sh
  - scripts/extract-dry-run.sh
  - scripts/check-banned-strings.sh
  - scripts/deny-upstream-push.sh
  - docs/gosilex-ci-app-setup.md
  - docs/architecture/adr/0001-primary-axis-packages-compose-apps.md
---

# Analysis #17 — Epic B5 · Consumer ready

## Source

| | |
|---|---|
| **GitHub** | [#17](https://github.com/go-silex/silex-boilerplate/issues/17) |
| **Spark** | **#118** · Silex · type Évolution · P1 · todo |
| **Bloc** | **B5 — Consumer ready** (séquentiel #5 · bloqué par B2+B3 mini, B1) |
| **Enfants cités** | Spark **#88** (docs playbook start projet · Plugins **#84**) · Spark **#94** (DoD template client, aussi enfant B1) |
| **Dogfood** | Spark **#124** (product pull upstream) — hors liste GH issues monorepo; tracké via DoD epic |
| **Spec** | `artifacts/specs/17-epic-b5-consumer-ready-spec.md` (draft) |

## Naming collision (read first)

| Label | Meaning |
|---|---|
| **AGENTS.md phase B5** (legacy phasage kit) | FastMCP `mcp-example` · email + Mailpit · stubs — **already largely shipped** |
| **Spark / GH Epic B5 (#118 / #17)** | **Consumer ready** — playbook start projet + dogfood zero-edit product |

This epic is **not** “re-ship MCP/email”. It is the **extract → product** readiness bar: a human can start a product repo without dual-editing the kit, and we prove it once on a real consumer.

## Problem

1. **Contract is written; dogfood is not.**  
   SSoT `docs/product-consumer-contract.md` + machine gates (`zero-edit`, banlist, extract, deny-upstream) live in the kit. There is **no** recorded, green run of: *product clone → fetch/merge `upstream` → `bun run zero-edit` (+ banlist) green with product-only trees*.

2. **Playbook “start projet” missing as a single actionable path.**  
   Day-1 bootstrap is **scattered**: contract § Day-1, `gosilex-ci-app-setup.md` checklist, README Quick Start (kit demos), AGENTS consumer rules. Spark #88 (under Plugins #84) wants a playbook covering **Auth / RBAC / MasterData / UI / tokens** for a new product — not just remote wiring.

3. **Reference consumer is thin / stale.**  
   Local archived `silex-share` (`~/projects/gosilex/.archived/silex-share`, remote `go-silex/silex-share`):
   - remotes correct: `origin` = product, `upstream` = boilerplate, `push upstream` = `no_push`
   - last notable commits = deny-push / rebrand kit
   - **no** `apps/share-*` (only `example-*` + `mcp-example`)
   - **no** `docs/product/` · **no** `kit-baseline` · **no** exceptions file
   - product-consumer-contract not present on that tree (pre-full-contract merge gap likely)
   → Cannot claim “consumer ready” from that snapshot.

4. **Extract dry-run “suite green after drop product”** is still **structure-only** (AGENTS checklist open). Mode `kit` notes absence of product apps; it does **not** re-run lint/typecheck/test after a simulated product drop. Epic allows gap-fix only if dogfood surfaces holes.

5. **Dependencies.** Epic text: blocked by **B1** (SSoT vérité) + **B2+B3 mini**. Playbook must not document wrong auth defaults (HMAC vs BA) while B2 is open — playbook can ship with explicit “current default / target after B2” or wait for B1/B2 doc truth.

## Why now

- Products (share, next SaaS) will fork kit files unless the **pull + zero-edit** path is proven and the **start playbook** is one page away.
- Dual-edit forever on `lefthook.yml` / workflows / `packages/*` is the failure mode this epic exists to close (contract anti-patterns).
- Kit gates already cost CI minutes; without dogfood they only protect the kit origin, not the product graph.

## Outcome (success narrative)

A GOSILEX engineer (or agent following the playbook) can:

1. Create / refresh a product repo with `upstream` = `silex-boilerplate` (fetch-only).
2. Add **only** `apps/<product>-*`, `docs/product/*`, optional `product-*.yml` / design overrides.
3. Merge `upstream/main`, refresh `docs/product/kit-baseline`, keep `bun run zero-edit` + banlist green.
4. Find Auth / RBAC / UI tokens / (stubs) MasterData pointers without reverse-engineering AGENTS.

**Not** success: implementing share M0 métier, inventing a scaffold CLI, or rebranding examples into the product.

## Appetite

One focused epic cycle (docs + one dogfood pull + gap fixes to gates/docs only).  
**Not** multi-week scaffold generator or full share product MVP.

## Shapes

### Shape A — Docs playbook only

Ship `docs/playbooks/start-product.md` (or similar) that stitches existing contract + CI app + axial rules. No mandatory dogfood PR on a product repo.

| | |
|---|---|
| **Pros** | Fast; unblocks readers; low risk |
| **Cons** | **Fails epic DoD** (“≥1 product pull upstream OK”); false confidence; silex-share stays broken/stale |
| **Rough scope** | S |
| **Verdict** | **Insufficient alone** — may be a **child ticket slice**, not epic exit |

### Shape B — Playbook + dogfood real product (zero-edit green) — **recommended**

1. **Playbook** (actionable checklists: bootstrap remotes, product apps only, design overrides, kit-baseline, exceptions, Auth/RBAC/UI tokens map, validate gates).  
2. **Dogfood** on **one** real consumer (default **`go-silex/silex-share`** or a throwaway `go-silex/silex-consumer-dogfood` if share history is too dirty).  
3. Minimal product surface to prove axial: e.g. stub `apps/<product>-api` **or** documented “apps pending — still zero-edit green with only `docs/product/*`”.  
4. Fix only kit gaps revealed by dogfood (contract, zones JSON, CI baseline block, extract notes).  
5. Optional: DoD template client (#94) as short appendix or link from B1.

| | |
|---|---|
| **Pros** | Matches issue DoD; proves gates in **product** mode; converges silex-share remotes/baseline; keep share métier out |
| **Cons** | Needs a product clone + possibly history cleanup; blocked by stale dual-edits if share diverged; B1/B2 doc truth for auth section |
| **Rough scope** | M |
| **Verdict** | **Choose this** |

### Shape C — Scaffold generator (`create-gosilex-app` / template zip)

CLI or GH template that copies kit, rewrites remotes, scaffolds `apps/<name>-*`.

| | |
|---|---|
| **Pros** | DX “day 0” magic; reduces copy-paste errors |
| **Cons** | Generator becomes second SSoT; bitrot vs monorepo; out of appetite; epic does not ask for it; still need dogfood |
| **Rough scope** | L–XL |
| **Verdict** | **Out of scope** for #17 — park for later (B6/B8 or tooling epic) |

## Fit check

| Constraint | Implication |
|---|---|
| Axial ADR-0001 | Products add `apps/<product>-*` only; packages stay kit |
| Zero-edit zones | Protected: `packages/*`, `apps/example-*`, `scripts/`, root tooling, kit workflows |
| Allowed product paths | `apps/` (non-example), `docs/product/`, `scripts/product/`, `.github/workflows/product-*` |
| Design overrides | CSS tokens + compose wrappers — **no** `packages/ui` fork |
| Banlist / extract | Kit packages + examples never grow share métier strings |
| Deny upstream push | Already in kit lefthook — product must not replace lefthook |
| Epic hors scope | **No share M0 métier** (upload, R2 share paths, ACL…) |
| Blockers B1/B2 | Playbook auth section must track **documented** default after B1/B2, or mark provisional |

**Chosen:** Shape **B**. Shape A is a slice inside B; Shape C deferred.

## Baseline (kit @ workspace 2026-07-30)

| Area | Today |
|---|---|
| Contract | `docs/product-consumer-contract.md` — complete mental model, zones, exceptions, kit-baseline CI, day-1, anti-patterns |
| Zones machine | `config/zero-edit-zones.json` v1 · protected prefixes/files · design_overrides |
| Gate zero-edit | `scripts/check-zero-edit-zones.sh` — kit mode OK (config only); product mode diffs vs `ZERO_EDIT_BASE_REF` / `upstream/main` |
| Banlist | `scripts/check-banned-strings.sh` — packages + example apps only |
| Extract | `scripts/extract-dry-run.sh` — tree + banlist + package imports + orphans; **not** full suite after drop |
| Deny push | `scripts/deny-upstream-push.sh` + lefthook pre-push |
| CI product path | `.github/workflows/ci.yml` — if not kit repo: require `docs/product/kit-baseline`, set `ZERO_EDIT_BASE_REF` |
| Templates | `docs/templates/kit-baseline.example` · `config/zero-edit-exceptions.example.json` |
| Playbook start projet | **Missing** as single doc |
| Product dogfood | **Not validated** on a live product tree |
| silex-share (archived local) | remotes OK; no product apps; no `docs/product/*` |

### Files likely touched by Shape B (kit)

| Path | Role |
|---|---|
| `docs/playbooks/start-product.md` (new) **or** `docs/product-start-playbook.md` | Playbook SSoT |
| `docs/product-consumer-contract.md` | Cross-links + any dogfood-found gaps |
| `README.md` / `AGENTS.md` | Link playbook (prefer after B1 or minimal pointer only) |
| `docs/templates/*` | Optional DoD client checklist template (#94) |
| Gate scripts / `config/zero-edit-zones.json` | **Only if** dogfood finds false red/green |
| Product repo (outside kit commits) | `docs/product/kit-baseline`, remotes, optional stub apps, product CI |

**No** kit commits of product métier. Product changes live on product `origin`.

## Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | silex-share history dual-edited kit paths → zero-edit red forever | Inventory `git diff upstream/main -- <protected>`; restore kit versions; move product logic to `apps/share-*` **or** time-boxed exceptions; if hopeless, dogfood on clean new repo + document share remediation ticket |
| R2 | Playbook documents wrong auth default (HMAC vs BA) before B2 | Playbook table “adapter today / target”; block “BA default” claim until B2 DoD; B1 must fix AGENTS truth |
| R3 | Scope creep into MasterData / jobs / full RBAC product UX | Playbook **points** to kit examples + epic B6/B3; does not implement them |
| R4 | “Dogfood” = only remotes, no apps | Prefer minimal `apps/<product>-*` stub **or** explicit acceptance of product-docs-only zero-edit + written follow-up for first product app |
| R5 | Extract “suite green after drop” reinterpreted as full monorepo re-test | Spec: gap-fix only if extract script lies; full suite drop = later quality epic unless cheap |
| R6 | Agents edit kit from product clones | Deny-push + playbook step “kit changes only in boilerplate clone” |
| R7 | Spark #88 / Plugins #84 content lives outside this repo | Playbook lives **in kit** (SSoT for Chemin A); plugins may **link** to it — do not fork playbook into silex-plugins |

## Unresolved (for implement / dogfood, not analysis blockers)

1. **Dogfood target:** revitalize `silex-share` vs greenfield `silex-consumer-dogfood`?  
   **Lean:** try share first (named consumer in AGENTS); fall back to greenfield if dual-edit debt > 1 day.
2. **Minimum product surface for DoD:** docs-only vs stub `apps/share-api` health-only?  
   **Lean:** `docs/product/*` + kit-baseline **required**; stub app **recommended** if cheap, **not** share M0.
3. **#94 DoD template:** ship under this epic vs only B1?  
   **Lean:** short checklist in playbook appendix; B1 owns README truth.
4. **Whether extract-dry-run needs a new mode** after dogfood — decide only if a concrete gap appears.

## Recommendation

1. Adopt **Shape B** (playbook + dogfood product).  
2. Write playbook as kit SSoT with checklists; link contract, zones, CI app, axial ADR, design overrides, Auth/RBAC/UI map (provisional re B2).  
3. Dogfood one product: remotes, `kit-baseline`, `bun run zero-edit` (+ banlist) green; evidence in issue comment / product PR.  
4. Fix kit only for false gates or missing template paths.  
5. **Out of scope:** share M0 métier, scaffold generator, Better Auth product OAuth, MasterData package build.  
6. Proceed to **spec draft** → implement after B1 (and B2 mini for auth claims) per epic sequencing; playbook structure can be drafted earlier with provisional flags.

## Axial summary

```text
kit (silex-boilerplate)     = packages + examples + gates + playbook SSoT
product (silex-share, …)    = apps/<product>-* + docs/product/* + product workflows
upstream fetch/merge only   = product ← kit
zero-edit                   = product HEAD/worktree matches kit tip on protected paths
never                       = product patches packages/* or example-* for brand/métier
```
