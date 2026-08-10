# Flow Discord ↔ GitHub

## Sequence

```
User          Discord           Worker              GitHub
 │               │                 │                   │
 │── /apply ────►│                 │                   │
 │               │── POST /interactions ──────────────►│
 │               │◄─ 200 deferred / ephemeral ─────────│
 │◄─ DM link ────│                 │                   │
 │               │                 │                   │
 │── GET /oauth/github/start ─────►│                   │
 │◄─ 302 authorize ────────────────┼──────────────────►│
 │── callback code ───────────────►│                   │
 │                                 │── exchange ──────►│
 │                                 │◄─ token ──────────│
 │                                 │── collect ───────►│
 │                                 │◄─ metrics ────────│
 │                                 │  score()          │
 │                                 │── add role / DM ─►│ (Discord REST)
 │◄─ accept or reject DM ──────────│                   │
```

## Discord setup (ops)

1. Créer Application Discord → Bot
2. Privileged intents : **Message Content** requis pour Gateway `#github-to-watch` / `#news-actu` ; Server Members optionnel
3. OAuth2 bot scopes : `bot`, `applications.commands`
4. Permissions bot : Manage Roles, Send Messages, Send Messages in Threads, Embed Links (Admin live for now)
5. Interactions Endpoint URL : `https://circle.roxabi.dev/interactions` (Portal — done)
6. Rôle `member` **sous** le rôle du bot (hiérarchie Discord)

## GitHub OAuth App

- Homepage : `https://circle.roxabi.dev`
- Callback : `https://circle.roxabi.dev/oauth/github/callback`
- Scopes demandés : `read:user` (minimum). Données publiques accessibles avec token user.

## Idempotence

- Un `discord_user_id` ne peut avoir qu’**une** application `accepted`
- Re-apply après `rejected` :
  - **1er** refus → cooldown **48h**
  - refus **suivants** → cooldown **15 jours**
  - si `now < next_eligible_at` → ephemeral avec temps restant (FR)
- Si déjà `accepted` → ephemeral « déjà membre »

## Sécurité

- Verify Ed25519 Discord sur chaque interaction
- OAuth `state` signé HMAC + one-time KV
- Ne jamais logger le GitHub token
- Rate limit `/apply` : 3 / discord_user / heure (KV)
