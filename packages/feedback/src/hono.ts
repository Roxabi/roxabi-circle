import type { Context } from 'hono'
import { type FeedbackEnvSlice, isFeedbackEnabled } from './env'
import { parseFeedbackFormData } from './form'
import { resolveSparkRemoteConfig, submitRemoteFeedback } from './remote-client'
import type { SparkRemoteConfig } from './types'

export type FeedbackHonoOptions = {
  getAuthor: (c: Context) => Promise<string> | string
  before?: (c: Context) => Promise<Response | null | undefined> | Response | null | undefined
  enabled?: (c: Context) => boolean | Promise<boolean>
  disabledMessage?: string | (() => string)
  sparkUrl?: string
  apiKey?: string
  fetch?: typeof fetch
}

function feedbackEnv(c: Context): FeedbackEnvSlice {
  return c.env as FeedbackEnvSlice
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Handler POST proxy host → Spark M2M.
 * Monte sur `POST /api/report` (ou path produit) derrière `requireAuth`.
 */
export async function handleFeedbackReport(
  c: Context,
  opts: FeedbackHonoOptions,
): Promise<Response> {
  if (opts.before) {
    const early = await opts.before(c)
    if (early) return early
  }

  const env = feedbackEnv(c)
  const enabled = opts.enabled ?? (() => isFeedbackEnabled(env))
  const on = await enabled(c)
  if (!on) {
    const msg =
      typeof opts.disabledMessage === 'function' ? opts.disabledMessage() : opts.disabledMessage
    return json(
      {
        error:
          msg ?? 'Les signalements sont désactivés sur cet environnement (FEEDBACK_ENABLED off).',
      },
      503,
    )
  }

  const author = await opts.getAuthor(c)
  const authorName = String(author || 'Utilisateur').trim() || 'Utilisateur'

  const form = await c.req.formData().catch(() => null)
  if (!form) return json({ error: 'Requête invalide.' }, 400)

  const parsed = parseFeedbackFormData(form)
  if ('error' in parsed) return json({ error: parsed.error }, 400)

  const cfgOrErr = resolveSparkRemoteConfig({
    baseUrl: opts.sparkUrl,
    apiKey: opts.apiKey,
    fetch: opts.fetch,
    env,
  })
  if ('error' in cfgOrErr) return json({ error: cfgOrErr.error }, 503)

  const result = await submitRemoteFeedback(cfgOrErr as SparkRemoteConfig, parsed, {
    author: authorName,
  })

  if (!result.ok) {
    return json({ error: result.error }, result.status)
  }

  return json({
    ok: true,
    ref: result.ref,
    clientSlug: result.clientSlug,
    type: result.type,
    images: result.images ?? 0,
  })
}

export type { FeedbackEnv, FeedbackEnvSlice } from './env'
export { isFeedbackEnabled, readSparkEnv } from './env'
export { buildClientFormData, parseFeedbackFormData } from './form'
export { resolveSparkRemoteConfig, submitRemoteFeedback } from './remote-client'
export type { FeedbackFormFields, FeedbackSubmitResult, SparkRemoteConfig } from './types'
