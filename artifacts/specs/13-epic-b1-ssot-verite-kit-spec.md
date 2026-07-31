---
title: "Spec — Epic B1 · SSoT & vérité kit (docs drift)"
issue: 13
spark: 114
status: approved
tier: docs
date: 2026-07-30
amended: 2026-07-31
analysis: artifacts/analyses/13-epic-b1-ssot-verite-kit-analysis.md
adr: docs/architecture/adr/0001-primary-axis-packages-compose-apps.md
related_adrs:
  - docs/architecture/adr/0002-session-hmac-interim-vs-better-auth.md
  - docs/architecture/adr/0003-multi-tenant-rbac-modules.md
  - docs/architecture/adr/0004-email-transport-cf-default.md
shape: 2
goal: artifacts/goals/002-product-ready-multi-tenant-goal.md
sequencing: after-B2-hmac-cut
---

# Spec #13 — B1 · SSoT & vérité kit (docs drift)

> **Goal 002 sequencing:** run **after B2 HMAC cut** lands (or same PR as post-cut docs).  
> Live session truth = **Better Auth only** (HMAC **retired**). Dual credential = cookie session **\|** Bearer `sk_`.  
> **Never** document `AUTH_SESSION_ADAPTER`, HMAC default, or « invent Better Auth later ».

## Context

