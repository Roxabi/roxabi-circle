# Décisions produit (figées MVP)

| ID | Décision | Détail |
|---|---|---|
| D1 | Seuil d’acceptation | **65** / 100 — ajustable via config D1 sans redeploy |
| D2 | Visibilité score | Score **numérique** communiqué (ex. `42/100`). **Zéro indice** sur les critères, axes, ou comment s’améliorer. Curiosité = partie du process |
| D3 | Re-apply | **1re chance** après refus : **48h**. Ensuite : **tous les 15 jours**. Message refus l’annonce clairement |
| D4 | Repo + bot | **Public** — bot Discord + repo (PRs welcome) = ADN OSS |
| D5 | Langue | **FR** pour l’instant (UI bot, DMs, salon) |
| D6 | Profil fort mais 100 % privé | **Hard reject** auto + canal Discord **`#appeal`** (revue manuelle opérateur) |
| D7 | Forks | Ignorés sauf commits massifs post-fork (collecteur) |
| D8 | Âge compte GitHub | Hard fail si **&lt; 30 jours** |
| D9 | Nom | **Roxabi Circle** |
| D10 | Entrée serveur | Lien invite Discord + `/apply` in-server |

## Messaging refus (canon FR)

```
Roxabi Circle — candidature

Score : {score}/100
Décision : non retenue pour l’instant.

Tu auras une nouvelle chance dans {cooldown_label}.
Ensuite, une tentative tous les 15 jours.

Pas d’indice sur l’évaluation — à toi de chercher 😉
Si ton travail open source est surtout privé / ailleurs, ouvre un ticket dans #appeal.
```

`cooldown_label` = `48 heures` (1er refus) ou `15 jours` (refus suivants).

## Messaging accept (canon FR)

```
Bienvenue dans le Roxabi Circle.

Score : {score}/100
Tu as le rôle membre. Lis #règles et présente-toi dans #intros.
```

Toujours **sans** détail des axes.

## Non-négociables techniques

- Pas de LLM pour lire le code
- Pas de clone de repos
- GitHub OAuth obligatoire
- Auto-accept ou refuse (pas de limbo silencieux)
- Score internal `ScoreReport.axes` = audit opérateur / logs — **jamais** exposé au candidat
