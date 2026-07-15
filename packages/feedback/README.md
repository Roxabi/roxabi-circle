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
                 ↓ handleFeedbackReport
            Spark  POST /api/v1/feedback  (Bearer spk_…)
```

La clé `spk_…` **ne sort jamais** du Worker. Le client Spark est **déduit de la clé**.

## Env (Worker)

| Variable | Rôle |
|----------|------|
| `FEEDBACK_ENABLED` | `true` pour activer (off par défaut) |
| `SPARK_URL` | Base Spark — local `../spark` : `http://localhost:3939` |
| `SPARK_API_KEY` | `spk_…` (scope `tickets:write`) |

Alias : `SPARK_FEEDBACK_API_URL` / `SPARK_FEEDBACK_API_KEY`.

## Env (Vite)

| Variable | Rôle |
|----------|------|
| `VITE_FEEDBACK_ENABLED` | Affiche le bouton (miroir API) |

## example-api

Voir `apps/example-api/src/routes/feedback.ts` — `requireAuth` + rate-limit + `handleFeedbackReport`.

## Spark legacy

`@gosilex/spark-feedback` dans le repo Spark sera remplacé par ce package quand Spark pullera le kit en upstream.