- **Issue:** [#13](https://github.com/go-silex/silex-boilerplate/issues/13) · Spark #114
- **Analysis:** [`artifacts/analyses/13-epic-b1-ssot-verite-kit-analysis.md`](../analyses/13-epic-b1-ssot-verite-kit-analysis.md) — **Shape 2** (docs resync + automated drift checks)
- **Axial:** [ADR-0001](../../docs/architecture/adr/0001-primary-axis-packages-compose-apps.md) — package map is axial truth
- **Auth / tenancy truth:** [ADR-0002](../../docs/architecture/adr/0002-session-hmac-interim-vs-better-auth.md) (**BA-only**, amend 2026-07-30), [ADR-0003](../../docs/architecture/adr/0003-multi-tenant-rbac-modules.md), [ADR-0004](../../docs/architecture/adr/0004-email-transport-cf-default.md)
- **Shipped evidence:** GH #5 (BA land), #8 (feedback), #11 (multi-tenant Phase A); Goal 002 supersedes goal 001 live DoD

## Goal

Restore single-source-of-truth alignment between live kit code and human/agent entry docs under **Goal 002** truths (BA-only, CF Email default, Phase B stance, zero-edit).

## Users

| Persona | Need |
|---|---|
| Kit maintainer / agent | AGENTS checklist + stack narrative match disk |
| Product consumer (e.g. silex-share) | README package map + dual credential cookie \| `sk_` inject truth |
| Reviewer (multi-role) | Testable DoD (grep / script) for « vérité » |
| Downstream epic owners (B2–B8) | Clear shipped vs deferred vs open |

## Expected Behavior

1. A reader of `README.md` can list **every** `@gosilex/*` package that exists under `packages/*` with a one-line role that matches reality.
2. A reader of `AGENTS.md` § Auth understands: **session = Better Auth only** (HMAC retired, ADR-0002); dual credential **cookie \| Bearer `sk_`** (not HMAC\|BA); multi-tenant requires BA (ADR-0003); **no** `AUTH_SESSION_ADAPTER`.
3. Quality **Suite** checkboxes match shipped work; park rest = Paraglide / Plausible / patchlog; email prod = CF Email (ADR-0004 / #21); Phase B = planned ship (#22).
4. No live SSoT claims « HMAC default », « invent Better Auth later », or dual session adapter switch.
5. Optional CI/local `ssot:check` fails if package map drifts or banlisted false phrases reappear.
6. Goal **001** marked superseded; Goal **002** linked as live kit goal.
7. Historical frames/ADRs kept; only **live** surfaces (AGENTS, README, active checklists) change.

## Exact sections / files to update

### A. `README.md`

| Section | Required content |
|---|---|
| Header / quick start | **BA-only** Quick Start; no HMAC login path |
| **Package map** | Full table: `config`, `types`, `core`, `db`, `storage`, `auth`, `ui`, `email`, `mcp`, **`i18n`**, **`feedback`** |
| Dual credential | Cookie BA session **or** Bearer `sk_`; link ADR-0002 (BA-only) |
| Multi-tenant (short) | Phase A shipped; A4/Phase B per Goal 002; link ADR-0003 |
| Email | Local log/Mailpit · prod CF Email (ADR-0004); not “Mailpit only forever” |
| Demo credentials | Tenancy BA personas SSoT (`seed/tenancy-data` / demo-data); no primary HMAC `demo@` story |
| Apps table | example-api: BA + sk_ + orgs/modules/feedback; example-web: BA login + shells when B3 lands |
| Axis / ADR links | 0001 + **0002 + 0003 + 0004** |
| Coverage floors | Include `feedback` / `i18n` if thresholds exist; else note N/A |

**Canonical package roles (implement may tighten wording):**

| Package | Role (truth) |
|---|---|
| `@gosilex/config` | Shared tsconfig / Vitest coverage presets |
| `@gosilex/types` | Error codes + `ApiErrorBody` |
| `@gosilex/core` | `AppError`, logger, parse helpers |
| `@gosilex/db` | Drizzle D1 factory (schemas in apps) |
| `@gosilex/storage` | R2 put/get/delete + safe key join |
| `@gosilex/auth` | SessionPort **Better Auth**, cookie SSoT, `sk_` helpers, dual `requireAuth` (cookie\|Bearer), org-role constants |
| `@gosilex/ui` | shadcn Base UI shell |
| `@gosilex/email` | Templates + transports (`log` / smtp / **cf** / resend escape) — ADR-0004 |
| `@gosilex/mcp` | ping/whoami helpers + no-share-tools guard |
| `@gosilex/i18n` | Locale engine only; catalogs app-owned (ADR-0001) |
| `@gosilex/feedback` | Signaler → Spark Pilotage (core + Hono + React FAB) |

### B. `AGENTS.md`

| Section | Required change |
|---|---|
| Stack freeze / intro | Live goal → Goal 002; BA-only / multi-tenant A / CF Email / feedback |
| **§ D Auth + cookies** | Session = **Better Auth only** (HMAC retired); dual credential cookie \| `sk_`; no adapter env |
| **§ H Packages SaaS** | `@gosilex/auth` BA-only; add `feedback` + `i18n`; email `log`\|`smtp`\|`cf`\|`resend` (ADR-0004) |
| **§ H2 Email** | CF Email prod default (#21); Mailpit local; `log` fail-closed outside dev/test |
| **§ K Forme monorepo** | Root `silex-boilerplate/`; packages include `feedback`; product apps = product repos only |
| **### Suite** | See checkbox matrix below (Goal 002) |
| Commands | Prefer `example-api` / `example-web` kit filters |
| Open / non-blocking | Park Paraglide / Plausible (B8); Phase B open until #22 ships |

#### Suite checkbox matrix (target after B1 — Goal 002)

| Item | Target state | Note |
|---|---|---|
| Better Auth session (BA-only) | **[x]** | ADR-0002; HMAC retired |
| Dual credential cookie \| Bearer `sk_` | **[x]** | not HMAC\|BA |
| packages/ui + example-web + shells | **[x]** | #15 A4 |
| i18n FR/EN catalogs | **[x]** | engine + app catalogs; Paraglide park |
| Feedback kit | **[x]** | #8 |
| Multi-tenant Phase A | **[x]** | #11 |
| Email CF prod transport | **[x]** | ADR-0004 / #21 |
| RBAC Phase B | **[ ]** | #22 / Spark #127 |
| Plausible SPA recipe | **[ ]** | park B8 |
| Sentry / CodeRabbit / Playwright CI | **[ ]** | B7 |
| Consumer dogfood zero-edit | **[ ]** | B5 #17 |

### C. `packages/feedback/README.md`

| Change |
|---|
| Replace obsolete `kit_modules` activation copy with current module SSoT post-#11 (`platform_modules` / org enablement / integrations routes as implemented) |
| Keep architecture diagram of browser → Worker → Spark; key never leaves Worker |

### D. Secondary docs (if gaps found during edit)

| Path | When |
|---|---|
| `docs/product-consumer-contract.md` | If BA-only / dual credential cookie\|`sk_` inject missing |
| `docs/testing.md` | If package list / CP misses org-RBAC or feedback |
| `docs/observability.md` | Only if contradicts deferred Plausible stance |

### E. Drift automation (Shape 2)

| Artefact | Behavior |
|---|---|
| `scripts/check-ssot-drift.sh` (name flexible) | Exit non-zero on failure; stdout lists mismatches |
| Check 1 — package inventory | For each `packages/*/package.json` → `name` field must appear as substring in `README.md` package map section (or whole README) |
| Check 2 — banlist phrases in live SSoT | Paths: `AGENTS.md`, `README.md`. Fail if match (case-insensitive): `AUTH_SESSION_ADAPTER`, `default hmac`, `ne pas « inventer » Better Auth`, `Better Auth not shipped`, HMAC default as live session truth |
| Check 3 — optional | `packages/feedback` directory exists ⇒ README mentions `feedback` |
| `package.json` | Script `"ssot:check": "bash scripts/check-ssot-drift.sh"` |
| Gate | Prefer add to `validate` **or** document as manual DoD if team rejects validate noise; **do not** silently skip forever |

### F. Explicit non-edits

- No changes under `apps/*/src`, `packages/*/src` (except feedback **README** markdown).
- No commit of secrets, no adapter default flip, no new migrations.
- Do not reopen #6/#7 implementation in this PR.

## Slices

| Slice | Demo-able increment | Depends |
|---|---|---|
| **S1 — README vérité** | Package map + dual auth + apps + credentials pointer | — |
| **S2 — AGENTS vérité** | § D, § H, § K, Suite, phasage, commands | — |
| **S3 — Secondary + feedback README** | Module language + consumer/testing gaps | S1/S2 preferred first for vocabulary |
| **S4 — Drift script** | `bun run ssot:check` green on branch; fails if feedback removed from README | S1 |

Single PR acceptable if review size stays readable; split S4 only if script bikeshed blocks docs merge.

## Acceptance criteria (testable)

### A. Package map completeness

- [ ] `ls packages` names ⊆ documented in `README.md` package map (every `@gosilex/*` name string present).
- [ ] `AGENTS.md` § H (or successor inventory) mentions `@gosilex/feedback` and BA-only `@gosilex/auth` (dual credential cookie\|`sk_`).
- [ ] No package row claims Better Auth « not implemented ».

### B. Auth truth (Goal 002 / BA-only)

- [ ] `grep -n 'AUTH_SESSION_ADAPTER' README.md AGENTS.md` → **0 hits** (adapter retired).
- [ ] `grep -ni 'better auth' README.md AGENTS.md` shows **BA-only session shipped**, not future-only M3.
- [ ] Live SSoT does **not** claim HMAC default, « invent Better Auth later », or dual session adapter.
- [ ] Docs state dual credential = **cookie session \| Bearer `sk_`** only.
- [ ] Docs state multi-tenant requires Better Auth session (ADR-0003); link ADR-0002 BA-only amend.

### C. Feature checklist truth

- [ ] Suite marks feedback shipped.
- [ ] Suite marks BA-only session shipped; GitHub OAuth product depth remains open separately.
- [ ] Multi-tenant Phase A appears as shipped with link to ADR-0003 / #11.
- [ ] Email prod = CF Email shipped (#21 / ADR-0004); Plausible remains park / B8.

### D. ADR pointers

- [ ] README or AGENTS links ADR-0001, 0002, 0003 with correct relative paths.
- [ ] No live SSoT claims ADR-0002 is « interim-only HMAC with BA uninvented ».

### E. Drift automation (if Shape 2 retained after review)

- [ ] `bun run ssot:check` (or documented command) exits 0 on the PR branch.
- [ ] Manually removing `@gosilex/feedback` from README package map causes non-zero exit (spot check).
- [ ] Re-introducing banlisted « BA not shipped » phrase in `AGENTS.md` causes non-zero exit (spot check).

### F. Quality bar

- [ ] Docs-only PR: no need for full product test matrix; if script added, script is executable and shellcheck-clean enough for CI.
- [ ] No product-domain strings introduced into kit docs beyond existing frame references.
- [x] Spec `status: approved` after multi-role re-review (2026-07-31 Goal 002 BA-only).

## Definition of Done (issue #13)

Matches GH issue DoD, expanded:

- [ ] AGENTS checklist = réalité `main` (auth, feedback, multi-tenant A, mig narrative 0005–0008)
- [ ] README `packages/*` map + BA-only session + dual credential cookie\|`sk_` exact
- [ ] 0 claim « Better Auth not shipped » in live SSoT (`AGENTS.md`, `README.md`)
- [ ] Deferred #6/#7 labeled
- [ ] Shape 2 script green **or** explicit waiver comment on issue if Shape 1-only approved
- [ ] Spec status flipped to **approved** after multi-role review; analysis status updated accordingly
- [ ] GH issue #13 comment or checklist updated when PR lands

## Edge cases

| Case | Handling |
|---|---|
| Historical ADR/goal still says « interim » in past tense | Leave history; do not banlist entire `docs/architecture/adr/**` body blindly |
| New package added mid-PR | Must update README map before merge (script enforces) |
| Product frame still describes share M0–M6 | Allowed as product intent; separate from kit shipped inventory |
| feedback README still mentions Spark legacy package | OK if labeled legacy/migration |
| Reintroduce HMAC session / adapter switch | Banlist; HMAC cut is #14 — B1 must not re-document adapter |

## Out of scope

- Reintroducing HMAC session path or `AUTH_SESSION_ADAPTER` (HMAC cut is #14; do not reopen)
- Multi-tenant UX shells, invites, password reset (B3 / #15)
- Email Resend/CF prod implementation (#6 reopen)
- Plausible SPA snippet implementation (#7 reopen)
- Playwright CI, Sentry, CodeRabbit, Better Stack wiring (B7 / #19)
- Consumer playbook / zero-edit product work (B5 / #17)
- Code refactors, new guards, migration renames
- Rewriting accepted ADR decisions without a new ADR
- Committing/pushing without explicit human permission

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Partial AGENTS edit leaves contradictory paragraphs | Reviewer checklist walks § D + Suite + H in one pass |
| Script greps historical docs | Limit paths to live SSoT files |
| Over-claim dual session adapter / HMAC default | Banlist `AUTH_SESSION_ADAPTER` / HMAC default; dual credential = cookie \| `sk_` only |
| Product still reads old AGENTS from cache/fork | Consumer contract note: re-fetch upstream after B1 |

## Open questions (carry from analysis)

1. Gate `ssot:check` in `validate` vs optional until B5 playbook?
2. GH child issue for Spark #94 vs keep as sub-bullets on #13?
3. How aggressively to trim share-product narrative from kit AGENTS?

## Approval

| Role | Sign-off |
|---|---|
| Kit architect | pending |
| Maintainer / Mickael | pending |
| (Optional) product consumer reader | pending |

**status: approved** — multi-role re-review 2026-07-31 (Goal 002 BA-only residual scrubbed).
