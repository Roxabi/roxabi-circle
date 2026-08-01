# Architecture — overview

## But

Un Worker Cloudflare qui :

1. reçoit les interactions Discord (`/apply`, composants)
2. orchestre OAuth GitHub
3. collecte des **signaux quantitatifs** via l’API GitHub
4. calcule un **score déterministe**
5. accepte (rôle) ou refuse (DM)

## Composants

```
┌─────────────┐     interactions      ┌──────────────────────┐
│   Discord   │ ◄──────────────────► │  CF Worker           │
│   Guild     │     REST bot API     │  - /interactions     │
└─────────────┘                      │  - /oauth/github/*   │
                                     │  - /health           │
                                     │                      │
                                     │  scoring/* (pure)    │
                                     └──────────┬───────────┘
                                                │
                         ┌──────────────────────┼──────────────────────┐
                         ▼                      ▼                      ▼
                      D1 (apps)              KV (state)          GitHub API
                   applications            oauth state           REST/GraphQL
                   scores, decisions       rate limits           (user token)
                   config thresholds
```

## Pourquoi Worker (pas gateway bot)

| Interactions HTTP | Gateway (discord.js long-lived) |
|---|---|
| scale-to-zero, CF natif | process toujours up (Quadlet/factory) |
| suffit pour apply + DM | utile pour presence / voice / react-all |
| 3s ACK + deferred follow-up | temps réel |

MVP = **Interactions only**. Si plus tard on veut un bot « vivant » (réactions, jobs), on pourra brancher un second process ou factory-discord — hors scope Circle MVP.

## Flux détaillé

### A. `/apply` (Discord)

1. User → `/apply` dans le salon onboarding
2. Worker vérifie signature Discord (`X-Signature-Ed25519`)
3. Répond `DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE` ou ephemeral « lien envoyé en DM »
4. Crée `application` row (status=`started`, discord_user_id)
5. Génère `state` (KV, TTL 15 min) lié discord_user_id
6. DM avec bouton **Connect GitHub** → `https://circle.roxabi.dev/oauth/github/start?state=…`

### B. OAuth GitHub

1. Redirect authorize (scopes: `read:user`, `public_repo` lecture seule — ideal: scopes minimaux `read:user` + access public data)
2. Callback → exchange code → user token court
3. `GET /user` → login, id, created_at
4. Lance évaluation (sync si < budget CPU, sinon queue via `waitUntil` / scheduled follow-up)

### C. Collecte métriques

Sans clone. Sources API :

| Signal | Endpoint(s) |
|---|---|
| Profil | `GET /user`, `GET /users/{login}` |
| Repos | `GET /user/repos?type=public&affiliation=owner,collaborator,organization_member` |
| Langues | `GET /repos/{o}/{r}/languages` (échantillon top N repos) |
| Contrib volume | `GET /repos/{o}/{r}/stats/contributors` (additions/deletions pour l’auteur) |
| Activité | `GET /users/{login}/events/public`, commit dates via search ou events |
| Structure | `GET /repos/{o}/{r}/git/trees/{default_branch}?recursive=1` (échantillon) |
| OSS externe | `GET /search/issues?q=author:LOGIN+is:pr+is:merged` (sample), org memberships public |

**Caps** : max N repos scannés (ex. 25 plus récents non-fork), timeout total, cache D1 7j par github_id.

### D. Scoring

Voir `scoring.md`. Fonctions pures, input = `ProfileSignals`, output = `ScoreReport`.

### E. Décision

| Score | Action |
|---|---|
| ≥ accept_threshold (65) | `Add Guild Member Role` + DM bienvenue (**score only**) |
| < accept_threshold | DM refus : **score only**, zéro critère, + policy re-apply |
| fort mais 0 public | hard reject + pointer `#appeal` |
| erreur technique | status=`error`, DM « réessaie » + log |

**Exposé au candidat** : `total` uniquement.  
**Jamais exposé** : axes, weights, evidence, keywords, notes.

### F. Re-apply

| # refus antérieurs (décidés reject) | Cooldown avant nouvelle tentative |
|---|---|
| 0 → après 1er reject | **48 heures** |
| ≥ 1 → après reject suivants | **15 jours** |

Annoncé dans le DM de refus. Enforce côté D1 (`applications` count + `decided_at`).

## Données (D1)

```sql
-- sketch
applications (
  id TEXT PK,
  discord_user_id TEXT NOT NULL,
  github_id TEXT,
  github_login TEXT,
  status TEXT, -- started|scoring|accepted|rejected|error
  score_total REAL,
  score_json TEXT, -- axes + evidence
  created_at, decided_at
)

config (
  key TEXT PK,
  value TEXT  -- thresholds, weights
)
```

## Secrets

| Secret | Usage |
|---|---|
| `DISCORD_PUBLIC_KEY` | verify interactions |
| `DISCORD_BOT_TOKEN` | roles + DM |
| `DISCORD_APPLICATION_ID` | commands |
| `DISCORD_GUILD_ID` | target server |
| `DISCORD_MEMBER_ROLE_ID` | role on accept |
| `GITHUB_CLIENT_ID` / `SECRET` | OAuth |
| `SESSION_SECRET` | state HMAC |

## Limites & mitigations

| Risque | Mitigation |
|---|---|
| GitHub rate limit | OAuth user token + cache + sample N repos |
| CF CPU time | scoring pure + collect capped ; `waitUntil` pour follow-up Discord |
| Stats API 202 (computing) | retry / skip repo / score partial flag |
| Faux positifs (templates massifs) | pénalité forks, ignore vendor/node_modules paths dans tree |
| Faux négatifs (fort mais privé) | hard reject + canal `#appeal` manuel |

## Domaine proposé

`circle.roxabi.dev` (Worker custom domain).

## Hors scope MVP

- site marketing
- panel admin riche (config via D1 seed / wrangler d1 execute suffit)
- parrainage P2P
- analyse qualité code LLM
