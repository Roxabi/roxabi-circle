---
title: 'Revue adversariale d''architecture — panel 5 lentilles + round operator'
date: 2026-08-08
status: advisory
normative: false
scope: macro (architecture, intention, structure) — pas de revue ligne-à-ligne
commit: 9ee1da2
---

# Revue adversariale d'architecture — Chemin A CF kit

> **Statut : ADVISORY / NON-NORMATIF.**
> Ce document n'est ni un ADR, ni un SSoT, ni un backlog. Il ne remplace pas
> [`platform-proof.md`](../../docs/architecture/platform-proof.md), le
> [contrat consumer](../../docs/product-consumer-contract.md), ni les ADR 0001–0005.
> Par la règle de conflit d'`AGENTS.md`, **JTBD-dev + bar machine + ADR-0001 gagnent**
> sur toute recommandation ci-dessous. Rien ici n'autorise un changement sans issue/ADR.

**Méthode.** 5 agents adversariaux indépendants (produit · architecte · sécurité ·
DX/adoption · complexité-YAGNI), lancés en parallèle sans se voir, mandat = attaquer
avec preuves fichier. Puis **1 round « operator »** (steelman + réfutation, preuves dans
le repo). Puis arbitrage, avec **vérification manuelle** des deux contre-attaques
factuelles décisives. Métriques re-mesurées sur `9ee1da2`.

**Limites assumées.** Revue macro sur un snapshot. Aucun test exécuté, aucun exploit
réellement tenté, pas de revue ligne-à-ligne. Les verdicts sévères ci-dessous sont des
verdicts *adversariaux* : leur rôle est de produire du signal, pas une note finale.

---

## 1. TL;DR

