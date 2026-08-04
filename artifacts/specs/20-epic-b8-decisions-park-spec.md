> **Amend 2026-07-30 (Goal 002):** DR-B8-02 (RBAC B) + DR-B8-04 (email prod) are **UNPARKED / SUPERSEDED** — ship via GH #22 / #21 + ADR-0003/0004.  
> **This file’s live park surface is only:** DR-B8-01 Paraglide · DR-B8-03 patchlog · DR-B8-05 Plausible (and TanStack Start non-default).

---
title: "Spec — Epic B8 · Décisions park (decision records)"
issue: 20
spark: 121
status: accepted
type: spec
tier: F-decision
date: 2026-07-30
accepted: 2026-08-04
analysis: artifacts/analyses/20-epic-b8-decisions-park-analysis.md
related_gh: [6, 7, 11, 13, 14, 15, 17, 19]
---

# Spec #20 — B8 · Décisions park (decision records only)

## Context

- **Issue:** [#20](https://github.com/go-silex/silex-boilerplate/issues/20) · Spark **#121**
- **Analysis:** [`20-epic-b8-decisions-park-analysis.md`](../analyses/20-epic-b8-decisions-park-analysis.md)
- **Nature:** **Decision epic** — no feature implementation, no package scaffold, no migrations.
- **Priority:** P3 · sequential bloc #8 · **non-blocking** for B1–B7 code delivery.
- **Children (Spark):** #95 Paraglide / RBAC B · #100 Patch log natif — no dedicated GH issues yet.

## Goal

Produce **written park decisions** for five topics so agents and humans stop re-debating them during spine work. Each decision includes: option chosen, unpark criteria, ADR/doc amend targets, and explicit **NOT now** list.

## Users

| Persona | Need |
|---|---|
| Kit maintainer | Stable defaults without opening park tickets mid-sprint |
| Product consumer | Know what the kit will / will not own (email, analytics, roles) |
| Agent / AI | Machine-readable park posture; no inventing Paraglide or Phase B tables |
| Spark pilotage | #100 triage (spec / reject / later) closed in writing |

## Expected behavior (process)

1. Analysis approved (or used as draft input) → this spec accepted → optional ADR amend PRs **docs-only**.
2. GH #20 DoD checkboxes satisfied via artifacts + comment (not code).
3. Spark #100 marked **later** (recipe), not implement.
4. GH #6 / #7 remain **closed deferred** unless unpark criteria fire.

---

## Decision template (normative)

Every parked topic uses this record shape (fill in section D below):

```markdown
### DRn — <title>

| Field | Value |
|---|---|
| **ID** | DR-B8-0N |
| **Status** | park \| unpark-ready \| deferred-closed |
| **Date** | YYYY-MM-DD |
| **Chosen option** | <id from analysis> |
| **One-liner** | … |
| **Unpark criteria** | bullet list (AND/OR explicit) |
| **Unpark owner epic** | B? / GH# / none |
| **ADR / doc amend** | paths + intent |
| **NOT now** | bullet list |
| **Spark / GH** | links |
```

**DoD for “decisions written” (epic-level):**

- [x] Five DRn filled (or equivalent single multi-DR doc) — DR-B8-01…05 below; 02/04 unparked to ship
- [x] Unpark criteria testable (not « when we feel like it »)
- [x] ADR amend targets listed (even if amend PR deferred) — § ADR / doc amend targets
- [x] Spark #100 triage ∈ {spec, reject, later} — **later** (DR-B8-03)
- [x] #6 / #7 posture restated as deferred-closed / superseded (DR-B8-04/05)
- [x] No code change required to mark B8 decision-DoD done
- [x] Spec `status` moves `draft` → **`accepted`** (2026-08-04)

---

## D — Decision records

### DR-B8-01 — i18n engine: Paraglide vs catalogs

| Field | Value |
|---|---|
| **ID** | DR-B8-01 |
| **Status** | **park** |
| **Date** | 2026-07-30 |
| **Chosen option** | **P0** — keep `@gosilex/i18n` `createI18n` + **app-owned** TS catalogs (`example-web` `messages/{fr,en}.ts`) |
| **One-liner** | Paraglide stays preferred-on-paper (AGENTS/goal) but **not scheduled**; hand-rolled catalogs are the kit truth until unpark. |
| **Unpark criteria** | **Any 2 of:** (1) ≥2 product apps share kit i18n conventions and hit key-drift pain; (2) path locales `/fr`/`/en` become kit default; (3) hub mandates Roxabi Paraglide parity; (4) single app >~200 keys and contract tests fail operationally. |
| **Unpark owner epic** | New issue under B5/B6 or standalone — **not** B8 build |
| **ADR / doc amend** | See § ADR amend targets · B1 SSoT must stop implying Paraglide is live |
| **NOT now** | Add inlang/Paraglide deps · rewrite messages pipeline · put product strings in `packages/i18n` |
| **Spark / GH** | Spark #95 · epic #20 |

**Rationale:** Freeze 2026-07-12 allows Paraglide-vs-simple; quality audits already call hand-roll **acceptable interim**. Package rule A8 satisfied (real call site, no empty i18n zoo).

---

### DR-B8-02 — RBAC Phase B (custom org roles)

| Field | Value |
|---|---|
| **ID** | DR-B8-02 |
| **Status** | **unparked / superseded** (2026-07-30) → ship **GH #22** / Spark #127 · Goal 002 · ADR-0003 D4 |
| **Date** | 2026-07-30 |
| **Chosen option (historical park)** | R0 Phase A only — **superseded** |
| **One-liner (live)** | **Ship Phase B** after B2 BA-only + B3 A4/invites; kit dogfood on modules (e.g. feedback) is enough need signal; product RFC soft. |
| **Ship owner** | GH **#22** · Spark **#127** · Goal 002 · ADR-0003 D4 unpark |
| **Still NOT** | Empty `@gosilex/rbac` · platform live shared role templates · product LEAD/CONSULTANT keys in packages |
| **Spark / GH** | #22 · #127 · ADR-0003 · GH #11 Phase A done |

**Schema path (frozen, do not re-debate):**

```text
organization_roles (per-org, is_system)
organization_role_module_grants (role_id, module_id, access: write|read|disabled)
```

---

### DR-B8-03 — Patch log natif UI (Spark #100)

| Field | Value |
|---|---|
| **ID** | DR-B8-03 |
| **Status** | **park** · triage **`later`** |
| **Date** | 2026-07-30 |
| **Chosen option** | **L1** — later thin **recipe** (app MD/JSON + optional `/changelog` page); **not** L2 kit package |
| **One-liner** | Spark #100 = document-when-needed pattern; reject D1/admin CMS in kit until ≥2 products need identical CRUD. |
| **Unpark criteria** | **Go L2 package only if all:** (1) ≥2 products need in-app changelog; (2) content needs draft/publish or role/org gating; (3) static MD + deploy is proven insufficient. **Else** stay L0 external or L1 recipe. |
| **Unpark owner epic** | **B5** (#17) playbook for L1 · new issue for L2 if go |
| **ADR / doc amend** | None required; optional note in consumer playbook when B5 lands |
| **NOT now** | `packages/patchlog` · D1 `patch_logs` · admin CRUD · GitHub Releases scraper as kit default · reuse `@gosilex/feedback` as changelog |
| **Spark / GH** | Spark **#100** → **later** (not reject, not implement-now) |

**Triage label for Spark #100:** `later` (recipe-first).

---

### DR-B8-04 — Email prod outbound (GH #6)

| Field | Value |
|---|---|
| **ID** | DR-B8-04 |
| **Status** | **unparked / superseded** (2026-07-30) → ship **GH #21** / Spark #126 · **ADR-0004** · Goal 002 |
| **Date** | 2026-07-30 |
| **Chosen option (live)** | **CF Email Sending** default prod; local `log`\|Mailpit; Resend escape hatch only |
| **One-liner (live)** | Kit owns CF binding transport + redaction; domain onboard = ops companion (not merge gate). |
| **Still NOT** | Resend-as-default · SMTP prod → Mailpit · inbound routing · claim « domain onboarded » without ops |
| **Spark / GH** | #21 · #126 · ADR-0004 · historical #6 closed |

**Baseline + target surface:**

| Piece | Role |
|---|---|
| `docker-compose.yml` Mailpit | Local sink |
| `@gosilex/email` `sendLog` | Edge-safe local (fail-closed outside dev/test) |
| `@gosilex/email` **`sendCf`** | Worker binding (ship #21) |
| `@gosilex/email/server` `sendSmtp` | Node/CLI → Mailpit |
| Resend | Escape hatch only |

---

### DR-B8-05 — Plausible multi-site (GH #7)

| Field | Value |
|---|---|
| **ID** | DR-B8-05 |
| **Status** | **deferred-closed** |
| **Date** | 2026-07-30 |
| **Chosen option** | **A0** — doc-only (`docs/observability.md`); no default phone-home |
| **One-liner** | Plausible stays opt-in hub pattern; unpark as thin env-gated snippet when a public SPA needs it — never empty analytics package. |
| **Unpark criteria** | **Any:** (1) public `*.gosilex.com` SPA from kit needs hub entry; (2) B7 explicitly scopes web-analytics checkbox; still **env-gated**. |
| **Unpark owner epic** | **B7** (#19) or reopen #7 |
| **ADR / doc amend** | B1: #7 deferred; observability doc already sufficient as SSoT mini |
| **NOT now** | Default script in example-web · `@gosilex/analytics` empty package · PostHog+Plausible+Replay stack |
| **Spark / GH** | GH **#7** closed |

---

## ADR / doc amend targets

| Target | Action | When | Content intent |
|---|---|---|---|
| **ADR-0003** | Optional **amend** (status stays accepted) | With B1 doc PR or small docs PR | §Phasing Phase B: link `DR-B8-02` unpark criteria; restate « path only, not ship » |
| **ADR-0001** | No change expected | — | Catalogs remain app-owned (supports DR-B8-01) |
| **New ADR for i18n?** | **No** until Paraglide unpark | Unpark | If Paraglide chosen later → short ADR « message engine » |
| **AGENTS.md** | Edit under **B1** (#13) | B1 | i18n = TS catalogs + `@gosilex/i18n`; Paraglide optional later; #6/#7 deferred-closed; Phase B not shipped |
| **README** package map | B1 | B1 | Reflect email split `./server`; no patchlog package |
| **`docs/observability.md`** | Keep | — | Plausible optional already |
| **`docs/product-consumer-contract.md` / B5 playbook** | Add L1 changelog recipe **if** someone needs it | B5 | DR-B8-03 |
| **This spec** | `status: accepted` | Human | After review |

**No code ADR required for email/plausible while deferred-closed.**

---

## What NOT to implement in B8 (hard)

- Any runtime feature, migration, dependency bump for the five topics
- Paraglide / inlang toolchain
- Phase B RBAC SQL or guards
- Patchlog package or admin UI
- Resend/CF Email production client as kit default
- Plausible default snippet
- Empty packages « for later »
- Reopening #6/#7 without meeting unpark criteria
- Product-domain strings in `packages/*`

## What B8 **may** produce (allowed)

| Artifact | Required? |
|---|---|
| This analysis + spec | **Yes** |
| GH comment on #20 with paths | **Yes** |
| Optional docs-only ADR-0003 amend PR | No (can wait B1) |
| Spark status notes on #95/#100 | Nice-to-have (Spark UI) |
| Code | **No** |

---

## Dependency matrix (implementation after unpark)

| Decision | Blocked by (for *implementation*) | Blocks |
|---|---|---|
| DR-B8-01 Paraglide | Pain evidence / hub mandate | Nothing in spine |
| DR-B8-02 Phase B | B2 + B3 + product RFC | Fine-grained product authz |
| DR-B8-03 Patchlog L2 | 2-product demand | — |
| DR-B8-04 Email | Auth mail need or 2nd Worker | Magic-link realism |
| DR-B8-05 Plausible | Public SPA / B7 | — |

B8 **writing** is independent of B1–B7 completion.

---

## Definition of Done (epic #20)

### Decisions written (this cycle)

- [x] Analysis `artifacts/analyses/20-epic-b8-decisions-park-analysis.md`
- [x] Spec `artifacts/specs/20-epic-b8-decisions-park-spec.md` with DR-B8-01…05
- [ ] Human **accept** spec (`status: accepted`)
- [ ] GH #20 comment linking both paths + triage summary
- [ ] Optional: tick Spark #100 as **later**; #95 decisions recorded

### Explicitly out of DoD

- validate:full green related to these topics (N/A)
- Merged ADR amend (optional follow-up)
- Any green feature flag

---

## Ambiguity (non-blocking)

| Item | Handling |
|---|---|
| Spark #95/#100 have no GH numbers | Artifacts are SSoT; create GH children only if work unparks |
| Exact L1 changelog file layout | Deferred to B5 recipe |
| Whether password-reset forces email unpark | Owned by B2/B3 design, not B8 |

## Status

**`draft`** — awaiting human accept. Analysis recommendation is normative for agents until superseded.
