# Architecture — overview

## But

Un Worker Cloudflare qui :

1. reçoit les interactions Discord (`/apply`, composants, appeal) — **live**
2. Gateway : enforce `#github-to-watch` + `#news-actu` — **live**
3. orchestre OAuth GitHub — **stub 501**
4. collecte des **signaux quantitatifs** via l’API GitHub — **not wired**
5. calcule un **score déterministe** — **lib pure + tests**
6. accepte (rôle) ou refuse (DM) — **not wired**

## Composants (live vs next)

```
┌─────────────┐  interactions + REST   ┌──────────────────────────┐
│   Discord   │ ◄────────────────────► │  CF Worker circle-api    │
│   Guild     │         ▲              │  circle.roxabi.dev       │
└─────────────┘         │              │  - /interactions  LIVE   │
                        │ Gateway WS   │  - /health        LIVE   │
                        └──────────────│  - Gateway DO     LIVE   │
                                       │  - /oauth/*       501    │
                                       │  scoring/*        pure   │
                                       └────────────┬─────────────┘
                                                    │ next
                              ┌─────────────────────┼─────────────────────┐
                              ▼                     ▼                     ▼
                           D1 (apps)             KV (state)          GitHub API
```

## HTTP vs Gateway (live)

| Interactions HTTP | Gateway (Durable Object) |
|---|---|
| scale-to-zero, CF natif | WS sortant Discord (always-on DO + cron) |
| `/apply`, appeal tickets | `#github-to-watch` / `#news-actu` MESSAGE_CREATE |
| 3s ACK + deferred follow-up | modération liens + threads |

Live = **Interactions + Gateway DO** (pas un process Node long-lived). Host: `https://circle.roxabi.dev`.

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
| fort mais 0 public | score bas → reject + pointer `#appeal` (D6 soft) |
| D11 non satisfait | **pas de score** — consignes PR d’entrée |
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

## Domaine

`https://circle.roxabi.dev` (Worker custom domain, compte CF Mickael / zone `roxabi.dev`).

## Hors scope MVP

- site marketing
- panel admin riche (config via D1 seed / wrangler d1 execute suffit)
- parrainage P2P
- analyse qualité code LLM
