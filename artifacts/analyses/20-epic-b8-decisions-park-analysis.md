---
title: "Epic B8 — Décisions park (Paraglide, RBAC B, patchlog, email/plausible)"
issue: 20
spark: 121
status: draft
type: analysis
tier: F-decision
date: 2026-07-30
children_spark: [95, 100]
related_gh: [6, 7, 11, 13]
adr: [docs/architecture/adr/0003-multi-tenant-rbac-modules.md]
---

# Analysis #20 — Epic B8 · Décisions park

## Source

| | |
|---|---|
| **GH** | [#20](https://github.com/go-silex/silex-boilerplate/issues/20) — *B8 · Décisions park* |
| **Spark** | [#121](https://spark.gosilex.com/silex/developpement) (espace silex) |
| **Bloc** | B8 · séquentiel #8 · **P3** · non bloquant spine |
| **Enfants Spark** | **#95** (Paraglide / RBAC B) · **#100** (patch log natif) — *pas d’issues GH dédiées au moment de l’analyse* |
| **Deferred GH** | [#6](https://github.com/go-silex/silex-boilerplate/issues/6) email (closed) · [#7](https://github.com/go-silex/silex-boilerplate/issues/7) Plausible (closed) |
| **Upstream ADR** | [ADR-0003](../../docs/architecture/adr/0003-multi-tenant-rbac-modules.md) D4 / Phase B path |

## Problem

Cinq sujets **volontairement parkés** pour éviter re-débat pendant les epics spine (B1–B7). Sans note écrite :

1. Les agents / humans re-ouvrent « Paraglide or JSON? » à chaque PR i18n.
2. Phase B RBAC est tentante dès qu’un product demande un rôle custom — risque de forker le schéma avant A4/dogfood.
3. « Patch log natif UI » (Spark #100) n’a ni go ni no-go — peut glisser en feature kit non cadrée.
4. Email prod / Plausible ont été **fermés** (#6/#7) avec raison produit ; B1 (SSoT) doit les traiter comme deferred, pas comme « not done ».

**B8 ne build pas.** B8 **écrit les décisions** (criteria unpark + ADR amend targets + go/no-go).

## Outcome (appetite B8)

| Livrable | Done when |
|---|---|
| Note décision par topic | 5 fiches (ou 1 ADR amend multi-topic) avec option retenue **park** + critères unpark |
| Spark #100 trié | **spec / reject / later** explicite |
| #6/#7 posture | **stay deferred** sauf trigger product documenté |
| DoD epic | 0 code feature ; artifacts + comment GH ; status draft → accepted par humain |

Appetite: **S** (docs only, ½–1 journée architect).

---

## Baseline (worktree)

| Topic | État code / docs |
|---|---|
| **i18n** | `@gosilex/i18n` = `createI18n` + catalogs **app-owned** (ADR-0001). `example-web` : `messages/{fr,en}.ts` + cookie/localStorage locale. **Pas** de Paraglide/inlang. AGENTS §G : « Paraglide preferred **ou** JSON si plus simple ». Checklist AGENTS : *i18n FR/EN catalogs (Paraglide optional later)* ✅ |
| **RBAC Phase A** | ADR-0003 accepted · GH #11 closed · 4 system roles + platform/modules kit tables. Phase B = path only (D4), **not shipped**. |
| **Email** | `docker-compose.yml` Mailpit · `@gosilex/email` : template + `sendLog` (edge) · `./server` SMTP Node (Mailpit). Worker demo = log only. GH **#6 closed** : hors backlog kit ; transport product côté Spark #25/#79. |
| **Plausible** | `docs/observability.md` : optional, public sites. GH **#7 closed** : non priorisé. |
| **Patch log** | **Aucun** package / route / UI dans le kit. Spark #100 only. |

---

## Topic 1 — Paraglide vs catalogs TS/JSON (Spark #95)

### Options

| Id | Shape | Pros | Cons |
|---|---|---|---|
| **P0** | **Stay** hand-rolled + `@gosilex/i18n` engine (status quo) | Zéro tooling Vite ; type-safe `Messages` ; package leaf ; prouvé en example-web | Pas de compile-time missing-key fort hors tests ; pas d’ICU / message extraction ; diverge Roxabi |
| **P1** | **Paraglide** (inlang) in `example-web` (+ optional kit recipe) | Align Roxabi / goal A14 ; compile-time messages ; tooling mature | Coût Vite/plugins ; risque monorepo ; ADR-0001 « catalogs app-owned » reste vrai mais DX change |
| **P2** | JSON/YAML messages + loader (sans Paraglide) | Éditable non-dev ; i18n platforms | Perte type-safety ou codegen custom ; peu de gain vs TS catalogs |

### Recommendation (park)

**Park on P0.** Ne pas migrer vers Paraglide dans B8 ni tant que :

- un **2ᵉ app product** dans l’écosystème kit consomme les mêmes conventions **et** souffre du hand-roll (key drift, non-dev editors, ICU), **ou**
- un consumer force path-locale `/fr`/`/en` + SSR/marketing (TanStack Start optionnel) où Paraglide brille.

Freeze goal (2026-07-12) autorise explicitement *« Paraglide vs JSON if Paraglide hurts Vite »* — le hand-roll **est** la branche « simple » validée.

### Unpark criteria (any 2 → open child issue)

1. ≥2 call sites product (hors `example-web`) demandent extraction/compile-time keys.
2. Path locale routing (`/fr`, `/en`) devient kit default (pas cookie only).
3. Roxabi alignment is a **hard** org requirement for GOSILEX Chemin A (ticket hub).
4. Message count in a product app > ~200 keys **and** EN parity contract tests become painful.

### Dependencies

| Epic / issue | Why |
|---|---|
| **B1** (#13) | SSoT must say « catalogs TS + `@gosilex/i18n` ; Paraglide deferred » — stop overclaim. |
| B5 consumer playbook | Document how products own `messages/*`. |
| **Not** B2/B3 multi-tenant | Independent. |

### What not to do now

- Ajouter `@inlang/*` / Paraglide au monorepo.
- Vider `@gosilex/i18n` pour « attendre Paraglide ».
- Hardcoder product copy dans `packages/i18n` (ADR-0001).

---

## Topic 2 — RBAC Phase B unpark (Spark #95 · ADR-0003 D4)

### Options

| Id | Shape | Pros | Cons |
|---|---|---|---|
| **R0** | **Stay Phase A only** (4 system roles, code capability map) | Schéma stable ; IDOR matrix known ; products map LEAD/CONSULTANT → system keys | Products with fine grants fork early |
| **R1** | **Unpark Phase B** : `organization_roles` + `organization_role_module_grants` (write\|read\|disabled) | Matches ADR path ; per-org custom roles | Surface sécu large ; UI admin ; invite/role ceiling coupling |
| **R2** | Product-local role overlays (app tables, not kit) | Fast for one product | Schema divergence vs kit SSoT — **anti-pattern** si 2+ products |

### Recommendation (park)

**Park on R0** until Phase A is **dogfooded** and A4 shells / invites land.

ADR-0003 already **locks the path** (D4) without shipping tables. Unparking early invents UI + grant resolution before products prove the 4-role matrix is insufficient.

### Unpark criteria (all of primary, then any secondary)

**Primary (must):**

1. **B2** (#14) BA default + multi-tenant dogfood green on kit examples.
2. **B3** (#15) A4 shells (`/admin`, `/app`) + invites threat model closed (or seed still OK but admin UX real).
3. ≥1 product app documents a **failed** mapping of business roles → `owner|admin|member|reader` with concrete grant gaps (not aesthetic labels).

**Secondary (accelerate unpark):**

4. Second product needs the **same** custom-role model (2 call sites → kit, not fork).
5. Module matrix code seed exceeds maintainability (many modules × roles).

### Schema reminder (do not re-debate — ADR-0003)

```text
organization_roles (per org, is_system)
organization_role_module_grants (role_id, module_id, access: write | read | disabled)
```

- Custom roles **per-org first** (no live platform templates with `organization_id NULL`).
- Templates later = copy-on-create.
- `member.role` stays system key or documented custom convention; fine grants kit-side.
- **No** empty `@gosilex/rbac` package (ADR-0003 D13 / anti-patterns).

### Dependencies

| Epic | Why |
|---|---|
| **#11 closed** | Phase A spine prerequisite ✅ |
| **B2** | BA adapter default / dogfood |
| **B3** | Invites + shells expose role UX pain |
| B1 | Docs must not claim Phase B shipped |

### What not to do now

- Migrations Phase B « pour préparer ».
- Package `@gosilex/rbac`.
- Re-open ω2 kit-only tenant (rejected).
- Copy Spark `LEAD`/`CONSULTANT` into kit vocabulary.

---

## Topic 3 — Patch log natif UI (Spark #100)

### Problem framing

« Patch log natif » = UI in-app des **notes de version / changelog** (what's new) pour les users du product — **pas** le git log, **pas** le Spark ticket stream, **pas** le feedback backlog (#8).

Aucun artefact kit aujourd’hui. Risque : builder un mini-CMS versioning hors besoin.

### Options

| Id | Shape | Pros | Cons |
|---|---|---|---|
| **L0** | **Reject kit** — products use external (GitHub Releases, Notion, Spark space, static MD) | 0 kit surface | Inconsistent UX cross-products |
| **L1** | **Later / thin recipe** — doc pattern: MD/JSON file in app + simple `/changelog` route example | Cheap dogfood | Not a package |
| **L2** | **Kit package** `@gosilex/patchlog` or `packages/changelog` + D1 entries + admin UI | SSoT multi-product | Scope creep ; i18n FR/EN ; authz admin ; moderation |
| **L3** | **Embed Spark / external CMS** via iframe or API | Reuse pilotage | Coupling Spark ; not offline-friendly |

### Recommendation (park → **later / recipe**, not package)

**Triage Spark #100: `later` (L1), not build L2 in B8.**

Go/no-go for a **real package**:

| Go (unpark L2) | No-go (stay L0/L1) |
|---|---|
| ≥2 GOSILEX products need the **same** in-app changelog with admin CRUD | Only one product wants a banner « what's new » |
| Content must be **org-scoped** or role-gated (client vs BO) | Public marketing changelog on static site is enough |
| Needs D1 audit + draft/publish workflow | Markdown in repo + deploy is enough |

Default: **L1 recipe in consumer playbook (B5)** when someone asks — single `CHANGELOG.md` or `content/releases/*.md` consumed by example-web page. **No D1 table in kit spine.**

### Dependencies

| Epic | Why |
|---|---|
| **B5** | Playbook is the natural home for L1 recipe |
| **B3** | If BO shell exists, optional admin-only page later |
| i18n (T1) | FR/EN release notes if multi-locale |
| **Not** email/plausible | Orthogonal |

### What not to do now

- Schema `patch_logs` / package scaffold.
- Wire feedback package to double as changelog.
- Scrape GitHub Releases from Workers as default (tokens, rate limits).

---

## Topic 4 — Email prod outbound (GH #6 · closed deferred)

### Closed reason (GH)

> Hors backlog kit actif ; transport email traité côté produit Spark #25/#79. Réouvrir si chantier kit.

### Options

| Id | Shape |
|---|---|
| **E0** | **Stay deferred** — keep Mailpit compose + log/SMTP split as-is |
| **E1** | Reopen #6 kit track: promote full `sendEmail` on Workers (Resend/CF Email) + React Email FR/EN |
| **E2** | Product-only forever; kit stays demo templates + Node SMTP helper |

### Recommendation (park)

**E0 stay deferred** (align close comment). Kit already has:

- Mailpit in `docker-compose.yml`
- Edge-safe `sendLog`
- Node `sendSmtp` under `@gosilex/email/server`
- AGENTS §H2 contract (`EMAIL_TRANSPORT=smtp|resend|cf`) as **target**, not fully shipped on Worker

### Unpark criteria (reopen #6 or child)

1. A **kit** flow requires real outbound (magic link / reset password **in example-api** for BA dogfood) **and** log transport is insufficient for CI/staging proof.
2. Second Worker app would otherwise **fork** Resend/CF Email client (2 call sites rule).
3. Product request explicitly: « promote transport from Spark into kit SSoT » with owner + date.

### Dependencies

| Epic / issue | Why |
|---|---|
| **B2/B3** | Password reset / magic link may force unpark |
| ADR-0002 / BA | Email templates couple to auth flows |
| **Not** B8 implement | Decision only |

### What not to do now

- Resend SDK in monorepo without reopen.
- Point prod SMTP at Mailpit.
- Claim AGENTS « email prod done ».

---

## Topic 5 — Plausible multi-site (GH #7 · closed deferred)

### Closed reason (GH)

> Hors backlog kit ; Plausible non priorisé. Réouvrir si chantier kit.

### Options

| Id | Shape |
|---|---|
| **A0** | **Stay deferred** — doc-only in `docs/observability.md` |
| **A1** | Thin env-gated script in `example-web` (`VITE_PLAUSIBLE_DOMAIN`) opt-in |
| **A2** | Package `@gosilex/analytics` |

### Recommendation (park)

**A0**, with optional **A1** only when a **public** kit marketing surface needs it. **A2 forbidden** until 2 call sites (A8).

Anti-doublon (AGENTS §I) remains normative:

```text
Plausible  = trafic web anonyme
Sentry     = crashs
PostHog    = product events (P2)
Better Stack = logs + uptime
```

### Unpark criteria

1. Public SPA under `*.gosilex.com` ships from this kit **and** ops wants hub `analytics.gosilex.com` entry.
2. B7 obs epic needs a concrete web-analytics checkbox (not error tracking).
3. Still **opt-in** — never phone-home default in template.

### Dependencies

| Epic | Why |
|---|---|
| **B7** (#19) | Natural home if unparked (obs quality) |
| B4 staging examples | Domain list for multi-site hub |
| **Not** multi-tenant RBAC | Orthogonal |

### What not to do now

- Default Plausible snippet in example-web without env gate.
- PostHog + Plausible + Sentry Replay combo.
- Empty `@gosilex/analytics` package.

---

## Cross-topic dependency map

```text
B1 SSoT (#13) ─────────────────────────────────────────────┐
  · claims #6/#7 deferred, i18n = catalogs, Phase B = path  │
                                                             ▼
B2 BA default (#14) ──► B3 shells/invites (#15) ──► [unpark RBAC B?]
                                                             │
B5 playbook (#17) ──► patchlog L1 recipe (if needed)         │
B7 obs (#19) ──► [unpark Plausible A1?]                      │
B2/B3 auth email ──► [unpark Email E1?]                      │
                                                             │
B8 (this) = write decisions only ◄── no block on B1–B7 code  │
```

**B8 is sequential #8 but non-blocking:** can be written **in parallel** with B1–B7; **unpark implementations** wait on the deps above.

---

## Risks if B8 skipped

| Risk | Impact |
|---|---|
| Agents implement Paraglide mid-PR | Scope blow, Vite friction |
| Phase B tables before dogfood | Security review debt, schema churn |
| Patchlog package greenfield | Empty package zoo (A8 violation) |
| Reopen #6/#7 without criteria | Priority thrash vs product Spark work |

## Ambiguity

| Item | Resolution in B8 |
|---|---|
| Spark #95/#100 not on GH | Decisions live in artifacts; optional later GH children |
| Exact patchlog UX | **Out of B8** — L1 recipe when unparked |
| BA invite email transport | Owned by B3 unpark email if needed — not B8 build |

## Fit check

| Constraint | OK? |
|---|---|
| Kit extractibility / 0 product strings | Yes — docs only |
| A8 no empty packages | Yes — reject premature packages |
| ADR-0003 D4 path preserved | Yes |
| Zero-edit consumer contract | Untouched |
| validate:full | N/A (no code) |

## Recommendation summary

| Topic | Park decision | Unpark home |
|---|---|---|
| Paraglide | **P0** catalogs + `@gosilex/i18n` | New issue when ≥2 apps / path locales |
| RBAC Phase B | **R0** ADR path only | After B2+B3 + product grant gap |
| Patchlog #100 | **later / L1** recipe | B5 playbook ; L2 only if 2 products |
| Email #6 | **deferred** E0 | Reopen on auth mail / 2nd Worker |
| Plausible #7 | **deferred** A0 | B7 or public SPA need |

**Next:** `artifacts/specs/20-epic-b8-decisions-park-spec.md` (decision records, DoD, ADR amend targets).
