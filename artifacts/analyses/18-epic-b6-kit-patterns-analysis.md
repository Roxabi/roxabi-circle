---
title: "Epic B6 — Patterns kit productifs (MasterData, API client, jobs, presign)"
issue: 18
spark: 119
status: approved
tier: F-full
date: 2026-07-30
updated: 2026-08-03
frame: artifacts/frames/18-epic-b6-kit-patterns-frame.md
related:
  - artifacts/frames/18-epic-b6-kit-patterns-frame.md
  - artifacts/reviews/2026-07-12-goal-arbitration-freeze.md
  - docs/architecture/adr/0001-primary-axis-packages-compose-apps.md
  - artifacts/analyses/001-cross-app-features-metalyde-ether-enzo-spark.md
  - artifacts/analyses/quality-audit/tech-debt/A-packages.md
---

# Analysis #18 — B6 · Patterns kit productifs

## Source

| | |
|---|---|
| **GitHub** | [#18](https://github.com/go-silex/silex-boilerplate/issues/18) |
| **Spark** | [#119](https://spark.gosilex.com/silex/developpement) · Epic B6 |
| **Bloc** | B6 — Patterns kit productifs (séquentiel #6 · après B5 playbook ou parallèle fin B3) |
| **Priorité** | P2 |
| **Enfants cités** | #89 Jobs · #90 MasterData · #91 Presign · #92 FE API client (**absents du repo GH au moment de l’analyse**) |

## Problem

Les products GOSILEX (share, futurs SaaS CF) **recopient** les mêmes briques dès le premier slice :

1. **MasterData** — entité référentielle CRUD (liste, create, detail, delete, i18n, table UI)
2. **Client API FE** — `fetch` + `credentials: 'include'` + envelope `{ error, requestId }` → toast / field errors
3. **Jobs** — offload async (CF Queues) + cron (org recheck, digests, cleanup)
4. **Presign R2** — gros upload hors body Worker (frame M2 vidéo ≤ 500 MiB)

Le kit a déjà des **embryons** (notes CRUD, `apiFetch` app-local, `@gosilex/storage` put/get, zero Queues). Sans patterns **documentés + example verts**, chaque product invente sa variante → N×M drift axial (ADR-0001) et dette TD-A-012 (storage sans presign).

**JTBD epic :**

> *En partant du kit, un dev GOSILEX clone 4 patterns productifs (MasterData, API client, jobs, presign) avec example verts, sans string métier produit, et sans packages vides (A8).*

## Baseline (worktree actuel)

> **Re-baseline 2026-08-03** (post B5 consumer-ready, MCP contracts, quality hygiene — ~124 commits since issue open): claims below **still hold**. No `@gosilex/jobs` / `@gosilex/api-client`; storage has put/get/delete only (no presign); example-api wrangler has no queues/cron; `apiFetch` remains app-local (`apps/example-web/src/lib/api.ts`); children #89–#92 still absent on GH. Frame approved: `artifacts/frames/18-epic-b6-kit-patterns-frame.md`.

### MasterData / notes

| Surface | État |
|---|---|
| D1 `demo_notes` | id, subject, title, body, createdAt — **ownership subject** |
| Couches | `routes/notes` → `services/notes` → `repos/notes` (A6 OK) |
| R2 | attachment texte via `StorageClient(bucket, 'demo')` — body Worker, ≤ 50k chars |
| Web | `NotesPage` Table + Dialog create + delete confirm · TanStack Query/Form |
| Manque MasterData « catalogue » | pas de slug/code stable, pas d’update, pas de soft-delete, pas de pagination/search, pas de page détail, pas de seed multi-row référentiel |

**Verdict :** notes = **preuve de couches + ownership**, pas encore le pattern MasterData référentiel (lookup table admin-style).

### FE API client

| Surface | État |
|---|---|
| `apps/example-web/src/lib/api.ts` | `ApiError`, `apiFetch`, `apiErrorToMessage` + catalog i18n |
| Tests | `api.test.ts` (credentials, envelope, fallback) |
| Consommateurs | notes, keys, auth, modules, integrations, health |
| Package | **aucun** — app-local only |
| `@gosilex/types` | `ApiErrorBody` + `ErrorCode` (SSoT wire) |
| `@gosilex/core` | `AppError` / `toApiErrorBody` (BE only) |

**Verdict :** pattern **déjà correct** en app ; gap = **promote copiable** (package ou doc extract) pour que product-web ne fork pas.

### Jobs

| Surface | État |
|---|---|
| `wrangler.toml` example-api | D1 + R2 only — **pas** de `[[queues.*]]` ni `triggers.crons` |
| `@gosilex/jobs` | **absent** (AGENTS map P1 roadmap — OK A8) |
| Handlers | aucun `queue` / `scheduled` export |
| Produit frame | cron org recheck ≤24h (M3), jobs async upload/commit (M2+) |

**Verdict :** zero surface — pattern à **introduire** (minimal, demo).

### Presign / storage

| Surface | État |
|---|---|
| `@gosilex/storage` | `joinObjectKey`, free put/get/delete, `StorageClient` prefix-enforced, head/list optionnels |
| Presign | **absent** (TD-A-012, ARCH-P03-007) |
| Binding R2 Worker | pas d’API native presign — besoin **S3 API credentials** + `aws4fetch` (docs CF) |
| A25 freeze | « Presign = optional light helper ; **no video product** » |
| Notes attachment | toujours body Worker (OK kit demo) |

**Verdict :** grow `@gosilex/storage` (pas nouveau package) + demo route **light** (small file PUT URL), pas multipart vidéo share.

## Shapes

### Shape A — Un epic + 4 tickets enfants ordonnés (recommandé)

```text
Epic #18 (coord + DoD global)
  ├── #92 FE API client     (promote early — débloque web MasterData/presign clean)
  ├── #90 MasterData        (entity demo CRUD + page ; consomme client)
  ├── #91 Presign           (storage helper + demo upload path)
  └── #89 Jobs              (queues/cron minimal ; souvent last — infra CF)
```

| | |
|---|---|
| **Pro** | DoD epic unique · priorisation claire · PRs reviewables · A8 par ticket |
| **Con** | Overhead GH (4 issues + liens) |
| **Rough scope** | Epic L · enfants S–M chacun |

**Enfants #89–#92 absents sur GH** → les (re)créer au plan, ou remplacer par issues numérotées fraîches liées à #18.

### Shape B — Quatre tickets indépendants sans epic

| | |
|---|---|
| **Pro** | Merge order libre |
| **Con** | Pas de DoD croisé (README map, 4 patterns verts) · risque 1 pattern livré 3 oubliés |
| **Verdict** | **Rejeté** pour ce bloc B6 (Spark a déjà l’epic) |

### Shape C — Un seul mega-PR « B6 patterns »

| | |
|---|---|
| **Pro** | Un merge |
| **Con** | Review sécu impossible (presign + jobs + FE) · fail CI opaque · contredit « un concern par PR » AGENTS |
| **Verdict** | **Rejeté** |

### Shape D — Packages-first zoo (`@gosilex/masterdata`, `api-client`, `jobs`, storage grow)

| | |
|---|---|
| **Pro** | Surface npm claire |
| **Con** | **A8** : package only if example consumes · MasterData **domain** ne doit **pas** être un package générique CRUD ORM · jobs sans consumer = theater |
| **Verdict** | **Rejeté** comme bulk ; ok **sélectif** (voir promote matrix) |

## Promote package vs app-local first (A8 / X6)

Règles figées :

- **A8** : create package only when **example imports it**
- **X6 / AGENTS** : 2 call sites **ou** ADR — pas de squelettes vides
- **A20** : schemas D1 **apps own** — packages = glue
- **A10/A11** : demo domain `demo_*` + R2 prefix `demo/` only

| Pattern | App-local first? | Package? | Raison |
|---|---|---|---|
| **MasterData** | **Oui — forever as demo entity** | **Non** (`@gosilex/masterdata` **interdit**) | Entité + SQL + routes = domain demo. Pattern = **doc + copy structure** (notes → `demo_items` or extend notes). Un package CRUD générique = ORM leak + domain pollution. |
| **FE API client** | Existe déjà app-local | **Oui promote** → `@gosilex/api-client` **ou** sous-path `@gosilex/core/client` / `@gosilex/types` + thin package | Déjà 1 consumer fort (example-web). Promote **avec** migration example-web = 1er call site A8. Product-web 2e call site imminent (share). Envelope FE doit matcher `@gosilex/types`. **Pas** d’endpoints hardcodés. |
| **Jobs** | **Oui d’abord** : handler + wrangler dans `example-api` | **Ensuite** `@gosilex/jobs` **si** helpers ≥2 usages (parse batch, ack helpers, cron guard) **ou** ADR « kit convention » | Package vide `enqueue` one-liner = theater. Prefer: demo queue **echo/ping-job** + optional thin types. |
| **Presign** | Routes/services demo dans app | **Oui grow** `@gosilex/storage` (pas nouveau package) | AGENTS map déjà « put/get/**presign** ». Helper sign(key, method, expires) + tests memory/mock. Credentials S3 en env app — **jamais** hardcodés dans package. |

### Matrice décision promote

```text
MasterData  →  app pattern only (docs/example)
API client  →  package @gosilex/api-client (or core/client) + migrate example-web
Presign     →  packages/storage + example-api demo route
Jobs        →  example-api first; @gosilex/jobs only if non-trivial helpers + import
```

## Fit Check — 1 epic vs 4 tickets

| Question | Réponse |
|---|---|
| Un seul concern? | Non — 4 surfaces (FE, domain demo, R2, CF Queues) |
| Dépendances? | Faibles mais ordonnées (client → MasterData UI ; storage → presign route ; jobs isolé) |
| DoD partagé? | Oui — README package map + 4 patterns verts + `validate:full` |
| **Décision** | **Shape A** : garder epic #18 ; implémenter via **4 tickets enfants** (créer s’ils manquent) ; **pas** mega-PR |

### Ordre d’implémentation recommandé

| # | Ticket | Pourquoi cet ordre |
|---|---|---|
| 1 | **API client (#92)** | Zero CF infra ; débloque FE MasterData/presign ; promote package early |
| 2 | **MasterData (#90)** | CRUD + page sur client partagé ; prouve pattern sans R2/Queues |
| 3 | **Presign (#91)** | Storage grow + demo ; sécu review (TTL, prefix, auth) |
| 4 | **Jobs (#89)** | Binding Queues/cron + local wrangler ; le plus « ops » |

Parallélisable : Jobs ∥ Presign après API client si team ≥2. MasterData peut commencer backend sans FE client package (app-local api.ts interim).

## Axial risks (domain leaking into packages)

| ID | Risque | Sévérité | Mitigation |
|---|---|---|---|
| AX-18-01 | Package MasterData avec tables/routes génériques « Product/Customer » | **P0** | **Pas de package** ; entity demo générique (`demo_catalog_items` / enrich notes) sans string métier share/metalyde |
| AX-18-02 | Presign helper avec prefix `share/` ou limits vidéo 500 MiB frame | **P0** | Prefix **caller-supplied** · demo prefix `demo/` · size limit **kit-demo small** (ex. 1–5 MiB) · banlist |
| AX-18-03 | `@gosilex/jobs` avec noms de jobs produit (`artifact.commit`, `org.recheck`) | **P1** | Package = types + `defineQueueHandler` / parse only · job names **app** |
| AX-18-04 | API client avec paths `/api/artifacts` ou mappers métier | **P0** | Client = `baseUrl` + `credentials` + `ApiError` + optional `onUnauthorized` · **zero** routes métier |
| AX-18-05 | Schemas Zod MasterData dans `@gosilex/types` | **P1** | Types kit = ErrorCode/envelope only · Zod entity **dans l’app** |
| AX-18-06 | Presign secrets (R2 access key) loggés ou exposés au browser | **P0** | Sign **server-only** · return URL only · never echo secret · `.dev.vars.example` placeholders |
| AX-18-07 | Queue consumer god-file = product orchestrator | **P1** | Demo consumer **1 message type** (`demo.ping` / `demo.email`) · doc « product adds handlers » |
| AX-18-08 | FE package dépend de React Query / messages FR | **P2** | `@gosilex/api-client` **fetch-only** (isomorphic) · i18n map reste app (`apiErrorToMessage` + catalog) |

## Risks techniques (non-axiaux)

1. **Presign local** : R2 local miniflare/wrangler **sans** S3 credentials → besoin mode **mock** (`PRESIGN_MODE=mock|s3`) pour tests verts offline.
2. **aws4fetch** dependency dans storage ou app : préférer dep de **example-api** (ou storage optional peer) pour garder package storage thin.
3. **Queues free tier / local** : wrangler local queues support à vérifier en implémentation ; fallback doc « producer no-op if binding absent » pour CI sans queue.
4. **MasterData vs notes** : dual CRUD confus — soit **étendre notes** (update + list filters), soit **nouvelle** entité `demo_items` clairement « catalogue » ; ne pas laisser 2 demi-patterns.
5. **Child issue numbers** : #89–#92 n’existent pas → re-numéroter ou créer avant plan.

## Alternatives considérées (résumé)

| Alt | Décision |
|---|---|
| MasterData = package genérico | **Non** — axial domain |
| API client reste app-only forever | **Non pour kit** — product fork certain ; promote with example consumer |
| Presign only in product share M2 | **Non** — A25 light helper kit ; share adds multipart later |
| Jobs = full workflow engine | **Non** — hors scope epic (CSV bulk · orchestrateur métier) |
| Cron only sans Queues | Possible slice jobs-min ; prefer **both** light (queue producer + scheduled tick) for completeness |

## Unresolved (spec must pin)

1. Nom package FE : `@gosilex/api-client` vs export `@gosilex/core/browser` ?
2. MasterData : **new entity** `demo_catalog` vs **upgrade notes** (PATCH + search) ?
3. Presign : single PUT only (kit) vs stub multipart interface (names only, no video) ?
4. Jobs : real queue binding in CI or mock-only unit tests + optional local queue ?
5. Créer GH children #89–#92 ou nouveaux IDs liés à #18 ?

## Recommendation

1. **Shape A** — epic #18 coordonne ; **4 tickets d’implémentation** ordonnés (API client → MasterData → Presign → Jobs).
2. **Promote matrix** ci-dessus (A8 strict).
3. **MasterData = app pattern only** ; **API client = package** ; **presign = storage grow** ; **jobs = app first ± thin package**.
4. **Hors scope** (epic body) : import CSV bulk · orchestrateur métier · vidéo 500 MiB · share domain strings.
5. Spec draft already exists (`artifacts/specs/18-epic-b6-kit-patterns-spec.md`, status draft) — on analyze approve, pin § Unresolved then `/plan`.

## Expert review notes (2026-08-03)

| ρ | Verdict | Notes folded |
|---|---|---|
| product-lead | good | JTBD + DoD epic align; Shape A preserves Spark epic; child IDs must be recreated before plan |
| architect | good | Promote matrix A8-clean; AX-18-01/02/04/06 P0 still correct; MasterData package remains killed |
| devops | needs pin | Jobs CI: prefer mock unit + optional local queue doc (χ4) — avoid requiring CF queue in validate:full day-1 |

Unresolved expert concerns → χ list (package name, entity choice, presign surface, jobs CI, child IDs).

## Evidence map (paths)

| Area | Paths |
|---|---|
| Notes BE | `apps/example-api/src/{routes,services,repos}/notes.ts` · `db/schema.ts` (`demo_notes`) |
| Notes FE | `apps/example-web/src/routes/notes.tsx` · `lib/api.ts` · `lib/schemas.ts` |
| Storage | `packages/storage/src/index.ts` (+ tests) |
| Errors SSoT | `packages/types` · `packages/core/src/errors.ts` |
| Email package pattern (A8 ref) | `packages/email` · consumed by example-api |
| Feedback package pattern | `packages/feedback` · multi-entry + example routes |
| Wrangler | `apps/example-api/wrangler.toml` (no queues/cron yet) |
| Axial | `docs/architecture/adr/0001-*.md` · freeze A8/A20/A25 |
| Debt | `artifacts/analyses/quality-audit/tech-debt/A-packages.md` TD-A-012 |
