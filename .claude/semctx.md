# semctx — delta de ce repo

Le workflow générique est **dans le plugin**, ne le recopie pas ici :
`semctx-verify` (PASS/WARN/BLOCK, jamais conclure sur un BLOCK, jamais inventer de preuve,
mode guarded, commandes CLI) · `semctx-semantic` (change contracts) · `semctx-control`
(trace L0–L6, migrations). Ce fichier ne porte que ce que le plugin ne peut pas savoir.

## Le tier `block` est inerte ici — un « pas de BLOCK » ne prouve rien

Les 3 règles `block` lisent des entrées qui sont vides dans ce repo :

| règle | lit | état (2026-08-08) |
|---|---|---|
| `invariant-needs-test` | arête `constrained_by` | 0 |
| `critical-contract-needs-test` | tag `critical`\|`security` sur export | 0 nœud tagué |
| `security-needs-verification` | tag `security` | 0 nœud tagué |

Un verdict BLOCK est donc structurellement impossible. **WARN est le seul signal vivant.**
PASS signifie « aucune règle armée n'a été déclenchée », et aucune ne l'est.

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
Le job PR `Semctx` est un garde-fou — vert par construction tant que le tier strict est inerte.

## Workspace

`.semctx/` est machine-local **sauf** `.semctx/semantic/`, qui porte le plan autorisé et se
commit. `semctx_index_health` en `UNSEALED`/`STALE` → `semctx_setup` avec `confirm: true`
(idempotent, ne touche pas aux `.sem`). `DIRTY_KNOWN` = arbre sale, normal, non bloquant.
