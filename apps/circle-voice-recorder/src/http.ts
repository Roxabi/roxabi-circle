import { dumpManifest, dumpPlaceholderTrack, dumpUdpProbe } from './dump'
import { opsSecretOk } from './ops-secret'
import {
  addTrack,
  getSession,
  markJoined,
  parseStartBody,
  parseStopBody,
  startSession,
  stopSession,
} from './session'
import { probeUdp } from './udp-probe'
import { joinVoice, leaveVoice } from './voice-join'

export type RecorderEnv = {
  GATEWAY_OPS_SECRET?: string
  VOICE_RECORD_DUMP_DIR?: string
  R2_HTTP_PUT_PREFIX?: string
}

export async function handleRecorderRequest(
  request: Request,
  env: RecorderEnv = process.env,
): Promise<Response> {
  const url = new URL(request.url)
  if (url.pathname === '/health' && request.method === 'GET') {
    const s = getSession()
    return Response.json({
      ok: true,
      service: 'circle-voice-recorder',
      spike: 'A',
      sessionId: s?.sessionId ?? null,
    })
  }

  if (request.method !== 'POST') {
    return Response.json({ error: 'not_found' }, { status: 404 })
  }
  if (!opsSecretOk(request, env.GATEWAY_OPS_SECRET)) {
    return new Response('unauthorized', { status: 401 })
  }

  if (url.pathname === '/udp-probe') {
    const probe = await probeUdp()
    const s = getSession()
    if (s) await dumpUdpProbe(env, s, probe)
    return Response.json({ ok: probe.ok, probe })
  }

  if (url.pathname === '/start') {
    return handleStart(request, env)
  }
  if (url.pathname === '/stop') {
    return handleStop(request, env)
  }
  return Response.json({ error: 'not_found' }, { status: 404 })
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

async function handleStart(request: Request, env: RecorderEnv): Promise<Response> {
  const parsed = parseStartBody(await readJson(request))
  if (!parsed.ok) {
    return Response.json({ ok: false, error: parsed.error }, { status: 400 })
  }
  const session = startSession(parsed)
  const join = await joinVoice({
    guildId: parsed.guildId,
    channelId: parsed.channelId,
    voice: parsed.voice,
  })
  if (!join.ok) {
    stopSession()
    return Response.json({ ok: false, error: join.error }, { status: 500 })
  }
  markJoined(join.mode)
  const placeholderUser = parsed.voice?.userId ?? 'placeholder-self'
  const dumped = await dumpPlaceholderTrack(env, session, placeholderUser)
  addTrack(placeholderUser, dumped.key)
  await dumpManifest(env, session, session.tracks, { join })
  return Response.json({
    ok: true,
    sessionId: session.sessionId,
    join,
    tracks: session.tracks,
    uploaded: dumped.uploaded,
  })
}

async function handleStop(request: Request, env: RecorderEnv): Promise<Response> {
  const parsed = parseStopBody(await readJson(request))
  if (!parsed.ok) {
    return Response.json({ ok: false, error: parsed.error }, { status: 400 })
  }
  const session = getSession()
  if (!session || session.sessionId !== parsed.sessionId) {
    return Response.json({ ok: false, error: 'session_not_found' }, { status: 404 })
  }
  await leaveVoice()
  const stopped = stopSession()
  if (!stopped) {
    return Response.json({ ok: false, error: 'session_not_found' }, { status: 404 })
  }
  const manifest = await dumpManifest(env, stopped, stopped.tracks, {
    stoppedAt: new Date().toISOString(),
  })
  return Response.json({
    ok: true,
    sessionId: stopped.sessionId,
    tracks: stopped.tracks,
    manifestKey: manifest.key,
    uploaded: manifest.uploaded,
  })
}
