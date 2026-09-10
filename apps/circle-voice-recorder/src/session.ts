export type VoiceHandoffCreds = {
  endpoint: string
  token: string
  sessionId: string
  userId: string
}

export type RecorderSession = {
  sessionId: string
  guildId: string
  channelId: string
  startedAt: string
  voice: VoiceHandoffCreds | null
  tracks: Array<{ userId: string; key: string }>
  joined: boolean
  joinMode: 'handoff' | 'placeholder' | 'idle'
}

let current: RecorderSession | null = null

export function getSession(): RecorderSession | null {
  return current
}

export function startSession(input: {
  sessionId: string
  guildId: string
  channelId: string
  voice?: VoiceHandoffCreds | null
  now?: string
}): RecorderSession {
  current = {
    sessionId: input.sessionId,
    guildId: input.guildId,
    channelId: input.channelId,
    startedAt: input.now ?? new Date().toISOString(),
    voice: input.voice ?? null,
    tracks: [],
    joined: false,
    joinMode: 'idle',
  }
  return current
}

export function markJoined(mode: RecorderSession['joinMode']): void {
  if (current) {
    current.joined = true
    current.joinMode = mode
  }
}

export function addTrack(userId: string, key: string): void {
  if (!current) return
  if (!current.tracks.some((t) => t.userId === userId)) {
    current.tracks.push({ userId, key })
  }
}

export function stopSession(): RecorderSession | null {
  const prev = current
  current = null
  return prev
}

const SNOWFLAKE = /^\d{17,20}$/
const SESSION_ID = /^vr_[a-z0-9]+_[a-z0-9]+$/

export function parseStartBody(body: unknown):
  | {
      ok: true
      sessionId: string
      guildId: string
      channelId: string
      voice: VoiceHandoffCreds | null
    }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'invalid_json' }
  const rec = body as Record<string, unknown>
  if (typeof rec.sessionId !== 'string' || !SESSION_ID.test(rec.sessionId)) {
    return { ok: false, error: 'invalid_session_id' }
  }
  if (typeof rec.guildId !== 'string' || !SNOWFLAKE.test(rec.guildId)) {
    return { ok: false, error: 'invalid_guild_id' }
  }
  if (typeof rec.channelId !== 'string' || !SNOWFLAKE.test(rec.channelId)) {
    return { ok: false, error: 'invalid_channel_id' }
  }
  let voice: VoiceHandoffCreds | null = null
  if (rec.voice && typeof rec.voice === 'object') {
    const v = rec.voice as Record<string, unknown>
    if (
      typeof v.endpoint === 'string' &&
      typeof v.token === 'string' &&
      typeof v.sessionId === 'string' &&
      typeof v.userId === 'string' &&
      v.endpoint &&
      v.token &&
      v.sessionId &&
      v.userId
    ) {
      voice = {
        endpoint: v.endpoint,
        token: v.token,
        sessionId: v.sessionId,
        userId: v.userId,
      }
    }
  }
  return {
    ok: true,
    sessionId: rec.sessionId,
    guildId: rec.guildId,
    channelId: rec.channelId,
    voice,
  }
}

export function parseStopBody(
  body: unknown,
): { ok: true; sessionId: string } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'invalid_json' }
  const rec = body as Record<string, unknown>
  if (typeof rec.sessionId !== 'string' || !SESSION_ID.test(rec.sessionId)) {
    return { ok: false, error: 'invalid_session_id' }
  }
  return { ok: true, sessionId: rec.sessionId }
}
