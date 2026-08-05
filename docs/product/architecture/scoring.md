# Scoring — design (v0.2 specialty)

## Intent produit

Récompenser **autant** :

1. **Artisans** — bons craft techniques avec **repos publics de code** (pas juste de la doc / profile README)
2. **Contributeurs écosystème** — PR / org / collab hors pure ownership perso

**Pas** uniquement les profils « moyens partout ».

## Principes

1. **Déterministe** — même `ProfileSignals` → même score  
2. **Pas de LLM** — pas d’interprétation sémantique du code  
3. **Pas de clone** — API GitHub only  
4. **Excellence** — `specialty = max(craft, ecosystem)` porte le bulk du score  
5. **Opaque candidat** — total + décision ; axes en ops  
6. **Algo open** dans le repo  

## Formule

```
craft      ∈ [0,1]   # publish technique public
ecosystem  ∈ [0,1]   # commons / collab
activity   ∈ [0,1]
ai         ∈ [0,1]   # secondaire

specialty  = max(craft, ecosystem)

total = 100 × (
  0.70 × specialty +
  0.20 × activity +
  0.10 × ai
)

accept ⇔ total ≥ 65  AND  specialty ≥ 0.45
```

`path` ∈ `craft` | `ecosystem` | `tie` selon lequel gagne.

### Pourquoi pas une moyenne de 5 axes

Une somme équilibrée force le polyvalent et **ignore** le spécialiste fort.  
Avec `max(craft, ecosystem)`, un expert **ou** publisher **ou** collab lourd peut passer sans être moyen partout.  
Le **floor specialty** empêche un tourist AI+activity sans craft ni écosystème.

## Craft (artisan / publish)

```
craft = 0.35×logNorm(additions, 50k)
      + 0.25×logNorm(technicalRepos, 12)
      + 0.25×structureMean
      + 0.15×logNorm(starsOwned, 100)
```

Pénalités :

- `technicalRepos = 0` → craft × 0.12 (profile/docs only)
- ratio tech/owned bas → craft atténué

**technicalRepos** = owner non-fork **hors** profile README, `.github`, portfolio pure doc (heuristique collector).

## Ecosystem (commons)

```
ecosystem = 0.40×logNorm(orgPushEvents, 25)
          + 0.30×logNorm(collabRepos, 12)
          + 0.20×logNorm(extMergedPrs, 15)
          + 0.10×logNorm(publicOrgs, 4)
```

Orgs : membership public, `@Org` company/bio si vraie org, ou events avec ≥3 pushes + type Organization.

## Activity / AI

Inchangés dans l’esprit (récence ; keywords AI) mais **AI ne pèse que 10 %** et ne peut plus porter un accept seul (floor specialty).

## SSoT

| Couche | Rôle |
|---|---|
| `apps/circle-api/src/scoring/score.ts` | **unique** formule |
| `apps/circle-api/scripts/collect-github-profiles.mjs` | GitHub → signals → `scoreProfile()` |
| D1 config (futur) | threshold / floor / weights live |

## Surface candidat

DM : `total`, décision, cooldown, `#appeal` si besoin.  
Jamais le détail des axes (D2).

## Fixtures cibles

| Profil | Attendu |
|---|---|
| Artisan solo public technique | accept path=craft |
| Founder org / collab lourd | accept path=ecosystem |
| Keyword AI + scaffolds, 0 craft/eco | reject specialty_floor |
| Inactive museum | reject |
| Private-only | reject + appeal |
