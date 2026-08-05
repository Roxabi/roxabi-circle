# `@kit/feedback`

Kit SSoT — bouton **Signaler** + proxy Hono → Pilotage (`POST /api/v1/feedback`).

| Surface | Import | Rôle |
|---------|--------|------|
| Core | `@kit/feedback` | types, parse FormData, client M2M |
| Hono | `@kit/feedback/hono` | `handleFeedbackReport` pour Workers |
| UI | `@kit/feedback/react` | bouton flottant + modal |
| Styles | `@kit/feedback/styles.css` | CSS autonome (thèmes) |

## Architecture

```
Browser  →  POST /api/report (session cookie, example-api)
                 ↓ handleFeedbackReport (pilotageUrl/apiKey from D1)
            Pilotage  POST /api/v1/feedback  (Bearer fbk_…)
```

La clé `fbk_…` **ne sort jamais** du Worker. Le client Pilotage est **déduit de la clé**.

## Activation (kit — tout en D1)

| Couche | Mécanisme |
|--------|-----------|
| Toggle module | `kit_modules.enabled` — admin **Paramètres → Modules** |
| Config Pilotage | `kit_modules.config_json` — admin **`/settings/integrations/feedback`** |
| UI FAB | `GET /api/modules` → `feedback.enabled` + `configured` |

Défaut : **désactivé** et **non configuré**. Impossible d’activer sans URL + clé enregistrées (`INTEGRATION_NOT_CONFIGURED`).

`PILOTAGE_URL` / `PILOTAGE_API_KEY` en `.env` : **non utilisés** par example-api.  
`isFeedbackEnabled(env)` reste exporté pour produits legacy.

## example-api

- `routes/feedback.ts` — session-only + rate-limit + config D1
- `routes/integrations.ts` — `PUT /api/integrations/feedback` (admin)
- `routes/modules.ts` — `GET/PATCH /api/modules`

## Pilotage legacy

`@kit/feedback` dans le repo Pilotage sera remplacé par ce package quand Pilotage pullera le kit en upstream.