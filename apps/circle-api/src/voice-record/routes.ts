import { opsSecretOk } from '../lib/ops-secret'
import type { Env } from '../types'
import { isVoiceRecordSpikeArmed } from './flag'
import { handoffReady } from './handoff'
import {
  assertGuildMatches,
  assertNotVoiceHub,
  parseVoiceRecordStart,
  parseVoiceRecordStop,
} from './payload'
import { postRecorder, recorderConfigured, startBodyForRecorder } from './recorder-client'

export async function handleVoiceRecordRoute(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (pathname !== '/internal/voice-record/start' && pathname !== '/internal/voice-record/stop') {
    return null
  }
  if (request.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 })
  }
  // Unarmed → same 404 as unknown routes (do not advertise the spike).
  if (!isVoiceRecordSpikeArmed(env)) {
    return Response.json({ error: 'not_found' }, { status: 404 })
  }
  if (!opsSecretOk(request, env.GATEWAY_OPS_SECRET)) {
    return new Response('unauthorized', { status: 401 })
  }
  if (pathname.endsWith('/start')) return handleStart(request, env)
  return handleStop(request, env)
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

async function handleStart(request: Request, env: Env): Promise<Response> {
  const parsed = parseVoiceRecordStart(await readJson(request))
  if (!parsed.ok) {
    return Response.json({ ok: false, error: parsed.error }, { status: parsed.status })
  }
  const guild = assertGuildMatches(parsed.value.guildId, env.DISCORD_GUILD_ID)
  if (!guild.ok) {
    return Response.json({ ok: false, error: guild.error }, { status: guild.status })
  }
  const hub = assertNotVoiceHub(parsed.value.channelId, env.DISCORD_VOICE_HUB_CHANNEL_ID)
  if (!hub.ok) {
    return Response.json({ ok: false, error: hub.error }, { status: hub.status })
  }

  let handoff = null
  if (env.DISCORD_GATEWAY) {
    const id = env.DISCORD_GATEWAY.idFromName('lyra')
    const stub = env.DISCORD_GATEWAY.get(id)
    await stub.fetch(
      new Request('https://discord-gateway.internal/voice-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guildId: parsed.value.guildId,
          channelId: parsed.value.channelId,
        }),
      }),
    )
    const waitMs = Number(env.VOICE_HANDOFF_WAIT_MS ?? 2500)
    if (Number.isFinite(waitMs) && waitMs > 0) {
      await new Promise<void>((r) => setTimeout(r, waitMs))
    }
    const hr = await stub.fetch(new Request('https://discord-gateway.internal/voice-handoff'))
    if (hr.ok) {
      const raw = (await hr.json()) as { handoff?: typeof handoff; ready?: boolean }
      if (raw.handoff && (raw.ready || handoffReady(raw.handoff as never))) {
        handoff = raw.handoff as never
      }
    }
  }

  if (!recorderConfigured(env)) {
    return Response.json(
      {
        ok: false,
        error: 'recorder_not_configured',
        sessionId: parsed.value.sessionId,
        spike: 'A',
        hint: 'Bind VOICE_RECORDER or set VOICE_RECORDER_HTTP_URL after UDP provision',
      },
      { status: 503 },
    )
  }

  const rec = await postRecorder(env, '/start', startBodyForRecorder(parsed.value, handoff))
  const recJson = await safeJson(rec)
  return Response.json(
    {
      ok: rec.ok,
      sessionId: parsed.value.sessionId,
      recorderStatus: rec.status,
      recorder: recJson,
    },
    { status: rec.ok ? 202 : rec.status === 401 ? 502 : rec.status },
  )
}

async function handleStop(request: Request, env: Env): Promise<Response> {
  const parsed = parseVoiceRecordStop(await readJson(request))
  if (!parsed.ok) {
    return Response.json({ ok: false, error: parsed.error }, { status: parsed.status })
  }
  if (env.DISCORD_GATEWAY) {
    const id = env.DISCORD_GATEWAY.idFromName('lyra')
    await env.DISCORD_GATEWAY.get(id).fetch(
      new Request('https://discord-gateway.internal/voice-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: env.DISCORD_GUILD_ID, channelId: null }),
      }),
    )
  }
  if (!recorderConfigured(env)) {
    return Response.json(
      { ok: false, error: 'recorder_not_configured', sessionId: parsed.value.sessionId },
      { status: 503 },
    )
  }
  const rec = await postRecorder(env, '/stop', parsed.value)
  const recJson = await safeJson(rec)
  return Response.json(
    { ok: rec.ok, sessionId: parsed.value.sessionId, recorder: recJson },
    { status: rec.ok ? 200 : rec.status },
  )
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return { raw: await res.text().catch(() => '') }
  }
}
