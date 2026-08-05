import { DEFAULT_PILOTAGE_URL, PILOTAGE_FEEDBACK_PATH, PILOTAGE_UPLOAD_PATH } from './constants'
import type { FeedbackEnvSlice } from './env'
import { readNodeProcessEnv, readPilotageEnv } from './env'
import type { FeedbackFormFields, FeedbackSubmitResult, PilotageRemoteConfig } from './types'

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

export type ResolvePilotageConfigInput = Partial<PilotageRemoteConfig> & {
  /** Worker `c.env` or Node `process.env` in tests. */
  env?: FeedbackEnvSlice
}

/** Lit PILOTAGE_URL / PILOTAGE_FEEDBACK_API_URL + clé (fbk_…). */
export function resolvePilotageRemoteConfig(
  overrides?: ResolvePilotageConfigInput,
): PilotageRemoteConfig | { error: string } {
  const fromRecord = readPilotageEnv(overrides?.env ?? readNodeProcessEnv())

  const baseUrl = normalizeBaseUrl(overrides?.baseUrl || fromRecord.baseUrl || DEFAULT_PILOTAGE_URL)
  const apiKey = (overrides?.apiKey || fromRecord.apiKey || '').trim()

  if (!apiKey) {
    return {
      error: 'Signalement non configuré (PILOTAGE_API_KEY / PILOTAGE_FEEDBACK_API_KEY absente).',
    }
  }
  if (!baseUrl) {
    return { error: 'Signalement non configuré (PILOTAGE_URL absente).' }
  }

  return {
    baseUrl,
    apiKey,
    fetch: overrides?.fetch,
  }
}

async function uploadImages(cfg: PilotageRemoteConfig, files: File[]): Promise<string[]> {
  const fetchFn = cfg.fetch ?? fetch
  const images: string[] = []
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue
    const up = new FormData()
    up.append('file', f, f.name || 'capture.png')
    const ur = await fetchFn(`${cfg.baseUrl}${PILOTAGE_UPLOAD_PATH}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      body: up,
    })
    if (!ur.ok) continue
    const d = (await ur.json().catch(() => ({}))) as { url?: string }
    if (d.url) images.push(d.url)
  }
  return images
}

/**
 * Envoie un signalement vers Pilotage M2M (`POST /api/v1/feedback`).
 * Client cible = déduit de la clé (pas de clientSlug).
 */
export async function submitRemoteFeedback(
  cfg: PilotageRemoteConfig,
  fields: FeedbackFormFields,
  opts?: { author: string },
): Promise<FeedbackSubmitResult> {
  const fetchFn = cfg.fetch ?? fetch
  const author = (opts?.author || '').trim().slice(0, 60)

  try {
    const images = fields.files.length > 0 ? await uploadImages(cfg, fields.files) : []

    const payload: Record<string, unknown> = {
      type: fields.type,
      priority: fields.priority,
      title: fields.title,
      body: fields.body,
      page: fields.page || undefined,
      agent: fields.agent || undefined,
      author: author || undefined,
    }
    if (images.length) payload.images = images

    const r = await fetchFn(`${cfg.baseUrl}${PILOTAGE_FEEDBACK_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!r.ok) {
      const errBody = await r.text().catch(() => '')
      return {
        ok: false,
        error: `Pilotage ${r.status}${errBody ? `: ${errBody.slice(0, 200)}` : ''}`,
        status: 502,
      }
    }

    const data = (await r.json().catch(() => ({}))) as {
      ref?: number
      clientSlug?: string
      type?: string
    }

    return {
      ok: true,
      ref: data.ref,
      clientSlug: data.clientSlug,
      type: data.type,
      images: images.length,
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      status: 502,
    }
  }
}
