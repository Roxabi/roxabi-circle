# Scoring — design

## Principes

1. **Déterministe** — même `ProfileSignals` → même score
2. **Pas de LLM** — pas d’interprétation sémantique du code
3. **Pas de clone** — uniquement API GitHub
4. **Explicable en interne** — axes + evidence pour audit opérateur / logs
5. **Opaque pour le candidat** — seul le score total 0–100 est montré (curiosité volontaire, D2)
6. **Anti-gaming basique** — ignore forks bruts, vendor paths, comptes neufs

## Formule

```
score = 100 * (
  w_volume    * n(volume) +
  w_structure * n(structure) +
  w_activity  * n(activity) +
  w_ai        * n(ai) +
  w_oss       * n(oss)
)
```

`n(x)` = normalisation 0..1 (souvent log-scale pour les compteurs).

### Poids MVP (proposés)

| Axe | Poids | Rationale |
|---|---|---|
| volume | 0.25 | prouve qu’il produit |
| structure | 0.15 | signal craft sans juger le style |
| activity | 0.20 | pas un musée de 2019 |
| ai | 0.20 | alignement cercle |
| oss | 0.20 | ADN partage / contrib |

Configurables via D1 `config`.

## Axes

### 1. Volume (`volume`)

**Inputs**

- `public_repos_owned` (non-fork)
- `total_additions` / `total_deletions` (sum stats/contributors où `author.id == github_id`, top N repos)
- `total_stars_on_owned`

**Norme (sketch)**

| signal | raw → 0..1 |
|---|---|
| repos owned | `log1p(repos) / log1p(30)` clamp 1 |
| additions | `log1p(additions) / log1p(50_000)` clamp 1 |
| stars | `log1p(stars) / log1p(200)` clamp 1 |

`volume = 0.5 * additions_n + 0.3 * repos_n + 0.2 * stars_n`

### 2. Structure (`structure`)

Sur échantillon de repos (max 10 non-fork, triés par pushed_at) :

Heuristiques booléennes / ratios :

| signal | poids local |
|---|---|
| a un dossier `src/` ou `lib/` ou `app/` ou `packages/` | + |
| a des tests (`test/`, `tests/`, `*_test.*`, `*.test.*`, `*.spec.*`) | + |
| a CI (`.github/workflows/`, `.gitlab-ci.yml`) | + |
| a docs (`README.md` + `docs/` ou ADR) | + |
| tree size raisonnable (fichiers 10..5000 hors vendor) | + |
| pas 90 %+ fichiers dans un seul dossier plat dump | + |
| ratio paths vendor (`node_modules`, `vendor`, `dist`) faible | + |

`structure = mean(repo_structure_scores)`  

Repos ne clone pas le contenu — **noms de paths** via git trees API.

### 3. Activity (`activity`)

| signal | |
|---|---|
| `days_since_last_push` (max over owned) | plus bas = mieux |
| `public_events_90d` | count events public |
| `active_months_12` | mois avec ≥1 event/push |
| `account_age_days` | gate hard si < 30 |

Norme :

- last push < 14j → 1.0 ; < 90j → 0.6 ; < 365 → 0.3 ; sinon 0.1
- active_months / 12
- events_90d log-scale

Hard fail optionnel : `account_age_days < min_age` → reject immédiat (score non calculé).

### 4. AI affinity (`ai`)

Signaux **keyword / topic / language** — pas de lecture de code.

| source | match |
|---|---|
| repo `topics[]` | `ai`, `llm`, `machine-learning`, `openai`, `langchain`, `agents`, `mcp`, `rag`, `transformer`, … |
| repo name / description | mêmes stems + `claude`, `gpt`, `ollama`, `vllm`, `embeddings`, … |
| languages | Python, TypeScript, Jupyter Notebook (bonus léger si co-occur topics AI) |
| path hints (trees) | `prompts/`, `agents/`, `mcp/`, `*.ipynb` |

`ai = clamp( keyword_hits_weighted / target , 1 )`  
Un seul repo « ml-course » de 2018 ne doit pas suffire : combiner avec activity/volume.

Liste de keywords versionnée dans `worker/src/scoring/ai-keywords.ts`.

### 5. OSS (`oss`)

| signal | |
|---|---|
| merged PRs vers repos **non-owned** (search API sample) | fort |
| membership orgs publiques | moyen |
| contribs collaborator sur org repos | moyen |
| stars reçues cumulées | faible (déjà volume) |
| forks d’autres avec commits upstream (hard) | skip MVP |

`oss = f(external_merged_prs, org_count, collab_repos)`

## Décision

```
if hard_fail: REJECT
elif score >= accept_threshold: ACCEPT
else: REJECT
```

`accept_threshold` default **65** (**D1** — figé MVP).

## Surface candidat vs interne

| Surface | Contenu |
|---|---|
| DM / ephemeral user | `total`, décision, cooldown re-apply, mention `#appeal` si pertinent |
| D1 / logs opérateur | `ScoreReport` complet (axes, evidence, version) |

## Sortie `ScoreReport`

```ts
type ScoreReport = {
  total: number; // 0..100
  axes: {
    volume: AxisScore;
    structure: AxisScore;
    activity: AxisScore;
    ai: AxisScore;
    oss: AxisScore;
  };
  hardFail?: { reason: string };
  evidence: Record<string, unknown>; // raw counts for audit
  version: string; // scorer semver "0.1.0"
};

type AxisScore = {
  raw: number;   // 0..1
  weight: number;
  weighted: number;
  notes: string[];
};
```

## Ce qu’on ne fait PAS

- juger la « beauté » du code
- détecter la triche LLM dans le code
- scorer les repos privés
- télécharger les blobs

## Tests

Fixtures JSON de profils (synthétiques) :

| fixture | expected |
|---|---|
| `strong-oss-ai` | ACCEPT |
| `tutorial-forks-only` | REJECT |
| `old-inactive` | REJECT |
| `strong-private-no-public` | REJECT (appeal) |
| `borderline` | autour du seuil |

`npm test` = pure functions, zéro réseau.
