---
title: 'Analyse — livraison du kit : fork/upstream vs packages importés'
date: 2026-08-11
status: analysis (no decision taken)
scope: mécanisme de livraison du kit Chemin A vers les produits
revised: 2026-08-11 — post red-team + correction opérateur (silex-boilerplate = boilerplate dérivé, pas produit)
---

# Fork vs packages — ce que dit le repo (mesuré, pas supposé)

## TL;DR

La prémisse « le fork va nous donner des conflits » est **non vérifiée** aujourd'hui : aucun
produit réel n'a jamais mergé d'upstream avec du code produit dedans. La dérive **observée**
est ailleurs, et publier `@kit/*` sur npm ne la corrigerait pas.

Le vrai trou : **la surface SaaS générique (orgs, RBAC, invites, admin, login/reset/invite-accept,
12 migrations D1) vit dans `apps/example-*`**, zone protégée zero-edit. Un produit ne peut ni la
patcher ni l'importer → il la **recopie**, sous `apps/<product>-*` qui est un préfixe *autorisé*.
Le gate ne voit rien. C'est le canal de dérive silencieux, et il est orthogonal à fork-vs-npm.

---

## 1. Ce qui est mesuré

### Lignée réelle

```text
Roxabi/roxabi-boilerplate-cf   (kit HEAD)
      └─ upstream ─→ go-silex/silex-boilerplate     (boilerplate dérivé)  9 ahead / 75 behind
                          └─ upstream ─→ go-silex/silex-kit-dogfood (produit)  1 ahead / 69 behind
```

**Trois niveaux, pas deux.** `silex-boilerplate` n'est **pas** un produit : c'est un boilerplate
dérivé. Éditer `example-*` et ajouter un package est son métier, pas une violation. Le contrat
consumer ne gouverne que le niveau 3. Le niveau kit↔kit n'a **aucun contrat ni gate**.

Conséquence pour la lecture ci-dessous : les mesures faites sur `silex-boilerplate` disent quelque
chose sur **kit↔kit**, rien sur produit↔kit.

### Le consommateur produit est vide

`silex-kit-dogfood` = **1 commit** au-dessus du kit. Ses « apps produit » :

```text
apps/dogfood-api/README.md
apps/dogfood-api/package.json
apps/dogfood-web/README.md
apps/dogfood-web/package.json
apps/dogfood-web/src/.gitkeep      → 5 fichiers, 0 ligne de code produit
```

`docs/product-consumer-dogfood-evidence.md` : tous les champs sont `(fill)`.

**Conséquence :** le modèle fork n'a jamais été mis sous charge. On n'a **aucune donnée** de
conflit produit↔kit. La prémisse de la question reste à démontrer.

### Kit↔kit : divergence légitime, mais 6 conflits réels et aucun gate

`silex-boilerplate` diff vs `upstream/main` :

| Chemin | Fichiers | Nature |
|---|---|---|
| `packages/feedback` | 18 | **package qui n'existe que chez silex** — capability ajoutée sur l'axe kit |
| `apps/example-api` | 15 | édition d'app kit |
| `apps/example-web` | 10 | édition d'app kit |
| `packages/auth`, `scripts/test-coverage.sh`, `tools/file_exemptions.txt`, `AGENTS.md` | 4 | éditions de chemins kit-owned |

Ces chemins sont `protected_prefixes` **pour un produit**. Pour un boilerplate dérivé, les éditer
est normal. `check-zero-edit-zones.sh` tourne d'ailleurs en mode `kit` ici (pas de
`docs/product/kit-baseline`) → validation de config seulement. Conforme au design, mais :
**la classe « deux kits qui divergent » n'est couverte par aucun gate.**

Le merge réel, aujourd'hui :

```bash
cd ~/projects/gosilex/silex-boilerplate
git merge-tree --write-tree upstream/main HEAD   # exit 1 — 6 CONFLICT (content)
```

```text
apps/example-api/package.json
apps/example-api/src/lib/integration-config.ts
apps/example-api/src/lib/kit-modules.ts
apps/example-api/src/seed/seed-tenancy.ts
apps/example-web/package.json
bun.lock
```

**Lecture correcte :** c'est du kit↔kit (les deux côtés ont ajouté une capability : flows/tasks/
comments d'un côté, feedback de l'autre). Ça ne dit **rien** sur un merge produit↔kit. Ça dit en
revanche où les conflits se logent : **coutures de composition fermées et manifestes**, pas volume
de code. `app.ts`, `org-rbac.test.ts`, `routeTree.tsx`, `app-shell.tsx` ont été touchés des deux
côtés et git les a mergés seul. À vérifier si ça se reproduit produit↔kit — c'est l'hypothèse la
moins chère à tester (`merge-tree`, une commande, zéro setup).

Trace résiduelle dans le kit HEAD : `.claude/stack.yml` déclare `feedback: packages/feedback`,
qui n'existe pas ici (il n'existe que chez silex).

