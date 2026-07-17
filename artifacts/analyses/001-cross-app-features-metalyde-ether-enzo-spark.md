# Analyse #001 — Features communes Metalyde / Ether / Enzo / Spark → kit Chemin A

| Champ | Valeur |
|-------|--------|
| **Date** | 2026-07-15 |
| **Repo cible** | `go-silex/silex-boilerplate` · `artifacts/analyses/` |
| **Sources code** | `extern-client-metalyde`, `extern-client-enzo-os` (archivé), `spark` |
| **Source hors code** | Ether OS — vault `silex-hub/05_PIPELINE/03_Ether` + livrables Sprint 1 (repo app **absent** de `gosilex/`) |
| **Kit référence** | `silex-boilerplate` packages + `apps/example-*` (goal Chemin A 2026-07-12/13) |
| **Statut** | Note de cadrage produit/platform — **pas** de décision d’implémentation figée |
| **Auteur** | Analyse agent (session 2026-07-15) |

---

## 0. Caveats

1. **`ext-client-ether` n’existe pas** sous `gosilex/` ni comme repo listé `go-silex/*`. Ether = pipeline client + app historique Lovable (`ether-os-wip`) + Airtable/Supabase. Features Ether = docs passation / Sprint 1 / bi-weeklies, **pas** inventaire de code local.
2. **Enzo** = `extern-client-enzo-os` marqué **archivé** (lecture seule). `enzo-os/` (HTML/Vite) est un autre artefact plus léger — hors périmètre principal de cette note.
3. **Chemin A vs B** : Metalyde / Enzo / Spark = **Next full-stack (B)**. `silex-boilerplate` = **Workers/Hono/D1/R2 (A)**. Les features à promouvoir dans le kit sont des **platform concerns** extractibles, pas un port brut Next → Workers.
4. **ADR axial kit** : domaine métier **jamais** dans `packages/*` ; three-strikes → package. Freeze goal : pas de billing / PostHog / Nest / Next / Clerk dans le kit.

---

## 1. Cartographie des apps

| App | Dossier / source | Rôle produit | Stack (figée) | État |
|-----|------------------|--------------|---------------|------|
| **Metalyde** | `gosilex/extern-client-metalyde` | OS agence ↔ clients (ops + créa) | Next 16 · Better Auth · Drizzle/SQLite · Supabase Storage · Resend · TanStack Form/Query | Prod `metalyde.gosilex.com` |
| **Ether** | vault `05_PIPELINE/03_Ether` (+ app hors monorepo) | Portail + ops cabinet CIR/C2I | Supabase + RLS · sync Airtable · UI dark | MVP / adoption fragile (statuts, data Airtable) |
| **Enzo** | `gosilex/extern-client-enzo-os` | OS coaching (missions, devis, factures, km, OPCO) | Next · Better Auth · Drizzle · Pennylane · Google Calendar/Routes | **Archivé** |
| **Spark** | `gosilex/spark` | Espace client multi-tenant Silex | Next 14 · cookies HMAC · Prisma/SQLite · dnd-kit · React Flow | Prod `spark.gosilex.com` |
| **silex-boilerplate** | `gosilex/silex-boilerplate` | Kit SaaS Chemin A (upstream products) | Bun/Turbo · Hono Worker · D1/R2 · dual auth · TanStack SPA · FastMCP | Kit live |

### Inventaire métier condensé

**Metalyde** — fiche client centrale ; rôles `ADMIN`/`LEAD`/`CONSULTANT`/`CLIENT` + client-team `ADMIN|MEMBER|READER` ; onboarding 4 étapes ; brand questionnaire ; roadmap Audit→Tests→Croissance ; kanban tasks ; budgets MER ; meetings (+ read.ai) ; KPIs ; key dates ; documents + defaults ; médiathèque ; brief créa 5 étapes (Meta) ; team/consultants ; articles CMS ; audit log ; notifications ; report → Spark feedback ; impersonation `connected-as`.

**Ether** — 3 espaces Admin / Collaborateur / Client ; RLS ; missions stepper P1–P11 ; créances ; suivi CIR ; alertes auto (deadlines/blocages) ; journal d’activité ; demandes/messagerie temps réel ; documents privés ; onboarding 4 étapes + questionnaire CIR ; sync bidirectionnelle Airtable ; recherche/filtres sur ~13 tableaux ; design system “luxury operational”.

