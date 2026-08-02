---
title: Runbook — Fork boilerplate Silex → première issue shippée
date: 2026-08-02
status: living
sources:
  - Claap Mickael × Arman 2026-07-29 (3ust1M1Nk91G + eFiVYqtrtsDl)
  - go-silex/silex-boilerplate docs/playbooks/start-product.md
  - go-silex/silex-boilerplate AGENTS.md + product-consumer-contract
  - plugins: dev-core (frame/plan/implement/dev), silex-spark (spark-tickets)
audience:
  - Arman (builder product)
  - Mickael (kit owner / prod gate)
  - agents Claude Code / Grok dans le repo produit
example_product: silex-academy (go-silex/silex-academy)
kit: go-silex/silex-boilerplate (Chemin A — Cloudflare)
---

# RUNBOOK — Du boilerplate vierge à la première issue développée

> **Kit home:** this file lives in `silex-boilerplate` as the product-builder playbook (first brick after [`start-product.md`](./start-product.md)).  
> **Vault mirror:** `silex-hub/06_MEETINGS/0_Founders/2026-07-29_Mickael_x_Arman_Spark_Academy/` (transcripts + extraction — not in this repo).


> **Objectif** : qu’un builder (humain + Claude Code) puisse **rejouer seul** le flow enseigné le 29/07/2026, sans retenir 3 h de call.
>
> **Principe** : le boilerplate est un **kit qualité** (hooks, packages, exemples). Le **métier** vit dans un **repo produit** qui tire le kit en `upstream` **fetch-only**. On ne code pas le métier dans le kit. On ne push jamais sur le kit depuis le produit.

---

## 0. Carte mentale (1 page)

```
┌─────────────────────────────────────────────────────────────────┐
│  A. INTENTION PRODUIT (humain)                                   │
│     persona · auth/org · modules · priorités · non-goals         │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  B. REPO PRODUIT = fork logique du kit                           │
│     origin = product · upstream = silex-boilerplate (no_push)    │
│     bun install · zero-edit · validate kit bar                   │
│     plugins projet · Spark setup                                 │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  C. CADRAGE MÉTIER (agent + humain)                              │
│     concepts master data · architecture · épiques · roadmap      │
│     projet Spark · tickets Pilotage                              │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  D. EXÉCUTION ISSUE PAR ISSUE                                    │
│     ticket Spark → issue GitHub #N → /dev | /implement           │
│     tier F-lite | F-full · frame → plan → code → QG · PR        │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  E. DÉPLOIEMENT + GOUVERNANCE                                    │
│     CF setup · secrets · prod gate (Mickael) · sync upstream     │
└─────────────────────────────────────────────────────────────────┘
```

### Deux barres qualité (ne pas confondre)

| Barre | Commande | Prouve |
|-------|----------|--------|
| **Kit bar** | `bun run validate:full` | packages + `example-*` + banlist / zero-edit / extract |
| **Product bar** | `scripts/product/validate.sh` (à câbler) | **tes** `apps/<product>-*` |

`validate:full` vert **≠** ton app métier est prête.

### Chemin A vs B

| | Chemin A (ce runbook) | Chemin B |
|--|----------------------|----------|
| Kit | `go-silex/silex-boilerplate` | `silex-architecture-boilerplate` (Next…) |
| Runtime | Workers · D1 · R2 · Hono · TanStack SPA | Next + autre stack |
| Package manager | **Bun** | npm/node typique |

---

## 1. Prérequis machine

### 1.1 Outils

| Outil | Check |
|-------|--------|
| Bun ≥ version kit (`packageManager` dans `package.json`) | `bun --version` |
| Git + SSH GitHub | `gh auth status` |
| Docker (Mailpit local email) | `docker compose version` |
| Claude Code (ou agent équivalent) | plugins marketplace OK |
| `wrangler` (plus tard deploy) | via bun filter / global |

### 1.2 Accès

| Accès | Pourquoi |
|-------|----------|
| Org GitHub `go-silex` (ou org étrangère + App CI) | repo product + kit private |
| Spark (`spu_` PAT) | tickets / projets / github-link |
| Config : `~/.config/silex/spark.env` ou skill `spark-setup` | CLI spark-tickets |
| Cloudflare account (deploy) | Workers / D1 / R2 |
| Vaultwarden / secrets CI App si merge-on-green | `CI_APP_ID` + PEM |