### Les packages sont library-*shaped*, pas library-*built*

14 packages, 11 647 lignes. Tous :

```jsonc
"private": true,
"version": "0.0.1",
"scripts": { "build": "echo ok" },
"exports": { ".": { "types": "./src/index.ts", "import": "./src/index.ts" } }
```

Pas de `publishConfig`, pas de `.npmrc`, pas de registry, pas de changesets, pas de build réel.
`turbo.jsonc` déclare `outputs: ["dist/**"]` mais aucun package ne produit de `dist`.

Point positif vérifié : `scripts/check-import-boundaries.ts` (CP-IMPORT, ADR-0001) **impose
`packages ↛ apps`**. La frontière est donc déjà tenue par une machine. Passer en npm ne
demanderait pas de re-découper : ça demanderait de **construire** (build + d.ts + versioning).

### Le trou : la surface SaaS générique est dans les apps

Ce qu'un produit veut au jour 1, et où ça vit :

| Capability | Où c'est | Statut zero-edit |
|---|---|---|
| `routes/orgs.ts` (320 l.), `admin-users` (129), `me` (102), `invitations`, `modules` | `apps/example-api` | **protégé** |
| `middleware/{better-auth,org-context,require-auth,origin-guard,security-headers}` | `apps/example-api` | **protégé** |
| 12 migrations D1 (better-auth, orgs, RBAC, modules, api-keys, audit) | `apps/example-api/migrations` | **protégé** |
| `login`, `forgot-password`, `reset-password`, `invite-accept`, `org-members`, `keys`, `settings`, `admin/*` | `apps/example-web` (58 fichiers ts/tsx) | **protégé** |

Le contrat dit : *ne pas patcher `example-*`, créer `apps/<product>-*`*. Donc le produit
**recopie** — et la copie atterrit dans un préfixe autorisé (`apps/`), invisible pour `zero-edit`.
On a donc un gate qui bloque la dérive *déclarée* et laisse passer la dérive *par duplication*.

### Migrations : convention déjà tranchée (corrigé)

`packages/{flows,tasks,comments}/migrations/*.sql` portent un en-tête explicite :

```sql
-- SKETCH / REFERENCE ONLY — NOT applied by wrangler.
-- Applied SSoT: apps/example-api/migrations/0012_flows_plans_runs.sql (#29)
-- OUT OF DATE for types: sketch used text timestamps; applied uses integer ms.
```

