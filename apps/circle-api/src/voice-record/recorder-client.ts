import { VOICE_RECORDER_INSTANCE } from './constants'
import type { VoiceHandoff } from './handoff'
import type { VoiceRecordStartInput } from './payload'

export type RecorderEnv = {
  VOICE_RECORDER?: DurableObjectNamespace
  VOICE_RECORDER_HTTP_URL?: string
  GATEWAY_OPS_SECRET: string
}

export function recorderConfigured(env: RecorderEnv): boolean {
  return Boolean(env.VOICE_RECORDER || env.VOICE_RECORDER_HTTP_URL?.trim())
}

function recorderHeaders(secret: string): Headers {
  return new Headers({
    'Content-Type': 'application/json',
    'X-Ops-Secret': secret,
  })
}

export async function postRecorder(
  env: RecorderEnv,
  path: '/start' | '/stop' | '/udp-probe',
  body: unknown,
): Promise<Response> {
  const init: RequestInit = {
    method: 'POST',
    headers: recorderHeaders(env.GATEWAY_OPS_SECRET),
    body: JSON.stringify(body),
  }
  if (env.VOICE_RECORDER) {
    const id = env.VOICE_RECORDER.idFromName(VOICE_RECORDER_INSTANCE)
    return env.VOICE_RECORDER.get(id).fetch(
      new Request(`https://voice-recorder.internal${path}`, init),
    )
  }
  const base = env.VOICE_RECORDER_HTTP_URL?.replace(/\/$/, '')
  if (!base) {
    return Response.json({ ok: false, error: 'recorder_not_configured' }, { status: 503 })
  }
  return fetch(`${base}${path}`, init)
}

export function startBodyForRecorder(
  input: VoiceRecordStartInput,
  handoff: VoiceHandoff | null,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    sessionId: input.sessionId,
    guildId: input.guildId,
    channelId: input.channelId,
  }
  if (handoff?.endpoint && handoff.token && handoff.sessionId && handoff.userId) {
    body.voice = {
      endpoint: handoff.endpoint,
      token: handoff.token,
      sessionId: handoff.sessionId,
      userId: handoff.userId,
    }
  }
  return body
}
