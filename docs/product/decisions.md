# Décisions produit (figées MVP)

| ID | Décision | Détail |
|---|---|---|
| D1 | Seuil d’acceptation | **65** / 100 — **config D1** (live, sans redeploy) ; env/wrangler = fallback local |
| D2 | Visibilité score (messaging) | Score **numérique** dans les DM/ephemeral (ex. `42/100`). **Zéro lecture guidée** des axes/critères dans le message. **Algo open** dans le repo (curiosité / reverse-engineer OK) |
| D3 | Re-apply | **1re chance** après refus : **48h**. Ensuite : **tous les 15 jours**. Message refus l’annonce clairement |
| D4 | Repo + bot | **Public monorepo** — **AGPL-3.0** (standard Roxabi). PRs welcome. Chassis kit rebrandé Roxabi (voir D12) |
| D5 | Langue | **FR** pour l’instant (UI bot, DMs, salon, admin) |
| D6 | Profil faible / peu de signal public | **Reject score normal** (pas de hardFail dédié) + mention **`#appeal`** dans le copy pour cas edge (privé only, etc.) |
| D7 | Forks | Ignorés sauf commits massifs post-fork (collecteur) |
| D8 | ~~Âge compte GitHub~~ | **Supprimé** — pas de hardFail âge. Preuve d’identité + engagement via **D11** |
| D9 | Nom | **Roxabi Circle** |
| D10 | Entrée serveur | Lien invite Discord + `/apply` in-server |
| D11 | Unlock scoring | Le scoring ne tourne **qu’après** validation d’une **PR user** sur un **repo d’entrée dédié** (preuve contrôlée). OAuth seul ne score pas |
| D12 | Brand chassis | Surface Roxabi (`@roxabi/*`, docs, CI). Gate CI `BANNED_REPO_TERMS` = **liste** (secret/env, jamais hardcodée dans le script). Rebrand + purge termes hérités côté template/Silex |
| D13 | Scope MVP runtime | **Discord gate** + **admin web** + **MCP** ops (dogfood monorepo) |
| D14 | Override ops | Court-circuit score = **override staff** (admin / MCP `sk_`), auditable — pas de backdoor secrète dans le code public |

## Flow d’entrée (canon)

```
/apply → OAuth GitHub (identité)
      → consignes PR sur repo d’entrée (ex. Roxabi/circle-applications)
      → user ouvre PR (template / preuve)
      → merge ou check bot → unlock scoring
      → collect signaux + scoreProfile
      → accept (rôle) | reject (DM + cooldown)
```

Repo d’entrée exact + template PR : ouverts (O6) mais le **mécanisme D11** est figé.

## Messaging refus (canon FR)

```
Roxabi Circle — candidature

Score : {score}/100
Décision : non retenue pour l’instant.

Tu auras une nouvelle chance dans {cooldown_label}.
Ensuite, une tentative tous les 15 jours.

Pas d’indice dans ce message — le scorer est open source si tu es curieux 😉
Si ton travail open source est surtout privé / ailleurs, ouvre un ticket dans #appeal.
```

`cooldown_label` = `48 heures` (1er refus) ou `15 jours` (refus suivants).

## Messaging accept (canon FR)

```
Bienvenue dans le Roxabi Circle.

Score : {score}/100
Tu as le rôle membre. Lis #règles et présente-toi dans #intros.
```

Toujours **sans** détail des axes dans le DM (D2 messaging).

## Non-négociables techniques

- Pas de LLM pour lire le code
- Pas de clone de repos
- GitHub OAuth obligatoire (identité)
- **Scoring verrouillé tant que D11 (PR entrée) non satisfait**
- Auto-accept ou refuse après score (pas de limbo silencieux)
- `ScoreReport` complet = audit ops / admin / MCP — **jamais** collé tel quel dans un DM candidat (`toCandidateView` = total + décision)
- License **AGPL-3.0**