| Lentille | Verdict adversarial | Survit à l'operator ? |
|---|---|---|
| **Produit** | **NON** — framework personnel en costume de plateforme | **Oui** (concédé #1 par l'operator) |
| **Architecte** | **CONDITIONNEL** — squelette sain, 2 paris chers à défaire | **Partiellement** (voir §6) |
| **Sécurité** | **ACCEPTABLE POUR LE STADE** — plan vivant durci ; gouvernance kernel = prose | **Oui** (3 fixes concédés, 2 contenus) |
| **DX / Adoption** | **REPOUSSOIR** — clone-and-study, pas clone-and-go | **Partiellement** (reframe manifeste valide) |
| **Complexité / YAGNI** | **AUTO-PHAGE** — la gouvernance concurrence le produit | **Largement** (théâtre warn-only concédé) |

**Le fil rouge.** L'architecture *logicielle* n'est pas en danger — elle est bonne. Ce qui
est disproportionné, c'est que **l'architecture du discours, du process et des garde-fous
a pris le pas sur la matière livrée**. Pour un kernel dont la valeur se prouve par « un
produit compose et tourne », l'investissement est trop en amont.

**Une seule vraie décision stratégique ouverte** — et elle n'est sortie ni de l'attaque
ni de la défense : voir **§7**.

---

## 2. Baseline mesurée (`9ee1da2`)

Ce n'est pas du vaporware. Stack cohérente et installée, layering réel, ADR référencés
depuis le code.

| Zone | Mesure |
|---|---|
| `apps/*` src (hors tests) | **13 549 LOC** — example-api 6 241 · example-web 7 228 · mcp-example 80 |
| `packages/*` src (hors tests) | **7 391 LOC** — ui 3 824 · flows 1 247 · email 822 · auth 611 · mcp 519 |
| Packages quasi-vides | `config` **0** src · `types` **22** · `db` **24** · `i18n` **26** |
| Méta-tooling (`scripts/` + `tools/`) | **3 795 LOC / 31 fichiers** |
| `validate:full` | **20 étapes** |
| `AGENTS.md` | **882 lignes / 45 742 octets** |
| `docs/*.md` | 2 737 lignes |
| Migrations D1 | 12 (jusqu'à `0012_flows_plans_runs.sql`) |
| Fichiers de test | 52 |

**Ratio contesté.** Méta-tooling / src apps = **28 %**. Si l'on compte aussi la prose
normative + artifacts SDD comme « gouvernance » (≈ 11 000 lignes), on approche **1:1**
avec le produit. Les deux lectures sont défendables ; le désaccord porte sur « la prose
compte-t-elle comme surface de maintenance ». Elle rote, donc partiellement oui.

---

## 3. Convergence des 5 lentilles (= haute confiance)

### 3.1 `@kit/flows` est le point de rupture — attaqué par les 5

- **1 247 LOC**, le 2ᵉ plus gros package, **aucune route ni binding CF Workflows**.
  `flows-dogfood.ts:3` le dit : *« no HTTP route / Workflows yet — #30–#31 »*.
- Migration `0012_flows_plans_runs.sql` crée `flow_plans`/`flow_runs` — **lue par aucun
  repo/service/route**.
- **La gouvernance est du commentaire** : la provenance du grant (invariant #3) est un
  commentaire dans `authority.ts`. Pas de meter runtime (ceilings statiques seulement —
  et `AGENTS.md` le pré-concède : *« static ceilings necessary ≠ sufficient »*). Pas
  d'endpoint HITL. Immutabilité snapshot = « convention » (`runner-view.ts:24`).
- **Il ne consomme pas le kit** : zéro dépendance `@kit/*`, redéfinit ses schémas Zod et
  ses erreurs au lieu de `@kit/core`/`@kit/types` — il viole l'axe « erreurs
  centralisées » du kit lui-même.

### 3.2 L'inversion « kit avant produit »

3 des 5 kill shots pointent cette racine. `platform-proof.md` marque **chaque** barre
plateforme `Not met` ; `product-consumer-dogfood-evidence.md` est un template `(fill)`.
Le kernel est designé contre 0–1 consommateur.

### 3.3 Le couplage par fork (`upstream` + `zero-edit`)

Les packages sont `private` / `0.0.1` / `build: "echo ok"` / exportent du `.ts` brut :
**impubliables en l'état**. Le kit distribue donc de la source que le produit a
interdiction d'éditer → `zero-edit` (~630 LOC) est le *symptôme* du couplage, pas la
cure. Côté consommateur : taxe de merge permanente + `kit-baseline` SHA maintenu à la
main + *« kit green ≠ product tested »* (admis dans le contrat).

### 3.4 Le poids gouvernance/gates dépasse la valeur livrée

Théâtre confirmé : `check-agents-adr-hygiene.sh` fait `exit 0` par défaut,
`check-debt.ts` défaut `warn` — les compter dans « une suite de 20 gates » survend.
Plusieurs gates réinventent de l'off-the-shelf (dependency-cruiser, knip,
license-checker, syncpack).

---

## 4. Round operator — postures

| Cluster | Posture | Arbitrage |
|---|---|---|
| **A. Flows** | Partiellement concède (brandera `ServerMintedGrant`, refuse DELETE) | **½** — faits défensifs vrais (vérifiés §5), fond survit : freeze + brand |
| **B. Inversion produit** | Concède (#1) + reframe « vous relisez mon risk register » | **Attaque survit**, concédée. Le reframe est juste et ne change pas l'action |
| **C. Fork vs versionner** | Reframe : versionner *déplace* le drift dans une matrice de versions | **Les deux ont tort** → §7 |
| **D. Lock-in D1** | Reframe : D1 = la thèse ; seul l'« escape hatch » est du vent → écrire l'ADR | **Tient.** L'attaque a sur-qualifié la thèse de « fuite » |
| **E. Pins bleeding-edge** | Concède churn ; « gates = policy, pas syncpack » | **⅔.** Le job est distinct, ok. La question de valeur (bleeding-edge pour un artefact censé être stable) reste sans réponse |
| **F. Complexité** | Concède le théâtre warn-only ; défend le meta-testing des gates | **Tient largement.** Un gate bash qui peut false-green est pire que pas de gate |
| **G. DX** | Reframe : `AGENTS.md` = contexte *agent*, pas onboarding (README = 3 Ko) | **Split net** : reframe valide, mais piège `LEFTHOOK=0` + cap 300 lignes + exemption en zone protégée **tapent** |
| **H. Sécurité** | Concède H3+H4, reframe H5 + H2 | **Le plus propre** — 3 fixes réels, zéro excuse de phasing |

---

## 5. Vérifications manuelles (arbitrage des désaccords factuels)

Les deux contre-attaques décisives de l'operator ont été vérifiées dans le code. **Les
deux tiennent.**

### 5.1 H5 — « clés à org NULL = IDOR » → **cadrage réfuté**

`apps/example-api/src/middleware/org-context.ts:49-53` rejette les clés non org-bound sur
les routes tenant :

```
// D11 — tenant routes require org-bound keys; no hop across memberships
throw AppError.forbidden('API key must be organization-bound for tenant routes')
```

Une clé legacy (`organization_id NULL`, migration `0008`) obtient donc **zéro accès
org-scoped** — il n'y a rien d'org-scoped à re-vérifier. Le cadrage IDOR ne survit pas.
**Résiduel réel et mince** : la clé reste valide sur les endpoints user-level, et `0008`
disait « must re-mint » sans **révoquer**. → fix étroit, pas une faille de tenancy.

### 5.2 A — « flows : zéro call site, `grant: unknown` bâclé » → **sur-tir**

- `flows-dogfood.ts` mint le grant **côté serveur** : `Not a mint API: do not accept
  client allowedTools` ; grant = `dogfoodFixedGrant(orgId)`.
- `check.ts:106` passe l'`unknown` immédiatement dans `parseCapabilityGrant` (Zod
  `.strict()`) — `unknown` est la *frontière d'entrée*, pas du laxisme.
- `resolveEffectiveAuthority` est **volontairement non exporté** (`index.ts:44` :
  *« intentionally NOT exported (unsafe without pin) »*).
- `freeze.ts` fait un vrai `deepFreeze` récursif.

Le réflexe « supprime / c'est bâclé » a sur-tiré. **Mais le fond YAGNI survit** : 1 247
LOC gouvernent un runner qui n'existe pas.

### 5.3 Observation nouvelle — les `@invariant` : des règles réelles, hors chaîne de gate

Des annotations sémantiques `@capability` / `@tag` / `@invariant` ont été ajoutées sur
`packages/auth/src/keys.ts` et `packages/flows/src/{authority,check,grant,snapshot}.ts`
(+26 lignes de commentaires, zéro logique).

**Constat initial** : aucun gate du repo ne les consomme — `grep` sur `scripts/`,
`tools/`, `.github/workflows/`, `package.json`, `lefthook.yml` → 0 hit.

**Nuance découverte** : `.semctx/config.json` (jusqu'ici gitignoré, désormais tracké)
définit de vraies règles bloquantes qui s'appuient dessus :

| Règle | `when` | Sévérité |
|---|---|---|
| `invariant-needs-test` | `invariant_touched_without_test` | **block** |
| `critical-contract-needs-test` | `critical_contract_changed_without_test` | **block** |
| `security-needs-verification` | `security_surface_without_verification` | **block** |

L'enforcement existe donc, mais **hors de `validate:full` et hors CI** : il vit dans un
outil agent local, dont l'index (`semctx.db`, 7,5 Mo, généré) reste ignoré. Deux
conséquences :

1. **Position réelle** : ces annotations ne sont ni de la simple prose, ni un gate du
   repo — elles sont un **contrat lisible par l'outillage agent**. Le tracking de
   `config.json` les rend au moins *reviewables en PR*.
2. **Le trou de provenance du grant reste ouvert.** `invariant-needs-test` exige un test
   quand un symbole sous invariant bouge ; il **ne rend pas** `checkPlan(grant: unknown)`
   impossible à appeler avec un objet client. Seul un **type nominal**
   (`ServerMintedGrant`, action #6) ferme ça — la reco est inchangée.

> Point de méthode : `config.json` porte aussi `repositoryRoot` en **chemin absolu
> machine-spécifique**, ce qui limite sa portabilité multi-machine. À normaliser si le
> fichier doit servir de SSoT partagé.

---

## 6. Consensus des deux rounds — actions à haute confiance

Validées par **l'attaque ET la défense**. Ordre = celui de l'operator, qui a classé
lui-même.

| # | Action | Cluster | Note |
|---|---|---|---|
| 1 | **Ship un produit interne réel, extraire le kit *de lui*, geler flows** | B | Le #1 de l'operator. Exécuter `platform-proof.md` au lieu de le citer |
| 2 | Détecteur `sk_` custom + scan **historique complet** TruffleHog | H3 | `--only-verified` est structurellement aveugle au format `sk_` maison |
| 3 | Throttle **par compte** (email) en plus du per-IP ; `'local'` fail-closed en prod | H4 | Aujourd'hui : per-IP seul, pas de lockout compte |
| 4 | Deny/révoque les clés `organization_id IS NULL` à l'auth | H5 résiduel | Finir ce que `0008` annonçait |
| 5 | **Split un pre-push rapide** (lint + typecheck + tests affectés) du gate complet | G | Tue l'incitation `LEFTHOOK=0` |
| 6 | **Brander `ServerMintedGrant`** maintenant, pendant que flows est inerte | A | Convertit le commentaire de provenance en type. Fenêtre idéale : rien ne tourne |
| 7 | Surface d'exemption propre aux apps produit, hors zone zero-edit | G | Cap 300 lignes + `tools/file_exemptions.txt` en zone protégée = gate contre build |
| 8 | Promouvoir en fail-mode ou sortir du gate primaire les gates warn-only | F | Pas de théâtre dans le gate primaire |
| 9 | ADR « D1 load-bearing, portabilité = non-goal » **ou** supprimer la phrase escape-hatch | D | Truth-in-labeling, pas un `DbPort` prématuré |
| 10 | `author ≠ labeler` sur `merge-on-green` | H1 | À l'embauche n°2 ; aujourd'hui le label *est* la signature solo |

**Garde-fou explicite sur flows** : ne **pas** câbler #29–#31 par-dessus la gouvernance
inerte actuelle avant d'avoir transformé les invariants #2 (snapshot-only) et #3
(provenance) en types/gates. Sinon la violation sera à une ligne d'écart, et rien ne
deviendra rouge.

---

## 7. La vraie décision ouverte (que ni l'attaque ni la défense n'a posée)

L'architecte dit « versionne les packages ». L'operator répond « versionner déplace le
drift dans une matrice de versions, pire en solo » — **et il a raison**. Mais il défend
`fork git upstream` sans voir que le modèle actuel est **le seul pire que les deux
alternatives** : il paie la douleur de merge de la source partagée **ET** la séparation
de repos.

La question-racine n'est pas « fork vs versionner » mais **qui est le consommateur** :

| Si le consommateur est… | Alors | Conséquence |
|---|---|---|
| **Toi** (contrainte déclarée : « je possède le kit et tous les produits, je les veux quasi-identiques ») | Produits en **`apps/<product>-*` dans ce monorepo** (ADR-0001 prévoit déjà le chemin) | Tout le monde sur HEAD · zéro matrice de versions · zéro taxe de merge · **zero-edit / deny-upstream / consumer-contract / kit-baseline s'évaporent** |
| **Des tiers** (orgs externes) | **Packages versionnés** `@kit/*` | Le fork ne passe pas à l'échelle sociale ; semver devient nécessaire |

Le milieu `git upstream` d'aujourd'hui n'est optimal dans **aucun** des deux mondes.
C'est la décision la plus path-dependent du repo, et elle commande ~630 LOC de gates.

**Reco : trancher ça en ADR-0006 avant tout autre chantier structurel.**

---

## 8. Ce que le panel a eu le plus tort / le plus raison

**Le plus tort** — le cluster A (« zéro call site / supprime le package ») et le
traitement des `Not met` de `platform-proof.md` comme une *découverte*. Flows a un call
site avec grant minté serveur, valide au travers d'une frontière Zod stricte,
deep-freeze ses snapshots, et satisfait « ≥2 sites **ou** ADR » par la branche ADR-0005.
Le panel a lu le risk register de l'operator comme un scoop. Runner-up : le cadrage IDOR
de H5, défait par `org-context.ts:49-53`.

**Le plus raison** — la paire sécurité **H3 + H4** : le scanner est aveugle au format
`sk_` maison *et* à l'historique ; le throttle n'a pas de dimension par compte avec un
bucket `'local'` qui s'effondre hors-CF. Réels, petits, sans excuse de phasing. Et sous
eux, la colonne vertébrale du cluster B : **le kernel a été construit avant qu'un seul
produit ne soit livré**, et le propre doc de preuve l'admet.

---

## 9. Ce qui n'a pas été fait

- Aucun test exécuté, aucun exploit tenté (les scénarios H2/H3/H4 sont raisonnés, pas
  démontrés).
- Pas de revue ligne-à-ligne : `packages/ui` (3 824 LOC) et `example-web` sont
  quasi-intouchés par cette revue.
- Le fond « le cœur SaaS est-il *bon*, pas seulement solide ? » n'est pas tranché : la
  lentille produit le juge commodity, la lentille sécurité en fait la seule partie
  fiable. **Les deux ont raison** — et ça plaide pour l'action #1 : la base est
  suffisamment saine pour porter un vrai produit ; ce qui manque n'est pas plus de
  kernel, c'est un consommateur réel.