**Enzo** — missions + participants ; devis ; factures clients ; sync Pennylane ; frais km + véhicules ; templates email ; calendar events (Google) ; OPCO ; documents ; report → Spark feedback ; auth Better Auth (forgot/reset).

**Spark** — multi-client `[slug]` ; viewer owner/client/collaborator ; sections enabled/locked ; accueil/recap ; pilotage tickets ; kanban tâches ; roadmap ; orgchart React Flow ; user journeys ; resources + articles KC ; comments + seen ; admin self-serve ; API keys `spk_` M2M ; feedback SDK ; Slack multi-app ; GitHub issues link ; cron weekly digest ; onboarding tours (driver.js).

---

## 2. Features en commun

### 2.1 Matrice socle (≥3/4 apps métier)

| Feature | Metalyde | Ether | Enzo | Spark |
|---------|:--------:|:-----:|:----:|:-----:|
| Auth email/password + sessions | ✓ Better Auth | ✓ | ✓ Better Auth | ✓ HMAC maison |
| Rôles multi-espace (admin / staff / client) | ✓ | ✓ | ✓ users | ✓ owner/client/collab |
| Isolation données (client ≠ client) | guards + assignations | **RLS** | scope user | slug + allowlist |
| Entité centrale dossier / mission / espace | fiche client | mission | mission | espace `[client]` |
| Documents / fichiers privés | docs + médiathèque | bucket privé | documents | resources/uploads |
| Listes + recherche + filtres | ✓ | ✓ | ✓ | ✓ |
| Workflow / étapes / statuts | roadmap + kanban | P1–P11 + alertes | lifecycle mission | sections + tasks/tickets |
| Notifications / badges “à traiter” | ✓ | alertes + unread | partiel | comments seen + digests |
| Onboarding guidé | 4 étapes client | 4 étapes client | login/reset | driver.js |
| Dashboard / KPIs | perf + notifs | KPIs cliquables | home | accueil/recap |
| Commentaires / échanges | task comments | messagerie temps réel | — | comments + feedback |
| Audit / journal d’activité | audit log | activity log | — | partiel (webhooks GH) |
| Gestion utilisateurs / équipe | team + client-team | équipe + invites | users | admin users |
| UI 100 % français | ✓ | ✓ | ✓ | ✓ |
| Signalement → Spark (`spark-feedback`) | ✓ | prévu (ETHER.md) | ✓ | natif + API `spk_` |
| Couches queries → services → API | ✓ | n/a (Lovable) | ✓ | plus ad hoc |
| Email transactionnel / lifecycle | Resend | invites | templates | digest Slack/email |
| Intégrations externes | Meta, read.ai, Pappers… | Airtable, Leexi… | Pennylane, GCal | Slack, GitHub |

### 2.2 Patterns d’architecture récurrents

- **Portail multi-rôle** : 2–4 shells (admin / collab / client) sur un même produit.
- **Garde d’accès** : session + rôle + (souvent) scope tenant.
- **Storage** : chemin/métadonnées en DB ; binaire ailleurs (Supabase Storage / FS / volume Docker / R2).
- **Modules ou sections activables** : Spark `Section` enabled/locked ; kit a déjà une démo `modules`.
- **Validation Zod** aux frontières HTTP + domaine (Metalyde, Enzo, kit).
- **Staging/prod + secrets hors git** ; feedback Spark avec garde same-origin (Metalyde report).

---

## 3. Features “besoin demain” pour une autre application

### 3.1 Platform — quasi certain sur le prochain SaaS multi-acteur

