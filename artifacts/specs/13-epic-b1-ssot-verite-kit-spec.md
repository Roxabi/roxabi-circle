---
title: "Spec — Epic B1 · SSoT & vérité kit (docs drift)"
issue: 13
spark: 114
status: draft
tier: docs
date: 2026-07-30
analysis: artifacts/analyses/13-epic-b1-ssot-verite-kit-analysis.md
adr: docs/architecture/adr/0001-primary-axis-packages-compose-apps.md
related_adrs:
  - docs/architecture/adr/0002-session-hmac-interim-vs-better-auth.md
  - docs/architecture/adr/0003-multi-tenant-rbac-modules.md
shape: 2
goal: artifacts/goals/002-product-ready-multi-tenant-goal.md
sequencing: after-B2-hmac-cut
---

# Spec #13 — B1 · SSoT & vérité kit (docs drift)

> **Goal 002 sequencing:** run **after B2 HMAC cut** lands (or same PR as post-cut docs).  
> Do **not** document HMAC default dual-path as live truth.

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
| Product consumer (e.g. silex-share) | README package map + dual-path auth inject truth |
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
| Stack freeze / intro | Note amended for BA dual-path (#5), feedback (#8), multi-tenant A (#11) |
| **§ D Auth + cookies** | Replace « aujourd’hui HMAC only / ne pas inventer BA » with dual-path truth: default HMAC, BA shipped behind adapter, SessionPort, cookie flags unchanged, MCP still Bearer only |
| **§ H Packages SaaS** | Update `@gosilex/auth` row; **add** `@gosilex/feedback` (P0/kit optional module); clarify `@gosilex/i18n` = engine live; email = demo + local Mailpit, prod deferred; leave absent packages as P1/P2 |
| **§ H2 Email** | Soften « esquisse » if Mailpit compose exists; mark Resend/CF prod as **deferred (#6)** |
| **§ K Forme monorepo** | Root name = `silex-boilerplate/` (or generic monorepo); package list includes `feedback`; product apps as « future / product repos », not present dirs |
| **§ Phasage** | Annotate B3 dual-path landed (#5); B5 feedback landed (#8); multi-tenant A (#11); remaining items point to open epics |
| **### Suite** | See checkbox matrix below |
| Commands | Prefer kit filters (`example-api` / `example-web`); demote or footnote share-api product commands |
| Open / non-blocking | Align with deferred park (email/plausible → B8 or reopen) |

#### Suite checkbox matrix (target after B1)

| Item | Target state | Note |
|---|---|---|
| Better Auth dual-path (SessionPort + adapter) | **[x]** | Shipped #5; default still HMAC |
| GitHub OAuth + org membership product depth | **[ ]** or move to B2/B3 | Not same as « BA not shipped » |
| packages/ui + example-web | **[x]** | already |
| i18n FR/EN catalogs | **[x]** | already (engine + app catalogs) |
| FastMCP product tools + skill | **[ ]** | product / later |
| Email prod (Resend/CF) | **[ ] deferred #6** | local Mailpit OK |
| Submit feedback kit package + wire | **[x]** | #8 |
| Plausible SPA recipe | **[ ] deferred #7** | anti-doublon doc stays |
| Multi-tenant Phase A | **[x]** | #11 — new line if missing |
| Sentry + Better Stack prod | **[ ]** | |
| CodeRabbit | **[ ]** | |
| Playwright e2e in CI | **[ ]** | design-system script exists local |
| Extract dry-run green after drop product | **[ ]** or partial note | structure + banlist today |

### C. `packages/feedback/README.md`

| Change |
|---|
| Replace obsolete `kit_modules` activation copy with current module SSoT post-#11 (`platform_modules` / org enablement / integrations routes as implemented) |
| Keep architecture diagram of browser → Worker → Spark; key never leaves Worker |

### D. Secondary docs (if gaps found during edit)

| Path | When |
|---|---|
| `docs/product-consumer-contract.md` | If dual-path / BA inject missing |
| `docs/testing.md` | If package list / CP misses org-RBAC or feedback |
| `docs/observability.md` | Only if contradicts deferred Plausible stance |

### E. Drift automation (Shape 2)

| Artefact | Behavior |
|---|---|
| `scripts/check-ssot-drift.sh` (name flexible) | Exit non-zero on failure; stdout lists mismatches |
| Check 1 — package inventory | For each `packages/*/package.json` → `name` field must appear as substring in `README.md` package map section (or whole README) |
| Check 2 — banlist phrases in live SSoT | Paths: `AGENTS.md`, `README.md` (optional: `docs/product-consumer-contract.md`). Fail if match (case-insensitive) of phrases such as: `ne pas « inventer » Better Auth`, `Better Auth not shipped`, `Better Auth **M3**` as sole future claim without dual-path, `Submit feedback` unchecked pattern if greppable — exact list frozen in script comments |
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
- [ ] `AGENTS.md` § H (or successor inventory) mentions `@gosilex/feedback` and dual-path `@gosilex/auth`.
- [ ] No package row claims Better Auth « not implemented ».

### B. Auth truth

- [ ] `grep -n 'AUTH_SESSION_ADAPTER' README.md` hits ≥1.
- [ ] `grep -ni 'better auth' README.md AGENTS.md` shows **shipped dual-path** language, not only future M3.
- [ ] `AGENTS.md` does **not** contain the exact anti-pattern sentence: `ne pas « inventer » Better Auth dans le code tant que non livré` (or current equivalent false claim).
- [ ] Docs state default adapter remains **`hmac`** unless env sets `better-auth`.
- [ ] Docs state org/RBAC requires `AUTH_SESSION_ADAPTER=better-auth` (ADR-0003).

### C. Feature checklist truth

- [ ] Suite / equivalent checklist marks feedback shipped (checked or removed as open).
- [ ] Suite marks BA dual-path shipped; remaining OAuth/product depth is separate open item or epic link (#14/#15).
- [ ] Multi-tenant Phase A appears as shipped with link to ADR-0003 / #11.
- [ ] Email prod and Plausible are **deferred (#6 / #7)** wording, not active unmarked todos only.

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
- [ ] `status` of this spec remains **draft** until multi-role approval; implementation PR only after `status: approved` (or explicit issue comment approving draft).

## Definition of Done (issue #13)

Matches GH issue DoD, expanded:

- [ ] AGENTS checklist = réalité `main` (auth, feedback, multi-tenant A, mig narrative 0005–0008)
- [ ] README `packages/*` map + dual-path auth exact
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
| Default adapter flip proposed during review | Redirect to epic B2 (#14); out of this spec |

## Out of scope

- Changing `AUTH_SESSION_ADAPTER` default or seed-only BA dogfood (B2 / #14)
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
| Over-claim BA as default | Explicit « default hmac » sentence required in AC |
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

**status: draft** — not approved; awaiting multi-role review before implementation PR.