### 1.3 Plugins Claude **minimum** (niveau projet produit)

Référence kit (`.claude/settings.json` boilerplate / academy) :

| Plugin | Rôle |
|--------|------|
| `dev-core@roxabi-marketplace` | `/frame` `/spec` `/plan` `/implement` `/dev` `/pr` `/validate` |
| `dev-init@roxabi-marketplace` | bootstrap projet si besoin |
| `cocoindex-code@cocoindex-code` | index code sémantique |
| `typescript-lsp@…` | LSP |
| `forge@roxabi-forge` | docs/visuels si besoin |
| **`silex-spark@spark`** | **Spark Ticket / projets / github-create** (à installer si absent) |

Marketplaces typiques : `roxabi-marketplace`, `roxabi-live-marketplace`, `cocoindex-code`, `spark`.

**Règle call 29/07** : plugins au **niveau projet** (pas seulement user Mickael). Au fork, ils doivent être **enabled + installés**, pas seulement listés dans le JSON.

---

## 2. Phase A — Intention produit (avant le git)

> « Repo vierge de métier. Premier job = planifier quoi faire et dans quel ordre. »

### 2.1 Brief minimum (à écrire dans `docs/product/` dès le jour 1)

Créer `docs/product/BRIEF.md` (ou coller dans l’issue #0) :

```markdown
# Brief — <Product>

## Problème (1–3 phrases)
…

## Persona / qui se connecte
- Élève / admin / staff ?
- 1 user solo ou organisation multi-users ?

## Auth
- Magic link et/ou password ? (kit : les deux possibles)
- Org créée à l’inscription ou plus tard (invites) ?

## Modules V1 (priorisés)
1. …
2. …
3. …

## Non-goals V1
- …

## Master data (concepts)
- Resource = …
- Formation / Bundle = …
- Org / Membership = …

## Paiement (si applicable)
- Stripe lien + grant manuel V1 ? sync auto plus tard ?

## Contenu
- Source MD ? vault path ? embeds YouTube ?

## Success V1
- …
```

### 2.2 Arbitrages produits issus du call Academy (exemple)

| Sujet | Décision type call / PRD |
|-------|---------------------------|
| Priorité | **Formation payante d’abord**, lead magnet ensuite |
| Contenu | 1 leçon = **1 fichier MD** ; checklist = MD asset |
| Progression | localStorage OK en V1 |
| Paywall | lien Stripe + **grant admin manuel** |
| Multi-tenant | org + users si partage d’équipe |
| Tracking temps passé | roadmap, pas P0 |
| Copy-page → LLM | feature utile V1/V1.1 |

### 2.3 Prompt agent — valider le découpage (avant code)

```text
Tu es lead product+tech sur un fork du kit Silex (Chemin A, Cloudflare).
Voici mon brief: @docs/product/BRIEF.md

1. Reformule problème, persona, auth, non-goals.
2. Propose un découpage en ÉPIQUES ordonnées (E0 fondations kit/product shell,
   E1 auth/org, E2 domaine cœur, …).
3. Pour chaque épique: dépendances, impact modèle de données (oui/non/quoi),
   risque, taille S | F-lite | F-full.
4. Signale ce qui manque dans le brief (persona, multi-tenant, ACL…).
5. Ne génère PAS de code. Sortie: tableau + liste ordonnée seulement.
```

---

## 3. Phase B — Créer le repo produit (fork logique)

### 3.1 Créer le dépôt GitHub vide

```bash
# Exemple org go-silex
gh repo create go-silex/<product> --private --description "Product on Silex kit"
```

Convention naming (call) :

| Type | Pattern | Exemple |
|------|---------|---------|
| Interne Silex | `silex-<name>` | `silex-academy` |
| Client | `extern-client-<slug>` | `extern-client-metalyde` |
| Outil / lead magnet | `tools-…` / simple nom | à archiver si mort |

### 3.2 Cloner + brancher le kit en upstream

SSoT : `silex-boilerplate/docs/playbooks/start-product.md`

```bash
git clone git@github.com:go-silex/<product>.git
cd <product>

git remote add upstream git@github.com:go-silex/silex-boilerplate.git
git remote set-url --push upstream no_push   # CRITICAL — fetch only

git fetch upstream
git checkout -b main upstream/main           # ou merge dans main existante

bun install
```

**Vérif remotes :**

```bash
git remote -v
# origin    …/<product>.git  (fetch + push)
# upstream  …/silex-boilerplate.git (fetch)
# upstream  no_push (push)
```

**Interdit :**

```bash
git push upstream          # NON
LEFTHOOK=0 git push upstream  # NON (contournement = dette process)
```

Lefthook pre-push du kit exécute `scripts/deny-upstream-push.sh`.

### 3.3 Pin kit baseline

```bash
mkdir -p docs/product
git rev-parse upstream/main | tr -d '\n' > docs/product/kit-baseline
git add docs/product/kit-baseline
git commit -m "chore(product): pin kit baseline + bootstrap"
git push -u origin main
```

### 3.4 Install local + smoke kit (example apps)

```bash
bun install

# Kit quality bar
bun run lint
bun run typecheck
bun run test
# ou:
bun run validate          # lint + typecheck + test + banlist + extract + zero-edit + env:check
# barre complète (plus long):
bun run validate:full
```

**API example locale :**

```bash
cp apps/example-api/.dev.vars.example apps/example-api/.dev.vars
# éditer secrets locaux si besoin — ENVIRONMENT=development pour fallback session

bun run db:migrate
bun run db:seed

# terminal 1
cd apps/example-api && bun run dev
# → http://127.0.0.1:8787/health

# terminal 2
cd apps/example-web && bun run dev
# → http://127.0.0.1:5173

# email catcher
docker compose up -d mailpit
# → http://127.0.0.1:8025
```

Comptes seed (kit) : voir README kit (`demo@gosilex.local`, etc.).

### 3.5 Architecture produit (compose, ne pas copier le kit)

| Faire | Ne pas faire |
|-------|----------------|
| Créer `apps/<product>-api`, `apps/<product>-web` | Éditer `packages/*` pour le métier |
| **Composer** `@gosilex/auth`, `db`, `ui`, … | Copier AppError / auth dans l’app |
| `docs/product/*` | Patcher `lefthook.yml` / CI kit |
| Tokens CSS + wrap `@gosilex/ui` | Dual-edit permanent `example-*` |

**Last resort** (pas le happy path) :

```bash
cp -R apps/example-api apps/<product>-api
cp -R apps/example-web apps/<product>-web
# puis strip: package names, wrangler names, D1/R2 ids, seed demo, strings example
```

Axis (ADR-0001) : un 2ᵉ produit = **nouvelles apps**, pas `packages/<product>-*`.

### 3.6 CI App (jour 0 si merge-on-green)

```bash
REPO=go-silex/<product>
APP_ID=4297393   # SSoT gosilex-ci — vérifier docs/gosilex-ci-app-setup.md
PEM=~/.roxabi/secrets/gosilex-ci.private-key.pem

gh variable set CI_APP_ID -R "$REPO" --body "$APP_ID"
gh secret set CI_APP_PRIVATE_KEY -R "$REPO" < "$PEM"
```

Sans ça : merge-on-green en **evaluate-only** (OK, merge humain).

### 3.7 Product validate (quand apps product existent)

```bash
# Copier templates kit (ne pas dual-edit les workflows kit)
cp docs/templates/product-validate.example.sh scripts/product/validate.sh
cp docs/templates/product-ci.example.yml .github/workflows/product-ci.yml
# remplacer <product>
bash scripts/product/validate.sh
```

### 3.8 Checklist fin Phase B

- [ ] `upstream` fetch-only (`no_push`)
- [ ] `docs/product/kit-baseline` présent
- [ ] `bun run zero-edit` vert
- [ ] `bun run validate` ou `validate:full` vert (kit bar)
- [ ] example-api + example-web bootent en local
- [ ] Brief dans `docs/product/`
- [ ] CI_APP_* si besoin merge-on-green
- [ ] **Aucun** commit de secrets

---

## 4. Phase B′ — Plugins & agent tooling (critique)

### 4.1 Vérifier le niveau projet

```bash
ls -la .claude/
cat .claude/settings.json   # enabledPlugins + extraKnownMarketplaces
cat CLAUDE.md               # doit @-include stack + AGENTS, rester MINCE
```

**Principe call** : CLAUDE.md trop gros = mauvais. Stack figée → `docs/` ou `AGENTS.md` ; CLAUDE pointe seulement.

### 4.2 Dans Claude Code

1. Ouvrir le **repo produit** (cwd = product root).
2. `/plugins` → vérifier enabled :
   - dev-core
   - cocoindex-code
   - silex-spark (sinon installer marketplace spark)
3. Si listés mais non installés → installer / autoriser popups (ne pas tout refuser).
4. Reload plugins si besoin (ne répare pas un plugin absent du marketplace).
5. Marketplace **Roxabi** / **spark** : confirmer présence.

### 4.3 Spark CLI

```bash
# Si pas de clé:
# → skill spark-setup

# Smoke:
# (via skill spark-tickets — script sous CLAUDE_PLUGIN_ROOT)
bash "$CLAUDE_PLUGIN_ROOT/skills/spark-tickets/scripts/spark.sh" meta
bash "$CLAUDE_PLUGIN_ROOT/skills/spark-tickets/scripts/spark.sh" projects list silex --kind development
```

### 4.4 CocoaIndex (si activé)

```bash
# Après install plugin cocoindex-code
# indexer le repo pour search sémantique (ccc / MCP)
```

Si erreurs TS/index/frontend « invisibles » au fork : **bug kit** → ticket Mickael sur `silex-boilerplate`, ne pas patcher les plugins en silence dans le product.

### 4.5 Prompt agent — diagnostic plugins

```text
Dans ce repo produit:
1. Lis .claude/settings.json et CLAUDE.md
2. Dis quels plugins sont enabled vs manquants pour le flow:
   dev-core, spark, cocoindex
3. Propose les commandes d'install exactes
4. Ne modifie rien sans mon OK
```

---

## 5. Phase C — Cadrage métier + Spark

### 5.1 Créer le projet Spark (Pilotage)

Client typique interne : **`silex`**.

```bash
SCRIPT="${CLAUDE_PLUGIN_ROOT}/skills/spark-tickets/scripts/spark.sh"

# Créer projet development
bash "$SCRIPT" projects create silex "SILEX Academy" development

# Lister
bash "$SCRIPT" projects list silex --kind development
```

Ou via agent : *« Spark Ticket / create project SILEX Academy on client silex »*.

**Naming** : éviter doublons type `site` / `site SILEX` — mutualiser. Renommer si moche.

### 5.2 Architecture & master data (avant tickets atomiques)

#### Prompt — concepts (Resource / Formation / …)

```text
Brief: @docs/product/BRIEF.md
Stack: kit Silex Chemin A (compose packages, multi-tenant opt-in).

Produis un document docs/product/MASTER-DATA.md :
- Objets (Resource, Formation/Bundle, Org, Membership, Enrollment, Lesson…)
- Relations
- Ce qui est org-scoped vs user-scoped vs global
- ACL V1 (qui lit quoi)
- Ce qui est volontairement OUT de V1

Pas de code. Pas de schéma SQL encore sauf esquisse si indispensable.
```

#### Prompt — architecture

```text
À partir de MASTER-DATA + BRIEF:
1. Diagramme mermaid (apps, packages kit utilisés, D1, R2, auth)
2. User journeys principaux (élève, admin)
3. Découpage épiques E0…En avec ordre et parallélisme possible
Écris docs/product/ARCHITECTURE.md
```

En Spark : section Journeys / onglet type **Architecture** (ex-User Journey) si utile pour monstration.

### 5.3 Épiques → tickets Spark

#### Prompt agent

```text
Lis docs/product/BRIEF.md ARCHITECTURE.md MASTER-DATA.md
Crée dans Spark (client silex, projet "<Nom>") une séquence de tickets INTERNE
(défaut internal) :
- 1 ticket par épique ou sous-lot shippable
- title clair, body = contexte + DoD + dépendances
- marque onRoadmap les items séquencés V1
Utilise spark-tickets CLI. Résume refs créées.
```

#### CLI manuel (exemple)

```bash
bash "$SCRIPT" tickets create silex \
  "E0 — Product shell compose kit (api+web)" \
  "DoD: apps/<product>-* bootent; zero-edit green; pas de métier formation encore" \
  --internal

bash "$SCRIPT" tickets create silex \
  "E1 — Auth + org + invite + admin seed" \
  "…" --internal

# Lier parent/enfant si besoin
bash "$SCRIPT" links add silex <childRef> parent <parentRef>

# Roadmap filter later:
bash "$SCRIPT" tickets search silex --project "SILEX Academy" --onRoadmap
```

**Règle visibilité** : tickets de build agent = **internal** (défaut). `--public` seulement si visible client.

### 5.4 Ce que le kit apporte déjà (ne pas reconstruire)

Opt-in multi-tenant (ADR-0003) — composer si besoin :

| Module kit | Quand |
|------------|--------|
| Better Auth sessions + cookies | users navigateur |
| Org / RBAC / invites | multi-tenant |
| Admin seed / demo users | dev local |
| Email transports (log/smtp/cf) | mails lifecycle |
| `@gosilex/feedback` | Signaler → Spark |
| MCP kit | tools machine |

Call 29/07 : **admin seed / invite / sessions** devraient migrer vers **kit de base** si encore incomplets — sinon ticket kit, pas reinvent dans product.

---

## 6. Phase D — De l’épique à la première issue GitHub

### 6.1 Choisir la première issue (règle d’or)

La **première** issue doit :

1. **Débloquer le shell produit** (apps product boot) **ou** une fondation auth minimale — pas la feature sexy du milieu du backlog.
2. Avoir un **DoD testable** en local.
3. Être **F-lite** si possible (pas F-full analyse de tout le monorepo).

Exemples bons E0 :

- Scaffold `apps/academy-api` + `apps/academy-web` qui composent le kit et `/health` vert
- Rename/strip example → product shell **sans** dual-edit packages

Exemples mauvais en #1 :

- Paywall Stripe complet
- Player formation + checklist + admin grants d’un coup

### 6.2 Créer l’issue GitHub **avec le contexte complet**

L’issue doit pouvoir **relancer une session froide** :

```markdown
## Contexte
Lien brief / archi / ticket Spark #…

## Problème
…

## Scope
- IN: …
- OUT: …

## DoD
- [ ] …
- [ ] `bun run …` vert
- [ ] zero-edit vert

## Notes agent
- Composer @gosilex/* — ne pas éditer packages/*
- Tier suggéré: F-lite
```

```bash
gh issue create --title "E0: product shell academy-api/web" --body-file /tmp/issue.md
# note le numéro N
```

### 6.3 Lier Spark ↔ GitHub

```bash
# Depuis ticket Spark (cuid):
bash "$SCRIPT" tickets github-create <ticketCuid>
# ou lier existante:
bash "$SCRIPT" tickets github-link <ticketCuid> "#N"
bash "$SCRIPT" tickets github-list <ticketCuid>
```

Si le plugin rate (« Issue introuvable ») : **création manuelle + link** — vu en live, OK.

### 6.4 Pipeline dev-core (canonique)

```
/frame --issue N     → artifacts/frames/N-*-frame.md (status approved)
/spec  --issue N     → artifacts/specs/…   (si besoin)
/plan  --issue N     → artifacts/plans/N-*-plan.md
/implement --issue N → worktree + code + QG
# ou monolithe:
/dev --issue N       → enchaîne le pipeline
/pr                  → PR (prod gate si besoin)
```

**Tiers (frame/implement) :**

| Tier | Quand | Comportement |
|------|--------|--------------|
| **S** | trivial | plan allégé |
| **F-lite** / **F-light** | petite feature (défaut call) | phases allégées, moins d’analyse |
| **F-full** | large / transversal | analyse plus profonde |

Quand l’agent demande le size : **préfère F-lite** sauf fondations transverses.

### 6.5 Prompts de secours (sans `/dev` magique)

Si tu pilotes l’agent à la main :

```text
Issue GitHub #$N (lis avec gh issue view $N).
Contexte product: @docs/product/

1. /frame mental: problème, contraintes, tier F-lite, DoD
2. Plan court en artifacts/plans/$N-….md (tâches ordonnées)
3. Implémente test-first dans apps/<product>-* seulement
4. Interdit: modifier packages/*, lefthook, workflows kit, example-* métier
5. QG: bun run lint && bun run typecheck && bun run test && bun run zero-edit
6. Résume diff + comment tester localement
```

### 6.6 Worktrees

Le skill `/implement` utilise des worktrees (`.claude/worktrees/…`).  
Manuel :

```bash
# si script kit présent
bash tools/worktree-setup.sh   # selon dispo repo
# ou git worktree add …
```

### 6.7 Boucle « une issue à la fois »

```
board Spark/GH
   → pick #N
   → /dev N (F-lite)
   → lire artefacts frame/plan (comprendre, pas tout micro-lire)
   → tester local (api+web)
   → /pr
   → review (Mickael si prod / kit touch)
   → merge
   → next issue
```

### 6.8 Parallèle (avancé — call)

Si épiques **indépendantes** (ex. E1 auth shell // E2 content pipeline) :

- 2 sessions Claude / 2 worktrees
- même repo, **issues différentes**
- chacune : « prends l’issue #X du projet, exécute »
- attention conflits merge — séquencer les touches aux mêmes fichiers

---

## 7. Phase E — Après le setup : next steps agent

### 7.1 Prompt post-bootstrap

```text
On vient de finir le setup du repo produit (upstream kit, install, plugins, projet Spark).
1. Lis docs/product/* et la roadmap Spark projet "…"
2. Liste les next steps ordonnés (max 10)
3. Indique ce qui est bloqué par le kit vs product
4. Propose la prochaine issue GitHub exacte (titre + DoD)
```

### 7.2 Maintenir la doc **dans le repo**

| Fichier | Rôle |
|---------|------|
| `docs/product/BRIEF.md` | intention |
| `docs/product/ARCHITECTURE.md` | structure |
| `docs/product/MASTER-DATA.md` | objets |
| `docs/product/kit-baseline` | pin upstream |
| `docs/product/RUNBOOK.md` | lien vers ce runbook ou copie courte |
| `CLAUDE.md` | **mince** : `@AGENTS.md` + stack + **pointer projet Spark** |
| `AGENTS.md` | conventions product (peut étendre kit) |

Suggestion CLAUDE.md product :

```markdown
# CLAUDE.md
@.claude/stack.yml
@AGENTS.md

## Product
- Spark client: silex
- Spark project: SILEX Academy
- Kit upstream: go-silex/silex-boilerplate (fetch-only)
- Never push upstream / never edit packages/* for métier
```

### 7.3 Sync kit (récurrent)

```bash
git fetch upstream
git merge upstream/main
git rev-parse upstream/main | tr -d '\n' > docs/product/kit-baseline
git add docs/product/kit-baseline
git commit -m "chore(kit): merge upstream + refresh baseline"
# never push upstream
```

---

## 8. Phase F — Déploiement Cloudflare (souvent 2ᵉ session)

Pas fait dans le call setup — pattern recommandé :

### 8.1 Prompt second agent

```text
Repo product déjà vert en local.
Fais le setup Cloudflare pour apps/<product>-api (et web si Pages/assets):
- wrangler names UNIQUES (pas example-*)
- D1 + R2 bindings product
- secrets SESSION_SECRET etc via `wrangler secret`
- ENVIRONMENT staging/production explicite — JAMAIS development en public
- CORS origines product only
Documente dans docs/product/DEPLOY.md les commandes et le checklist pre-prod.
Ne touche pas packages/* ni example-* métier.
```

### 8.2 Pre-deploy checklist (kit)

| Check | Règle |
|-------|--------|
| ENVIRONMENT | pas `development`/`test` en public |
| Secrets | CF secrets, pas git |
| CORS | pas `localhost` en staging/prod |
| Auth | cookie session et/ou `sk_` selon modules |
| zero-edit | vert |
| product-validate | vert |

### 8.3 Gouvernance prod (call)

- Build libre sur fork / PR
- **Ce qui part en prod repasse par Mickael** (safe team, discours Axel)
- Kit changes → PR sur `silex-boilerplate`, puis products pull

---

## 9. Patterns de design métier (Academy — rappel opérable)

| Pattern | Règle |
|---------|--------|
| Étape / leçon | **1 fichier Markdown** |
| Checklist | **MD asset** en fin d’étape, pas composant orphelin |
| Resource | objet indépendant, réutilisable |
| Formation | agrégat ordonné de resources / leçons |
| Free vs paid | payant ⇒ free ; free ⇏ payant |
| Progression V1 | localStorage acceptable |
| Copy for LLM | bouton / shortcut copiant leçon + contexte formation |
| Contenu | versionné git, pas CMS V1 |

---

## 10. Troubleshooting (incidents vus en call + kit)

| Symptôme | Cause probable | Fix |
|----------|----------------|-----|
| Plugins « vus » mais cassés | enabled JSON ≠ installés projet | `/plugins`, marketplace, install projet ; fix kit si fork |
| CocoaIndex / TS / Frontend erreurs | kit post-fork | ticket boilerplate Mickael |
| `/dev` « Issue introuvable » | pas d’issue GH ou mauvais repo | `gh issue create` + github-link Spark |
| Agent édite `packages/*` | brief flou | rappeler zero-edit + compose only |
| `zero-edit` rouge | touch kit zones | revert kit paths ; exceptions time-boxed `docs/product/zero-edit-exceptions.json` |
| `git push` bloqué vers upstream | normal | push `origin` only |
| validate:full vert mais app morte | kit bar ≠ product bar | câbler product-validate |
| PRD générique pourri | prompt features-only | re-prompt master data + persona |
| CLAUDE.md énorme | dump stack | déplacer vers docs, CLAUDE mince |
| Doublons Spark projects | naming | mutualiser / archiver |
| Permissions Claude refusées | user deny popups | ré-autoriser install plugins |
| Conflits si 2 devs même fichier | parallèle mal borné | issues disjointes / séquencer |

---

## 11. Checklists opérables

### 11.1 Day-0 bootstrap (copier-coller)

```text
[ ] Brief docs/product/BRIEF.md (persona, auth, modules, non-goals)
[ ] gh repo create + clone
[ ] remote upstream + no_push
[ ] fetch upstream · main depuis kit
[ ] bun install
[ ] docs/product/kit-baseline
[ ] bun run zero-edit && bun run validate
[ ] example-api/web boot (migrate + seed)
[ ] .claude/settings.json plugins OK (dev-core, spark, cocoindex)
[ ] spark-setup / spu_ key OK
[ ] Spark project created (client silex)
[ ] MASTER-DATA + ARCHITECTURE
[ ] Tickets épiques Spark (internal)
[ ] GitHub issue #1 + link Spark
[ ] /dev 1 ou /implement --issue 1 (F-lite)
[ ] QG vert · PR · review
[ ] (later) CI_APP_* · product-validate · Cloudflare
```

### 11.2 Chaque issue suivante

```text
[ ] Ticket Spark à jour (statut, liens)
[ ] Issue GH avec DoD + scope IN/OUT
[ ] github-link si nouveau
[ ] Tier F-lite sauf justification
[ ] Pas de touch packages/* / lefthook / example métier
[ ] Tests + zero-edit
[ ] Doc product mise à jour si concept nouveau
[ ] PR petite, review si prod/kit
```

### 11.3 Avant monstration externe (Axel, client)

```text
[ ] Spark board lisible (épiques, statuts, liens GH)
[ ] 1 parcours live: issue → dev → résultat local
[ ] Schéma gouvernance: build libre / prod gate
[ ] Pas de secrets à l’écran
[ ] Récap ½ page envoyé 5 min avant (style Pierre)
```

---

## 12. Bibliothèque de prompts (quick ref)

### P1 — Fork & bootstrap

```text
Crée/configure ce repo comme product consumer du kit go-silex/silex-boilerplate:
upstream fetch-only, kit-baseline, bun install, validate, zero-edit.
Documente les commandes exécutées dans docs/product/BOOTSTRAP-LOG.md.
Ne code pas de métier.
```

### P2 — Épiques

```text
À partir de docs/product/BRIEF.md, propose épiques ordonnées + tickets Spark
(client silex, projet X), internal, avec DoD. Pas de code.
```

### P3 — Première issue

```text
Crée GitHub issue # pour E0 product shell only. Body complet pour cold start.
Lie au ticket Spark. Puis /frame --issue N puis plan F-lite.
Attends mon OK avant /implement.
```

### P4 — Feature métier

```text
/implement --issue N
Respecte zero-edit. Compose @gosilex/*.
Checklist = MD asset si formation. Org-scoped resources si multi-tenant.
```

### P5 — Deploy

```text
Setup Cloudflare staging pour apps/<product>-*.
Secrets via wrangler secret. Docs dans docs/product/DEPLOY.md.
```

### P6 — Sync kit

```text
fetch+merge upstream/main, refresh kit-baseline, resolve only if product
touched kit paths (should be rare). Summarize kit changelog relevant.
```

---

## 13. Références SSoT

| Doc / outil | Path / URL |
|-------------|------------|
| Playbook start product | `silex-boilerplate/docs/playbooks/start-product.md` |
| Contrat zero-edit | `silex-boilerplate/docs/product-consumer-contract.md` |
| CI App | `silex-boilerplate/docs/gosilex-ci-app-setup.md` |
| Testing / barres | `silex-boilerplate/docs/testing.md` |
| ADR axis | `docs/architecture/adr/0001-…` |
| ADR auth | `docs/architecture/adr/0002-…` |
| ADR multi-tenant | `docs/architecture/adr/0003-…` |
| Agent kit | `silex-boilerplate/AGENTS.md` |
| Example product | `~/projects/gosilex/silex-academy` |
| PRD Academy (hub) | `silex-hub/04_PROJECTS/Spark_Academy_Platform/PRD_V1.md` |
| Transcript call | `./Claap/` |
| Extraction idées | `./2026-07-29 - Idees + Procedure fork boilerplate.md` |
| Spark tickets skill | `silex-spark` → spark-tickets |
| Dev pipeline | dev-core → frame / plan / implement / dev / pr |

---

## 14. Glossaire express

| Terme | Sens |
|-------|------|
| **Kit / boilerplate** | `silex-boilerplate` — pas de métier product |
| **Product repo** | fork logique + `upstream` |
| **Zero-edit** | ne pas modifier les zones kit pour configurer le produit |
| **Compose** | importer `@gosilex/*` dans `apps/<product>-*` |
| **Spark tickets** | Pilotage (≠ board Tâches) |
| **Issue** | GitHub — c’est ce que `/dev` / `/implement` consomme |
| **F-lite / F-full** | taille d’analyse/feature dans dev-core |
| **Frame** | cadrage problème + tier avant plan/code |
| **Prod gate** | review humaine (Mickael) avant prod |

---

## 15. Definition of Done — « première issue shippée »

La première issue est **done** quand **tout** est vrai :

1. Repo product avec `upstream` fetch-only et kit-baseline  
2. Plugins dev-core (+ spark) opérationnels au niveau projet  
3. Au moins un ticket Spark lié à l’issue GitHub `#N`  
4. Code **uniquement** dans zones product autorisées  
5. QG locaux verts (`lint` / `typecheck` / `test` / `zero-edit` minimum)  
6. DoD de l’issue vérifié manuellement (boot local / endpoint / écran)  
7. PR ouverte (ou merge selon policy) avec description claire  
8. `docs/product/` à jour si le shell change l’archi  

---

## 16. Prochaine évolution de ce runbook

À faire quand le flow est rejoué 2–3 fois :

1. Extraire les prompts en **skill** `silex-product-bootstrap`  
2. Aligner les noms exacts des apps Academy (`academy-api` vs …) une fois figés  
3. Ajouter captures d’écran Claude `/plugins` + Spark board  
4. Brancher le fix kit « plugins installés au fork » comme prérequis coché  

---

*Fin du runbook. En cas de doute : **zero-edit**, **compose**, **issue GitHub avant code**, **F-lite par défaut**, **prod gate**. *