| Feature | Pourquoi “demain” | Vu chez |
|---------|-------------------|---------|
| Dual auth session + API key M2M | Apps + agents + webhooks | Spark `spk_`, boilerplate |
| RBAC + landing par rôle | Tout OS multi-acteur | 4/4 |
| Multi-tenant / isolation client | Portail client + back-office | 4/4 |
| CRUD listes search/filter + empty states FR | Base UX métier | 4/4 |
| Upload docs privés + signed URLs | Contrats, preuves, livrables | 4/4 |
| Audit log “qui a fait quoi” | Confiance + support | Metalyde, Ether |
| Notifications in-app (compteurs / centre) | Adoption ops | Metalyde, Ether, Spark |
| Onboarding multi-étapes + progress | Activation client | Metalyde, Ether, Spark |
| Invitation users par email | Onboarding collab/client | Ether, Metalyde team |
| Commentaires / threads contextuels | Collab asynchrone | Metalyde, Ether, Spark |
| Kanban / board tâches configurable | Ops agence / coach / conseil | Metalyde, Spark (+ Ether tâches) |
| Roadmap / frise / jalons | “Où on en est” | Metalyde, Spark, Ether |
| Admin console self-serve | Users, flags modules sans redeploy | Spark, Metalyde lead |
| Feature flags / modules on-off | Rollout par client | Spark sections, kit modules |
| Feedback “Signaler” → backlog Silex | Support cross-apps | Metalyde, Enzo, Spark SDK |
| Impersonation “connected as” (admin) | Support sans mdp client | Metalyde |
| Rate limit + ban user | Abuse login / API | Metalyde BA, kit keys |
| Webhooks inbound + outbound | Sync outils clients | read.ai, GH, Slack, Airtable |
| Email templates (reset, invite, digest) | Lifecycle | Enzo, Metalyde, Spark cron |
| i18n FR (+ EN optionnel) | Clients internationaux | Kit FR/EN ; apps métier FR-only |
| Observabilité requestId + logs structurés | Multi-env | Kit ; Spark partiel |
| Seed multi-persona + demo data | Demos commerciales | Metalyde, Spark, kit |
| Staging outbound kill-switch | Sécurité | Metalyde staging |

### 3.2 Métier vertical — ne pas abstraire dans le kit générique

| Vertical | Features | Source |
|----------|----------|--------|
| Agence performance / créa | Brief créa Meta, médiathèque spotted, budgets MER, brand questionnaire | Metalyde |
| Conseil CIR / C2I | Stepper P1–P11, créances, sync Airtable, valorisations, procédure fiscale | Ether |
| Coaching B2B | Devis/factures Pennylane, frais km, OPCO, GCal | Enzo |
| Delivery Silex | Orgchart React Flow, user journeys, pilotage tickets, multi-app Slack | Spark |

### 3.3 Optionnel “souvent utile plus tard”

- Messagerie temps réel (Ether) vs commentaires async (Spark / Metalyde)
- Sync bidirectionnelle outil legacy (Airtable, Pennylane)
- Génération PDF (Metalyde brief, Ether déclarations)
- Canvas / graph éditable (Spark org + journeys)
- Cron digests (Spark weekly)
- Import meetings IA (read.ai / Leexi)

---

## 4. Implications pour `silex-boilerplate`

### 4.1 Déjà présent dans le kit (ne pas reconstruire)

| Package / démo | Couvre |
|----------------|--------|
| `@gosilex/auth` | Session cookie HMAC + Bearer `sk_` |
| `@gosilex/storage` | R2 put/get/delete |
| `@gosilex/email` | Templates + Mailpit |
| `@gosilex/feedback` | Signalement (aligné Spark) |
| `@gosilex/ui` + design-system route | Shell shadcn Base UI |
| `@gosilex/i18n` | FR/EN |
| `@gosilex/core` + `@gosilex/types` | Errors + requestId envelope |
| example `modules` | Feature flags admin |
| example notes CRUD | Layers routes → services → repos |
| forgot-password route | Amorce lifecycle auth |
| MCP `ping` / `whoami` | Surface agent minimale |

### 4.2 Priorités d’ajout kit (recommandé)

Ordre = **réutilisabilité × fréquence × extractabilité** (three-strikes axial).

#### P0 — patterns manquants mais vus partout

| Feature kit | Forme proposée | Preuve terrain |
|-------------|----------------|----------------|
| **RBAC multi-rôle demo** (admin / staff / client) | Demo users + `requireRole` + landing paths | 4 apps |
| **Tenant / resource ownership guards** | Helpers + tests IDOR étendus (seed multi-user) | Metalyde guards, Ether RLS |
| **Audit log package** | `audit_events` + `record(actor, action, entity)` + UI liste admin | Metalyde, Ether |
| **Documents pattern** | Demo files : meta D1 + R2 + signed GET + ACL owner | 4 apps |
| **Invitations + reset password complets** | Token table + React Email + flows web | Ether invites, Metalyde/Enzo reset |
| **Notifications bell (in-app)** | Table notifs + badge + mark-read API | Metalyde, Ether, Spark comments |

#### P1 — accélère tout OS client

