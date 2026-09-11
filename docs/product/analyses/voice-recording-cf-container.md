# Analyse — enregistrement vocal Discord sur Cloudflare Container

**Date :** 2026-09-10 → 2026-09-11  
**Statut :** expérience **terminée**. **Pas produit.** Pas armé sur `circle.roxabi.dev`.  
**Code spike :** non mergé (PR draft #33 + branche worktree). Ne pas le reprendre comme spec.

Question : un **Container** Cloudflare peut-il joindre le **UDP vocal Discord** ?  
Réponse : **oui** (join Ready). Enregistrer les pistes n’a **pas** été prouvé.

## Verdict

| Couche | Test | Résultat |
|---|---|---|
| **A** | UDP générique — STUN `stun.l.google.com:19302` depuis le Container | **Go** |
| **B** | Opcode 4 (Lyra) + Voice WS + UDP RTP + DAVE → `VoiceConnection` **Ready** | **Go** |
| Enregistrement | `VoiceReceiver` / `addTrack` / ffmpeg / R2 | **non testé** — join ≠ record |

`1.1.1.1:53` n’est **pas** un Go UDP. Un fichier silence n’est **pas** un Go RTP.

## Découpage qui a tenu

```
Discord Gateway WS  ←── seul IDENTIFY Lyra ──→  Durable Object DiscordGateway  (circle-api)
        │ Opcode 4 (join / leave)
        ▼
VOICE_SERVER_UPDATE + session_id
        │ handoff HTTP (endpoint, token vocal, session_id)
        ▼
Container  ── Voice WS + UDP RTP ──  discord.media
        ▲
        └── Worker throwaway  (HTTP /start /stop /udp-probe uniquement)
```

| Zone | Rôle | Interdit |
|---|---|---|
| Worker **prod** `circle-api` | Interactions HTTP + **un** Gateway Lyra | 2ᵉ IDENTIFY ; Container dans le même `wrangler.toml` |
| Worker **jetable** | HTTP vers le Container | Token bot ; Gateway Discord |
| Container | Voice WS + UDP | `gateway.discord.gg` / 2ᵉ IDENTIFY Lyra |
| Git | Placeholders | Secrets, IDs bucket, tokens vocaux |

Isolation = **Worker séparé**, pas deux classes Durable Object dans le même Worker.

Worker ↔ Container = **HTTP seulement**. Pas de port UDP inbound. Egress UDP **sortant** : oui (A + B).

## Règles dures (garder)

1. **Un seul Gateway** sur le token Lyra. Un 2ᵉ IDENTIFY kick le Durable Object.
2. Opcode 4 **uniquement** sur `DiscordGateway`. Le recorder injecte le handoff ; il n’envoie pas Opcode 4.
3. Flag off → routes **404** (comme une route inconnue). Prod ne pose pas le flag.
4. Ne jamais log / store le token vocal ni `secret_key`.
5. Temp-voice ignore déjà le bot : Lyra dans une room ne doit ni créer ni voler la room.
6. Hibernation WebSocket Cloudflare **ne s’applique pas** au Gateway **sortant** (`Outgoing WebSockets do not hibernate`). Lyra reste un Durable Object always-on + cron `*/15`.

## Pièges (temps perdu)

| Symptôme | Cause | Fix |
|---|---|---|
| Join n’arrive pas Ready | `@discordjs/voice` **0.18** : pas de DAVE → Discord close **4017** | **0.19.2** + `daveEncryption: true` |
| Bounce `signalling` ↔ `connecting` | Ré-injecter l’adapter à **chaque** `sendPayload` | Inject **one-shot** (1er `sendPayload`) |
| Inject trop tôt | `queueMicrotask` avant STATE puis SERVER | Inject au premier `sendPayload` |
| `networkingStatus` toujours `undefined` | Enum numérique lue comme string | Mapper `NetworkingStatusCode` |
| Image Container introuvable au deploy | `IMAGE_REGISTRY_DOESNT_CONTAIN_IMAGE` | `wrangler containers push` + pin du tag |
| REST Discord **1010** (WAF) | Pas de `User-Agent: DiscordBot (url, ver)` | UA obligatoire |

Le Worker **ne peut pas** héberger `@discordjs/voice` : pas d’UDP, pas de NAPI `@snazzah/davey`. Un sidecar UDP reste obligatoire. UDP-dans-WS = le sidecar tient encore l’UDP.

Pas d’API bot WebRTC / TCP-média publique. Voix bot = Voice WS + **UDP RTP**.

Échantillon officiel Cloudflare Discord = **Interactions HTTP** seulement. Craig / Lavalink / discord.js voix = process UDP long-lived.

## Coût (ordre de grandeur, Workers Paid)

Le levier n’est **pas** Lyra. Le Gateway est déjà dans le forfait **$5** (un Durable Object, ~336k GB-s dans les 400k inclus).

| Choix | Effet |
|---|---|
| 2ᵉ Durable Object 24/7 (recorder collé au Gateway) | **+$12.50** / mois environ + couplage crash / deploy |
| Container `basic` 24/7 | **~$19–33** / mois incremental (après quota RAM) |
| Container **à la session** + `sleepAfter` | Quota inclus ≈ **25 h** `basic` ≈ **150** sessions de 10 min (ou **~75** si sleep 10 min) |

1 guild Lyra → **1** vocal à la fois. Fusion Gateway + Container économise le 2ᵉ Durable Object mais couple le deploy. **Ne pas fusionner.**

## Ce que ça n’autorise pas

- Merger le spike / l’armer en prod.
- Enregistrer (subscribe receiver, dump Opus, R2).
- Écran partagé.
- 2ᵉ application Discord « pour contourner » le Gateway.

## Si on productise plus tard

Même découpage : Opcode 4 sur Lyra · Container jetable ou Worker recorder dédié · sleep, pas 24/7.

Ajout manquant : `conn.receiver.subscribe` → dump Opus → R2 · `manifest.json` par session.

Ne pas porter `@discordjs/voice` dans le Worker.

## Cleanup fait (2026-09-10)

| | |
|---|---|
| Prod | Redeploy **main** — `/health` = `roxabi-circle` · `/internal/voice-record/*` = **404** |
| Flag / secrets spike | Retirés de prod |
| Worker + Container jetables | Supprimés (plus d’instance LIVE) |
| Lyra | Gateway reconnecté · **hors vocal** |

## Références internes

- Durable Object Gateway : `apps/circle-api/src/discord/gateway.ts`
- Architecture live : [`../architecture/overview.md`](../architecture/overview.md)
