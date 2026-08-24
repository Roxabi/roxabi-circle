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

`config.json` = kit / zero-edit. Produit n'y touche pas.

`loadSemanticModel` refuse les `duplicateIds`. Recopier un id `*.kit.*` côté produit casse le load.

## Quand ça trigger

| Surface | Quand | Effet |
|---|---|---|
| Lefthook pre-commit / pre-push | jamais | semctx n'est **pas** dans `lefthook.yml` |
| `validate:full` | jamais | semctx n'est **pas** dans le gate |
| Plugin `PreToolUse` (Bash) | chaque `git commit` / `git push` via le terminal de l'agent | **advisory** ici : pas de `.semctx/guard.json`. Bloque seulement si `{ "enabled": true }` et pas de `verify diff --record` à jour |
| CI `.github/workflows/semctx.yml` | PR non-draft vers `main`/`staging` (`opened` / `synchronize` / `reopened` / `ready_for_review`) | `verify diff --fail-on block` |

`SEMCTX_GUARD=off` désactive le hook plugin même si `guard.json` est on.

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

Denylist dans `.gitignore` : ignorer seulement `semctx.db`, `working/`, `context-packs/`, `verification-state.json`. Authoré = tracké (`config.json` + `semantic/**`).

`semctx_setup confirm:true` (0.1.17) **réécrit** `.gitignore` avec l'allowlist plugin (`.semctx/*` + `!.semctx/semantic/` …). Restaurer la denylist, ne pas commiter l'allowlist. Le `STALE` / `WORKING_DIFF_MISMATCH` qui suit est attendu.
