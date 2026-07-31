---
title: "Epic B1 — SSoT & vérité kit (docs drift) — technical analysis"
issue: 13
spark: 114
status: draft
date: 2026-07-30
tier: docs
adr: docs/architecture/adr/0001-primary-axis-packages-compose-apps.md
related:
  - docs/architecture/adr/0002-session-hmac-interim-vs-better-auth.md
  - docs/architecture/adr/0003-multi-tenant-rbac-modules.md
  - "5 (BA closed)"
  - "8 (feedback closed)"
  - "11 (multi-tenant Phase A closed)"
  - "6 / 7 (closed deferred, not shipped)"
---

# Analysis #13 — B1 · SSoT & vérité kit (docs drift)

## Source

Issue [#13](https://github.com/go-silex/silex-boilerplate/issues/13) · Spark **#114** · Epic **B1** (séquentiel #1 — bloque comm / dogfood / playbook).  
Child hint in issue body: Spark **#94** (README package map + DoD template client) — not a GH issue number in this repo.

## Problem

Human and agent SSoT surfaces (`AGENTS.md`, `README.md`, package maps, quality checklists) still describe a **pre-#5 / pre-#8 / pre-#11** kit:

| Claim still in SSoT | Reality on `main` (worktree 2026-07-30) |
|---|---|
| Better Auth « not shipped » / M3 unchecked · « ne pas inventer BA » | **#5 merged** — `SessionPort` dual-path, `AUTH_SESSION_ADAPTER`, BA factory + migrations `0005_*` |
| `@gosilex/auth` = HMAC + keys only | Package exports BA port, org-role helpers, dual `requireAuth`; ADR-0002 **amended 2026-07-15** |
| No multi-tenant | **#11 merged** — org plugin, platform RBAC, dual-level modules, migrations `0006`–`0008`, `org-rbac` routes/tests |
| Submit feedback unchecked | **#8 merged** — `packages/feedback` + wire `example-api` / `example-web` FAB |
| README package map incomplete | Missing `@gosilex/feedback`, `@gosilex/i18n`; auth line omits BA / org roles |
| Email / Plausible « open suite » as if active kit backlog | **#6 / #7 closed deferred** (hors backlog kit; reopen if resumed) |
| Demo credentials = 2 HMAC users | Tenancy seed personas (`super@`, `staff@`, `solo@`, …) exist for BA adapter |
| Monorepo tree `packages/ … email …` | Actual packages include **feedback**; tree still named `silex-share/` |

Without vérité SSoT, product forks (e.g. silex-share) and later epics (B2 dogfood BA default, B5 consumer playbook) invent parallel stacks or re-open closed work.

## Outcome

After B1:

1. **AGENTS checklist + auth section + package carte** match shipped code and accepted ADRs.
2. **README** package map + dual-path auth + demo seed truth for both adapters.
3. **Zero false claim** of the form « Better Auth not shipped » / « feedback not in kit » / « multi-tenant not started ».
4. Deferred items (#6 email prod depth, #7 Plausible SPA recipe) labeled **deferred / park**, not open-unchecked-as-if-todo-now.
5. Optional: lightweight **drift guards** so the next merge cannot re-diverge package list vs docs.

## Appetite

**Small–Medium** (docs + optional script). One focused PR (or two: docs then checks). No product logic, no adapter default flip (that is epic **B2** / #14).

## Shapes

### Shape 1: Docs-only resync — **minimal**

Edit `AGENTS.md`, `README.md`, touch related narrative in `docs/*` only where they contradict shipped state. Manual review against package dirs + closed issues.

| | |
|---|---|
| **Pros** | Fast; zero CI surface; matches issue DoD literally |
| **Cons** | Drift returns on next epic; no machine check that `@gosilex/*` set matches README |
| **Rough scope** | S |

### Shape 2: Docs + automated drift checks — **recommended**

Shape 1 **plus**:

- Inventory check: every `packages/*/package.json` `name` appears in README package map (and optionally AGENTS § H).
- Banlist-style greps for **stale false claims** (e.g. « ne pas inventer Better Auth », « Better Auth not shipped ») in tracked SSoT paths.
- Document deferred park list (email prod / Plausible) with issue refs #6/#7 closed-deferred.
- Optionally extend `validate` / a small `scripts/check-ssot-drift.sh` (or fold into existing hygiene scripts) — **not** full validate:full bloat if avoidable; prefer dedicated script + CI optional or part of `env:check`-class gates.

| | |
|---|---|
| **Pros** | Prevents recurrence; aligns with kit « claim → evidence » doctrine; cheap compared to axial importlinter |
| **Cons** | Regex false positives; maintain allowlist when status intentionally interim |
| **Rough scope** | M |

### Shape 3: Generated living package map only

Generate package table from workspaces into a fragment included by README/AGENTS.

| | |
|---|---|
| **Pros** | Package list never stale |
| **Cons** | Does not fix narrative (auth dual-path, checklist, deferred issues); tool chain for `@include` still weak; overkill for B1 |
| **Rough scope** | M–L for little extra outcome |

**Recommendation:** **Shape 2** (docs resync + thin drift checks). Shape 1 alone fails the epic’s role as gate for all later B\*. Shape 3 can be a later polish if Shape 2 greps prove painful.

## Fit check vs ADR-0001 (axial: packages compose apps)

| Axis rule | B1 impact |
|---|---|
| Primary axis = `packages/*` compose deployables | **Package map is axial truth.** Omitting `@gosilex/feedback` (or under-describing `@gosilex/auth`) trains products to reimplement or skip kit packages. |
| Product domain only under `apps/<product>-*` | Docs must not imply share product lives in kit; monorepo diagram still saying `silex-share/` root + `apps/share-*` as if present confuses extractability. |
| New cross-cutting capability → package | Feedback shipped as package — must appear in SSoT carte (H) and README. |
| Anti-pattern: local forks of platform helpers | Stale « BA not shipped » → product invents OAuth/session outside `@gosilex/auth` SessionPort. |
| Anti-pattern: empty package skeletons | Keep rate-limit/audit/jobs/billing as **P1/P2 not present** — do not mark shipped. |

B1 is **documentation of axial reality**, not a new package. Drift checks that assert « listed packages exist on disk » reinforce ADR-0001 without inventing a second axis.

**ADR-0002 / 0003:** Docs must point to current accepted text:

- ADR-0002 (amended): HMAC **default** + Better Auth **first-class path** via `AUTH_SESSION_ADAPTER` — not « interim only, invent later ».
- ADR-0003: multi-tenant Phase A **accepted and implemented** on BA adapter; HMAC org routes fail-closed.

Do **not** rewrite ADR decisions in B1 unless a factual contradiction is found; prefer linking and summarizing in AGENTS/README.

## Baseline — what is wrong today

### Packages on disk (`packages/*`)

| Package | On disk | README map | AGENTS § H |
|---|---|---|---|
| `@gosilex/config` | yes | yes | yes |
| `@gosilex/types` | yes | yes | yes |
| `@gosilex/core` | yes | yes | yes |
| `@gosilex/db` | yes | yes | yes |
| `@gosilex/storage` | yes | yes | yes |
| `@gosilex/auth` | yes (HMAC + BA port + org-roles + dual requireAuth) | **partial** (HMAC + sk_ only) | **stale** (« interim · BA M3 ») |
| `@gosilex/ui` | yes | yes | yes |
| `@gosilex/email` | yes (demo text + log/smtp/resend types; not full prod recipe) | yes (thin) | yes (overclaims React Email + full transport) |
| `@gosilex/mcp` | yes | yes | yes |
| `@gosilex/i18n` | yes (locale engine only; catalogs app-owned) | **missing** | listed P1 (OK if clarified) |
| `@gosilex/feedback` | yes + wired examples | **missing** | **missing** |

Not present (correctly still aspirational): `rate-limit`, `audit`, `jobs`, `observability`, `billing`, `analytics`.

### Migrations / apps (shipped capability evidence)

| Artefact | Status |
|---|---|
| `apps/example-api/migrations/0005_better_auth.sql` | shipped (#5) |
| `0006_better_auth_organization.sql` | shipped (#11) |
| `0007_rbac_modules.sql` | shipped (#11) |
| `0008_api_keys_organization.sql` | shipped (#11) |
| `packages/auth/migrations/0001–0003` | package-side BA + org + platform modules SQL |
| `apps/example-api/src/lib/better-auth.ts` | BA + organization plugin |
| `apps/example-api/src/routes/orgs.ts`, `modules.ts`, `feedback.ts`, … | live |
| `apps/example-web` feedback FAB + BA-aware login | live |
| `AUTH_SESSION_ADAPTER` default | still **`hmac`** (B2 dogfood = flip/default discussion — out of B1) |
| Mailpit | `docker-compose` service present; email package still demo-level |
| `.claude/stack.yml` | already lists `feedback` + `i18n` (ahead of README) |

### Closed PRs / issues vs AGENTS « Suite »

| Issue | State | SSoT should say |
|---|---|---|
| **#5** BA dual-path | CLOSED 2026-07-15 | Shipped as adapter path; default still HMAC; GitHub OAuth org membership product depth still open (B2/B3) |
| **#8** feedback | CLOSED 2026-07-15 | Shipped kit package + example wire; Spark M2M config via modules/integrations |
| **#11** multi-tenant A | CLOSED 2026-07-17 | Phase A shipped; A4 shells / invites → epic B3 (#15) |
| **#6** email prod | CLOSED deferred 2026-07-23 | **Park** — not « open todo now »; local Mailpit + thin `@gosilex/email` exist |
| **#7** Plausible | CLOSED deferred 2026-07-23 | **Park** — anti-doublon stays in AGENTS/obs; no SPA wire required now |

### Concrete AGENTS false / stale spots (non-exhaustive)

1. **§ D Auth** — « aujourd’hui HMAC only » + paragraph « ne pas inventer Better Auth dans le code tant que non livré » → **false**.
2. **§ H package carte** — auth row + missing feedback.
3. **§ K monorepo tree** — root name `silex-share/`, packages list without feedback, product apps drawn as present.
4. **§ Suite checklist** — BA unchecked; feedback unchecked; email/Plausible open without « deferred ».
5. **Phasage B3** — still « Better Auth = M3 » as future; should mark dual-path landed, dogfood default = later epic.
6. **Commands** still show `@gosilex/share-api` filters — product not in this repo (confusing for kit-only readers).
7. **Stack freeze line** (2026-07-12) — should note amend dates for BA / multi-tenant / feedback.

### Concrete README false / stale spots

1. **Package map** incomplete (feedback, i18n).
2. **Auth** described as HMAC session only — missing adapter switch, BA path, org APIs when BA.
3. **Demo credentials** table only HMAC dual demo users — no pointer to tenancy personas under BA.
4. **example-api** one-liner omits orgs/modules/feedback integrations.
5. Coverage table may omit `feedback` / `i18n` floors if present in `vitest-coverage` / scripts (verify at implement).

### Secondary drift (fix if touched)

| File | Note |
|---|---|
| `packages/feedback/README.md` | Still documents `kit_modules` toggles; post-#11 code uses platform/org modules — **package README** may lie to consumers |
| `docs/testing.md` | Confirm CP-\* inventory mentions org/RBAC / BA adapter if claimed exhaustive |
| `docs/product-consumer-contract.md` | Ensure dual-path + BA inject recipe pointer matches ADR-0002 |
| Goal / freeze artifacts under `artifacts/goals`, `artifacts/reviews` | Historical OK; do not rewrite history — mark « superseded narrative in AGENTS » only if agents re-read goals as live truth |

## File list to edit (implementation)

### Must (Shape 1 / Shape 2)

| Path | Change |
|---|---|
| `AGENTS.md` | Auth § D truth (dual-path); package carte H + monorepo K; Suite checkboxes; phasage notes; optional commands kit-only |
| `README.md` | Package map; dual auth; apps blurb; demo seed dual story; ADR-0002/0003 links |
| `docs/architecture/adr/0002-…` | **Read-only unless** residual interim-only wording survives amend (spot-check only) |
| `docs/architecture/adr/0003-…` | Link from AGENTS/README; no rewrite if accepted text matches code |

### Should

| Path | Change |
|---|---|
| `packages/feedback/README.md` | Align module toggle language with platform_modules / org modules post-#11 |
| `docs/product-consumer-contract.md` | Dual-path + BA inject one-liner if missing |
| `docs/testing.md` | CP inventory / coverage package list if incomplete |
| `.claude/stack.yml` | Already good; only if package set changes (no) |

### Shape 2 only

| Path | Change |
|---|---|
| `scripts/check-ssot-drift.sh` (new) **or** extend existing hygiene script | Package map ↔ disk; forbidden stale phrases in AGENTS/README |
| `package.json` | Optional `"ssot:check"` / hook into `validate` (prefer not bloating `validate:full` without appetite — at least document manual run in DoD) |
| `.github/workflows/ci.yml` | Optional wire if script added |

### Must not (B1)

| Path | Why |
|---|---|
| `packages/*/src/**`, `apps/**/src/**` | Product/kit logic out of scope |
| Flip `AUTH_SESSION_ADAPTER` default | Epic B2 |
| Reopen #6/#7 implementation | Epic park B8 / separate tickets |
| New ADR | Only if docs discovery finds decision change — unexpected |

## Risks

1. **False claims remain after partial edit** — grepping only one phrase; Suite table updated but § D paragraph left stale → agents still refuse to use BA.
2. **Product forks from stale docs** — silex-share / future products copy HMAC-only mental model or reimplement feedback.
3. **Over-claim BA default** — documenting BA as « the » session without stating default=`hmac` misleads ops (B2 not done).
4. **Over-claim multi-tenant on HMAC** — org APIs require BA adapter; must stay explicit.
5. **Drift check false positives** — historical ADR text, goals, frames contain intentional past tense; limit greps to live SSoT paths (`AGENTS.md`, `README.md`, maybe `docs/product-consumer-contract.md`).
6. **Feedback package README vs modules cutover** — leaving `kit_modules` docs causes wrong admin paths.
7. **Scope creep into B2–B5** — dogfood, playbook, UX shells are other epics; B1 stops at vérité.

## Open questions

1. **Wire `ssot:check` into `validate` / `validate:full` now, or docs-only PR first then follow-up?** (Recommend: script lands with B1; gate in `validate` if runtime &lt; ~2s, else document in DoD until CI appetite confirmed.)
2. **Child Spark #94** — keep as sub-checklist inside #13 or open a GH tracking issue? (Issue body already lists it as child.)
3. **How much of AGENTS « Product (résumé frame) » share frame** stays in kit AGENTS vs product repo only? (Out of B1 code; clarify pointer if share-only narrative confuses kit-only readers.)
4. **Coverage floors for `feedback` / `i18n`** — document exact % from current Vitest config at implement time.
5. **Whether to mark B3–B5 phasage rows complete** in AGENTS or introduce a separate « Kit shipped inventory 2026-07 » section to avoid endless checkbox archaeology.

## Recommendation

Implement **Shape 2**: full docs resync (AGENTS + README + feedback package README module language) + thin automated drift checks on package inventory and a short banlist of false claims in live SSoT files. Status remains **draft** until multi-role review; then proceed to `/spec` implementation PR.

Proceed to `artifacts/specs/13-epic-b1-ssot-verite-kit-spec.md`.
