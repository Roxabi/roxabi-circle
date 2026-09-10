import { isSnowflake, isVoiceSessionId, newVoiceSessionId } from './ids'

export type VoiceRecordStartInput = {
  guildId: string
  channelId: string
  sessionId: string
}

export type VoiceRecordStopInput = {
  sessionId: string
}

export type VoiceRecordParseFail = { ok: false; error: string; status: 400 }

export type VoiceRecordStartOk = { ok: true; value: VoiceRecordStartInput }
export type VoiceRecordStopOk = { ok: true; value: VoiceRecordStopInput }

export function parseVoiceRecordStart(
  body: unknown,
  opts?: { generateSessionId?: () => string },
): VoiceRecordStartOk | VoiceRecordParseFail {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'invalid_json', status: 400 }
  }
  const rec = body as Record<string, unknown>
  if (!isSnowflake(rec.guildId)) {
    return { ok: false, error: 'invalid_guild_id', status: 400 }
  }
  if (!isSnowflake(rec.channelId)) {
    return { ok: false, error: 'invalid_channel_id', status: 400 }
  }
  let sessionId: string
  if (rec.sessionId === undefined || rec.sessionId === null || rec.sessionId === '') {
    sessionId = (opts?.generateSessionId ?? newVoiceSessionId)()
  } else if (isVoiceSessionId(rec.sessionId)) {
    sessionId = rec.sessionId
  } else {
    return { ok: false, error: 'invalid_session_id', status: 400 }
  }
  return { ok: true, value: { guildId: rec.guildId, channelId: rec.channelId, sessionId } }
}

export function parseVoiceRecordStop(body: unknown): VoiceRecordStopOk | VoiceRecordParseFail {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'invalid_json', status: 400 }
  }
  const rec = body as Record<string, unknown>
  if (!isVoiceSessionId(rec.sessionId)) {
    return { ok: false, error: 'invalid_session_id', status: 400 }
  }
  return { ok: true, value: { sessionId: rec.sessionId } }
}

/** Reject recording the temp-voice hub itself (join hub = spawn room, not a session). */
export function assertNotVoiceHub(
  channelId: string,
  hubChannelId: string | undefined,
): VoiceRecordParseFail | { ok: true } {
  if (hubChannelId && channelId === hubChannelId) {
    return { ok: false, error: 'channel_is_voice_hub', status: 400 }
  }
  return { ok: true }
}

export function assertGuildMatches(
  guildId: string,
  configuredGuildId: string | undefined,
): VoiceRecordParseFail | { ok: true } {
  if (configuredGuildId && guildId !== configuredGuildId) {
    return { ok: false, error: 'guild_mismatch', status: 400 }
  }
  return { ok: true }
}
