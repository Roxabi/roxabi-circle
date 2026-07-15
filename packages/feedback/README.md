# `@gosilex/feedback`

Kit SSoT — bouton **Signaler** + proxy Hono → Spark Pilotage (`POST /api/v1/feedback`).

| Surface | Import | Rôle |
|---------|--------|------|
| Core | `@gosilex/feedback` | types, parse FormData, client M2M |
| Hono | `@gosilex/feedback/hono` | `handleFeedbackReport` pour Workers |
| UI | `@gosilex/feedback/react` | bouton flottant + modal |
| Styles | `@gosilex/feedback/styles.css` | CSS autonome (thèmes) |

## Architecture

```
Browser  →  POST /api/report (session cookie, example-api)
                 ↓ handleFeedbackReport (sparkUrl/apiKey from D1)
            Spark  POST /api/v1/feedback  (Bearer spk_…)
```

La clé `spk_…` **ne sort jamais** du Worker. Le client Spark est **déduit de la clé**.

## Activation (kit — tout en D1)

| Couche | Mécanisme |
|--------|-----------|
| Toggle module | `kit_modules.enabled` — admin **Paramètres → Modules** |
| Config Spark | `kit_modules.config_json` — admin **`/settings/integrations/feedback`** |
| UI FAB | `GET /api/modules` → `feedback.enabled` + `configured` |

Défaut : **désactivé** et **non configuré**. Impossible d’activer sans URL + clé enregistrées (`INTEGRATION_NOT_CONFIGURED`).

`SPARK_URL` / `SPARK_API_KEY` en `.env` : **non utilisés** par example-api.  
`isFeedbackEnabled(env)` reste exporté pour produits legacy.

## example-api

- `routes/feedback.ts` — session-only + rate-limit + config D1
- `routes/integrations.ts` — `PUT /api/integrations/feedback` (admin)
- `routes/modules.ts` — `GET/PATCH /api/modules`

## Spark legacy

`@gosilex/spark-feedback` dans le repo Spark sera remplacé par ce package quand Spark pullera le kit en upstream.