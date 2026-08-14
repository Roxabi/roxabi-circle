# semctx — delta de ce repo

Le workflow générique est **dans le plugin**, ne le recopie pas ici :
`semctx-verify` (PASS/WARN/BLOCK, jamais conclure sur un BLOCK, jamais inventer de preuve,
mode guarded, commandes CLI) · `semctx-semantic` (change contracts) · `semctx-control`
(trace L0–L6, migrations). Ce fichier ne porte que ce que le plugin ne peut pas savoir.

## Ce que le tier `strict` peut déclencher dépend des marqueurs présents

Les 3 règles `block` lisent des entrées que le code doit fournir :

| règle | lit |
|---|---|
| `invariant-needs-test` | arête `constrained_by` (marqueur `@invariant`) |
| `critical-contract-needs-test` | tag `critical` \| `security` sur un **export** |
| `security-needs-verification` | tag `security` |

Tant qu'aucun marqueur n'existe, aucune de ces règles ne peut se déclencher : BLOCK est
structurellement impossible et **PASS ne signifie rien d'autre que « rien n'était armé »**.
Le tier devient réel à mesure que les marqueurs arrivent.

**Ne fige pas ce compte ici** — mesure-le :

```bash
bun "$SEMCTX_CLI" index 2>&1 | grep -E 'invariant|capability|contract'
grep -rn '@invariant\|@tag' --include='*.ts' apps packages | grep -v '\.test\.'
```

### Quels marqueurs arment réellement une règle bloquante

Mesuré dans la source du plugin (`ts-analyzer/src/analyze.ts`, `context-engine/src/verify-diff.ts`) :

| marqueur | arme un `block` ? |
|---|---|
| `@invariant` | ✅ règle 1, sur **tout** type de nœud |
| `@tag security` | ✅ règle 3, sur **tout** type de nœud |
| `@tag critical` | ⚠️ règle 2 **seulement** sur `interface`/`type` exporté — inerte sur une fonction |
| `@capability` · `@contract` · `@risk` · `@boundedContext` | ❌ aucune règle ne les lit |

Attention au nom : les règles qui parlent de « contrat » testent `kind === "interface" | "type"`
et `exported`, elles ne lisent **jamais** le marqueur `@contract`.

## Où poser un marqueur — la contrainte qui rend le gate tenable

`tested_by` ne se dérive que d'un **import nommé dans un fichier de test**. Un symbole exercé
seulement de façon transitive (via une route HTTP, via une fonction appelante) n'a pas d'arête,
donc son invariant reste `inferred` et fait **BLOCK** même s'il est correctement testé.

Règle : **on n'annote que ce qu'un test peut cibler.**

| Symbole | Marqueur |
|---|---|
| **exporté**, avec un test qui l'importe directement | ✅ pose l'`@invariant` |
| **module-privé**, exercé par intégration | ❌ pas de marqueur — l'invariant vit dans l'ADR |

Ne pose pas de marqueur en exportant un symbole privé « pour que l'outil le voie » : c'est
déformer le code pour l'outil, et ça élargit une surface publique sans raison de conception.

Deux raisons, la seconde étant la plus forte :

1. un marqueur qui affirme plus qu'il ne peut étayer est pire que pas de marqueur ;
2. **un marqueur insatisfiable rend le fichier non modifiable** — si `tested_by` ne peut jamais
   exister pour ce symbole, la règle se déclenche à chaque édition future sans aucun moyen de la
   satisfaire. Elle pousse alors à exporter du privé, ou à retirer un marqueur pendant qu'un gate
   est rouge : décider sous pression.

Pas de fausse assertion, **et** pas d'obligation insatisfiable.

Pour armer, annote le code (`ts-analyzer/src/markers.ts` amont) :

```ts
/** @invariant grant-narrows-only: plan permits may only narrow org grants */
/** @tag security */
```

Priorité aux surfaces d'AGENTS.md § Invariants : `packages/flows` (grants ∩ permits, runner
sur snapshot immuable), `packages/auth`, `packages/storage`.

## semctx ne remplace pas le gate

`bun run validate:full` reste LE gate (pre-push local primaire, job CI `validate-full`).
semctx répond « qu'est-ce que ce diff met en risque », pas « est-ce que ça build ».
Le job PR `Semctx` est un garde-fou : il ne devient un signal réel que sur les surfaces
effectivement annotées.

## Workspace

`.semctx/` suit une **denylist** : seul l'état généré est ignoré (`semctx.db`, `working/`,
`context-packs/`, `verification-state.json`). Tout ce qui est *authored* se commit — `config.json`
(règles bloquantes) et `semantic/*.sem` (plan autorisé). Une allowlist ici est un piège :
`.semctx/*` plus une négation laisse tomber en silence ce que le prochain contributeur ajoute.

Contrepartie à connaître : un futur répertoire **généré** par semctx serait trackable par défaut
et aucun gate ne rattraperait le commit — l'ajouter à la denylist au moment où il apparaît.

`semctx_index_health` en `UNSEALED`/`STALE` → `semctx_setup` avec `confirm: true`
(idempotent, ne touche pas aux `.sem`). `DIRTY_KNOWN` = arbre sale, normal, non bloquant.