| Feature kit | Forme proposée | Preuve |
|-------------|----------------|--------|
| **Onboarding wizard multi-step** | Composant UI + progress state D1 (champs génériques) | Metalyde, Ether |
| **Data table primitives** | Search accent-insensitive + filters + count + reset | Ether “13 tableaux”, tous |
| **Comments thread générique** | `entityType` + `entityId` + author + seen | Metalyde tasks, Spark, Ether |
| **Tasks / kanban minimal** | Colonnes + drag + assignee (**demo only**) | Metalyde, Spark |
| **Module flags par tenant** | Extension `modules` → scope `orgId` / `clientId` | Spark `Section` |
| **Impersonation** | Session flag `actingAs` + audit + banner UI | Metalyde connected-as |
| **Same-origin / CSRF guard** | Middleware Hono réutilisable | Metalyde report |
| **Webhook skeleton** | Verify signature + idempotency table | GH Spark, read.ai Metalyde |
| **Admin users CRUD demo** | Liste / create / ban / role | Spark admin, Metalyde leads |

#### P2 — utile mais secondaire pour le kit A

| Feature | Note |
|---------|------|
| Cron / scheduled Worker | Digests Spark |
| Export PDF stub | Vertical-heavy |
| Realtime (DO / WebSocket) | Ether only for now |
| Better Auth adapter full | Kit = HMAC/`sk_` volontairement ; BA = Chemin **B** (`intern-silex-app-architecture-boilerplate`) |
| Helpers copy FR-only product | Apps B restent FR ; kit garde FR/EN |

### 4.3 À ne **pas** mettre dans le boilerplate

- Brief créa / Meta Ads / Looker embeds  
- Airtable dual-sync / CIR / créances  
- Pennylane / OPCO / frais km  
- React Flow orgchart / user-journey métier Silex  
- Contenu seed Ulysse / LGU  
- Toute string “Metalyde / Ether / Enzo” dans `packages/*`

### 4.4 Gap stratégique

Les 4 apps métier sont surtout **Chemin B (Next)**. Le kit **Chemin A** n’est pas un drop-in pour Metalyde/Enzo/Spark : il accélère les **prochains SaaS Cloudflare** (ex. `silex-share`).

Pour industrialiser le pattern **Next clients** (Metalyde / Enzo), la source de vérité reste plutôt :

- `intern-silex-app-architecture-boilerplate` (Chemin B seed)
- et les extractions **platform** validées dans ce kit A quand le runtime cible est Workers.

Ne pas fusionner B → A sans axe package clair.

---

## 5. Synthèse

```
COMMUN (noyau OS multi-rôle)
  Auth · RBAC · tenant isolation · docs privés · listes filtrées
  · workflow/statuts · notifs · onboarding · admin users
  · audit · comments · feedback Spark · email lifecycle

DEMAIN (autre app)
  Même noyau + flags modules + M2M keys + webhooks
  + (option) kanban + roadmap + impersonation + digests

BOILERPLATE (Chemin A)
  Déjà: dual auth, R2, email, feedback, modules, i18n, UI, MCP, errors
  Manque utile (P0→P1): RBAC riche, audit, documents+ACL, invites/reset,
                notifications, wizard, tables, comments, tasks demo,
                tenant-scoped modules, impersonation, webhook skeleton
```

---

## 6. Next possibles (hors scope de cette note)

1. ADR “features kit P0” sous `docs/architecture/adr/` (promotions package candidates).  
2. Matrice ligne-à-ligne Metalyde module → package kit / app demo.  
3. Plan d’extraction P0 : `audit` + `documents` (+ guards tenant) avec example consommant.  
4. Note sœur Chemin B : alignement `intern-silex-app-architecture-boilerplate` vs Metalyde/Enzo.

---

## 7. Références locales

| Chemin | Usage |
|--------|--------|
| `~/projects/gosilex/extern-client-metalyde/OVERVIEW.md` | SSoT produit Metalyde |
| `~/projects/gosilex/extern-client-metalyde/ARCHITECTURE.md` | Couches + storage |
| `~/projects/gosilex/extern-client-enzo-os/AGENTS.md` | Stack Enzo archivé |
| `~/projects/gosilex/spark/README.md` + `ARCHITECTURE.md` | Produit + auth viewer |
| `~/projects/gosilex/spark/packages/spark-feedback/` | SDK Signaler multi-apps |
| `~/projects/gosilex/silex-hub/05_PIPELINE/03_Ether/handover/Ether_OS_Rendu_Sprint_1.md` | Features Ether Sprint 1 |
| `~/projects/gosilex/silex-boilerplate/artifacts/goals/001-chemin-a-boilerplate-goal.md` | Scope kit A figé |
| `~/projects/gosilex/silex-boilerplate/docs/architecture/adr/0001-primary-axis-packages-compose-apps.md` | Axe axial |