Le repo a donc **déjà décidé** : package = esquisse non autoritative, app = SSoT appliquée
(même direction qu'ADR-0007). Seuls `packages/auth/migrations/0001,0002` sont de vrais duplicatas
(`diff` = identiques). Surface réelle : **2 fichiers**, pas 4 packages.

Deux raisons pour lesquelles un package ne peut pas posséder le fichier final :

1. `wrangler d1 migrations apply` traque par **nom de fichier** dans `d1_migrations` — on ne
   renumérote pas après application.
2. Les esquisses sont déclarées `OUT OF DATE` : une copie package→app perdrait la FK composite
   `(plan_id, org_id)` de la migration appliquée, donc l'isolation inter-org (invariant #5).

---

## 2. Trois couches, trois verdicts (pas un verdict global)

| Couche | Contenu | npm peut livrer ? | Verdict |
|---|---|---|---|
| **Châssis** | `lefthook.yml`, `.github/workflows/*`, `scripts/` (22 fichiers / 3092 l.), `tooling/`, `config/`, `biome.json`, `turbo.jsonc`, `tsconfig.json`, `AGENTS.md`/`CLAUDE.md` | **Non** — un package npm ne peut pas installer des gates, des hooks et un contexte agent utilement | **Garder git** (fork/merge, ou template + CLI d'update) |
| **Libs pures** | 14 `@kit/*`, 11 647 l., frontière déjà gardée | **Oui, techniquement** | **Pas maintenant** — coût réel : build + d.ts + versioning + changesets ×14, plus la perte du « je corrige kit et produit dans un commit » |
| **Surface SaaS générique** | `apps/example-*` : 1099 l. de routes (dont ~245 de démo pure), 458 l. de middleware, services/repos, 12 migrations, 61 fichiers web (dont 4 gros exemptés qui sont des **démos**, pas des shells produit) | Ni l'un ni l'autre aujourd'hui | **C'est le trou à combler** — mais l'ensemble n'a jamais été partitionné kit-shell vs démo. Ce partage est un exercice de design, pas un déplacement de fichiers. |

---

## 3. Recommandation

**Ne pas basculer en npm maintenant. Ça ne règle pas le problème que tu ressens.**
Ce qui le règle, dans l'ordre :

Ordre : du falsifiable le moins cher au plus cher.

1. **Ouvrir `KitModuleId`** (~40 lignes). `apps/example-api/src/lib/kit-modules.ts` expose une
   union fermée `as const` et `integration-config.ts` un `Record` exhaustif. Un produit qui veut
   son module doit éditer un chemin protégé (violation zero-edit, `expires` obligatoire sur un
   besoin permanent), construire un registre parallèle (fork silencieux), ou abandonner ADR-0003.
   C'est le seul point où un produit est structurellement coincé aujourd'hui.
2. **Convertir les allowlists des gates en découverte** — **prérequis**, pas suivi.
   `scripts/test-coverage.sh` énumère `run_pkg` à la main (`api-client` manque déjà) ;
   `check-env-sync.ts` importe `../apps/example-api/src/env.schema` en dur ;
   `check-banned-strings.sh` et `build:kit` ciblent `example-*` littéralement. Extraire `orgs.ts`
   le sort du floor de `example-api` **sans le mettre ailleurs**, et `validate:full` reste vert.
3. **Une tranche verticale** — `me` + `orgs` + leur middleware, montés par `example-api`, contrat
   d'ordre middleware écrit. Mesurer le `app.ts` résultant et le churn des gates. Ce chiffre
   remplace l'estimation.
4. **Promouvoir la surface générique hors de `example-*`** — si (3) le confirme. Le mount doit
   **vérifier sa table de routes au boot** : Hono résout par ordre d'enregistrement, donc trois
   lignes au-dessus du mount tuent le handler kit et son filtre IDOR `sk_` (`routes/orgs.ts:70`),
   dans un préfixe produit que ni `zero-edit` ni `import-boundary` n'inspectent. Sans cette
   assertion, le mount remplace un fork visible par un shadow invisible.
5. **Migrations** — garder la convention esquisse/appliquée. **Pas** de `kit:migrations sync`
   package→app. Au mieux : assertion à sens unique (« toute table lue par un schéma package
   existe dans l'ensemble appliqué de l'app ») + égalité binaire sur les 2 fichiers `auth`.
6. **Traiter la dérive miroir** — `silex-boilerplate` : 75 commits de retard, `upstream` en push
   au lieu de `no_push`, `mode=kit` donc aucun gate. Trancher : il suit le kit (→ il lui faut un
   gate kit↔kit, et `packages/feedback` remonte), ou il a divergé pour de bon (→ couper le remote).
7. **Le port MetaLyde est le test** — premier vrai produit de la lignée. Le consommateur actuel a
   5 fichiers stub, 0 ligne de code. Tant qu'aucun produit avec du vrai code n'a mergé d'upstream,
   « fork = conflits ? » reste une hypothèse.

**Supprimé de cette reco :** « rendre les packages publishable-shaped sans publier ». Un `dist`
que rien n'importe (exports → `src`, `build: echo ok`, `build:kit` filtre les 2 apps) et qu'aucun
gate ne lit dérive de `src` en silence — le mode de défaillance qu'on cherche à éliminer, introduit
en 14 exemplaires, pour un bénéfice conditionné à une décision qu'on recommande de ne pas prendre.

### Ce qui ferait basculer vers npm

**Le nombre de produits et d'orgs.** 1 produit → le fork gagne sur tous les axes. 3+ produits,
surtout dans des orgs différentes (le contrat prévoit déjà le cas « foreign org » pour les creds CI)
→ npm commence à rentabiliser son coût, et on **retire** au passage beaucoup de machinerie
permanente : `zero-edit`, `kit-baseline`, `ZERO_EDIT_BASE_REF`, le schéma d'exceptions,
`deny-upstream`. La taxe de complexité du modèle fork est déjà payée, mais elle est **récurrente**.

### Contrainte de gouvernance

**ADR-0001 est `axial: true`.** Il dit : *« apps compose packages; they own domain logic and
entrypoints only »*. Deux options l'amendent, pas une seule :

- livraison npm-library (les apps quittent l'arbre) ;
- **et l'étape 4 ci-dessus** — mettre des routers Hono et des middlewares dans `packages/`
  relocalise la couche entrypoint. La direction (vers `packages/`) a l'air conforme ; la
  sémantique de l'axe change.

**Précédent à ne pas inverser sans le dire :** ADR-0007 vient de shipper la forme opposée —
`packages/tasks` = policy pure (`access`, `scope`, `visibility`, `stages`),
`apps/example-api/src/routes/tasks.ts` = adaptateur mince de 139 lignes, migration package =
esquisse. **ADR-0008 avant tout mouvement large.**

---

## 4. Correctifs mineurs constatés au passage

| Fichier | Constat |
|---|---|
| `.claude/stack.yml` | déclare `feedback: packages/feedback` — inexistant dans ce repo |
| `docs/product-consumer-contract.md` | dit que le mode zero-edit s'auto-détecte via l'URL d'origin (« `kit` if origin URL contains `kit` ») ; le script détecte en fait la présence de `docs/product/kit-baseline` |
| `docs/product-consumer-dogfood-evidence.md` | template vide alors que le doc est cité comme « B5 live evidence » dans `AGENTS.md` |
