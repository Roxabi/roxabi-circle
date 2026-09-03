# semctx — kit delta

Workflow générique = plugin (`semctx-verify`, `semctx-semantic`, `semctx-control`).
Ce fichier porte uniquement ce que le plugin ne peut pas savoir.

## Plane B — polarité kit / produit

Les 6 fichiers plats `.semctx/semantic/{goals,invariants,decisions,assumptions,unknowns,evidence}.sem` sont **partagés**. MCP n'écrit que `changes/<id>.sem`. `semctx format --write` canonicalise et **drop les commentaires** — la polarité ne vit pas dans les headers `.sem`.

| ids | Owner | Où |
|---|---|---|
| `*.kit.*` | kit | les 6 fichiers plats |
| `*.<product>.*` | produit | **les mêmes** 6 fichiers — ajouter des blocs, ne pas réécrire un bloc `*.kit.*` |
| `change.kit.*` / `change.<product>.*` | chacun le sien | `changes/<id>.sem` (un fichier par id) |

`config.json` = kit / zero-edit. Produit n'y touche pas. `repositoryRoot` y est le chemin absolu de la machine d'auteur (écrit au 1er setup, jamais réécrit). 0.1.17 l'écrase en mémoire au load (`realpath(cwd)`) — un clone n'est pas cassé. Le JSON reste machine-local ; ne pas untrack (include/exclude kit).

`loadSemanticModel` refuse les `duplicateIds`. Recopier un id `*.kit.*` côté produit casse le load.

Ne pas merger un `change.kit.*` avec `status: active`. `.semctx/working/` est
versionné : une branche de travail peut garder `active-change.sem` et les
handoffs. Une PR (job `semctx-working-empty` / `lefthook run pr`) exige le
dossier vide sauf `.gitkeep` — `git ls-tree` du SHA, pas le workdir.
Unknowns durables → `unknowns.sem`. Changes = le travail en cours, pas l'état
de `main`.


## Quand ça trigger

| Surface | Quand | Effet |
|---|---|---|
| Lefthook pre-commit / pre-push | jamais | pas de `verify diff` ; les fichiers `working/` restent poussables |
| Lefthook `pr` | `lefthook run pr` (manuel, avant d'ouvrir une PR) | `git ls-tree` de HEAD : `.semctx/working/` = `.gitkeep` only |
| CI job `semctx-working-empty` | PR non-draft / push `main`\|`staging` | `git ls-tree` du SHA PR (pas le workdir runner) — required par merge-on-green |
| `validate:full` | self-test fixtures | `test:semctx-working-empty` ; pas de `verify diff` ; pas le check live |
| Plugin OMP `tool_call` bash | chaque `git commit` / `git push` via l'outil bash de l'agent | **guarded** : `.semctx/guard.json` `{ "enabled": true }`. Block si pas de `verify diff --record` à jour |
| CI `.github/workflows/semctx.yml` | PR non-draft vers `main`/`staging` (`opened` / `synchronize` / `reopened` / `ready_for_review`) | `verify diff --fail-on block` |

`SEMCTX_GUARD=off` désactive le guard même si `guard.json` est on. `SEMCTX_GUARD=on` le force même sans fichier.

MCP / hooks / skills = plugin OMP (git install). Kit = config seulement (`.semctx/config.json`, `guard.json`, `semantic/**`, `working/.gitkeep`).

```bash
omp plugin install github:MickaelV0/semctx#omp-plugin
omp plugin install github:Roxabi/cocoindex-code#main
```

Restart OMP après install. `/reload-plugins` ne recharge pas les extensions.

## Marqueurs qui arment un `block`

| règle | lit |
|---|---|
| `invariant-needs-test` | arête `constrained_by` (`@invariant`) |
| `critical-contract-needs-test` | tag `critical` \| `security` sur un **export** `interface`/`type` |
| `security-needs-verification` | tag `security` |

| marqueur | arme un `block` ? |
|---|---|
| `@invariant` | oui, tout nœud |
| `@tag security` | oui, tout nœud |
| `@tag critical` | seulement `interface`/`type` exporté — inerte sur une fonction |
| `@capability` · `@contract` · `@risk` · `@boundedContext` | non |

`tested_by` = import **nommé** dans un fichier de test. Transitif (route HTTP, caller) → `inferred` → BLOCK même si exercé.

Annoter seulement un **export** qu'un test importe directement. Module-privé → ADR, pas de marqueur. Un marqueur insatisfiable rend le fichier non-modifiable.

```ts
/** @invariant grant-narrows-only: plan permits may only narrow org grants */
/** @tag security */
```

Priorité : `packages/flows`, `packages/auth`, `packages/storage`.

Ne pas figer un compte ici — le mesurer :

```bash
bun "$SEMCTX_CLI" index 2>&1 | grep -E 'invariant|capability|contract'
```

## semctx ne remplace pas le gate

`bun run validate:full` reste LE gate. semctx répond « qu'est-ce que ce diff met en risque », pas « est-ce que ça build ». Le job PR est un garde-fou ; BLOCK n'existe que sur les surfaces annotées.

## Workspace

Allowlist `.gitignore` (semctx 0.1.17 : le writer n'émet que `.semctx/*` et `!.semctx/semantic/` ; le reste est préservé — `setup` no-op si ces deux lignes sont déjà là) :

```
.semctx/*
!.semctx/semantic/
!.semctx/config.json
!.semctx/working/
!.semctx/guard.json
```

Chaque nouveau fichier authoré sous `.semctx/` = une ligne `!`. Enfants non negés (`semctx.db`, `context-packs/`, `verification-state.json`) restent locaux. `working/` est versionné ; une PR n'y laisse que `.gitkeep`.
