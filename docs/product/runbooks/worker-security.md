# Sécurité — Worker `roxabi-circle`

## Surface d’attaque

| Endpoint | Auth | Notes |
|---|---|---|
| Host | `https://circle.roxabi.dev` | custom domain only (`workers_dev = false`) |
| `GET /health` | public | infos non sensibles (seuil score volontairement open) |
| `POST /interactions` | **Ed25519 Discord** | seule porte d’écriture bot |
| `POST /internal/discord-gateway/ensure` | **`X-Ops-Secret`** (`GATEWAY_OPS_SECRET`) | wake/status DO only |
| `GET /oauth/github/*` | HMAC state (à venir) | 501 stub |
| `*` | — | **404** (pas d’inventaire endpoints) |

## Contrôles en place

1. **Signature Discord obligatoire**  
   Headers `X-Signature-Ed25519` + `X-Signature-Timestamp` + body brut.  
   Vérif `crypto.subtle` Ed25519 avec `DISCORD_PUBLIC_KEY`.  
   Échec → **401** (aucune logique métier).

2. **Secrets hors repo**  
   `wrangler secret` (token bot, public key, session, etc.).  
   Pas de secrets dans `wrangler.toml` / git.

3. **Least privilege Discord**  
   Bot Admin pour ops tickets/roles (à resserrer plus tard).  
   Tickets appeal : non-membres only, 1 max, salon privé.

4. **Pas de CF Access sur /interactions**  
   Discord doit appeler l’URL en clair HTTPS sans login humain.

## À faire / hardening

| Priorité | Mesure |
|---|---|
| P0 | **Rotate** bot token s’il a fuité en chat (encore recommandé) |
| P1 | ~~Domaine custom~~ **done** — `circle.roxabi.dev` · CF account Mickael · `workers_dev=false` |
| P1 | Rate limit KV sur `/apply` et open ticket (frame: 3/h/user) |
| P1 | Logs structurés sans PII / sans tokens |
| P2 | Rôle `staff` pour tickets (au lieu d’Admin bot) |
| P2 | D1 pour state tickets (au lieu de nom de channel seul) |
| P2 | OAuth GitHub state HMAC + one-time KV |

## Ce qui n’est **pas** une faille

- Public key Discord : c’est une **clé publique** de vérif (OK en secret CF).
- `/health` expose le seuil 65 : **volontaire** (algo open, D2).
