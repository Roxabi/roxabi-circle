/**
 * Voice UDP credentials captured from the existing DiscordGateway socket.
 * token = VOICE_SERVER_UPDATE token (not the bot token). Never log it.
 */
export const VOICE_HANDOFF_KEY = 'voice_record_handoff_v1'

export type VoiceHandoff = {
  guildId: string
  channelId: string | null
  endpoint: string | null
  token: string | null
  sessionId: string | null
  userId: string | null
  updatedAt: number
}

export function emptyVoiceHandoff(): VoiceHandoff {
  return {
    guildId: '',
    channelId: null,
    endpoint: null,
    token: null,
    sessionId: null,
    userId: null,
    updatedAt: 0,
  }
}

export function applyVoiceServerUpdate(
  prev: VoiceHandoff,
  d: { token?: string; endpoint?: string; guild_id?: string },
  now = Date.now(),
): VoiceHandoff {
  return {
    ...prev,
    guildId: d.guild_id ?? prev.guildId,
    endpoint: d.endpoint ?? null,
    token: d.token ?? null,
    updatedAt: now,
  }
}

export function applyBotVoiceState(
  prev: VoiceHandoff,
  d: {
    session_id?: string
    user_id?: string
    channel_id?: string | null
    guild_id?: string | null
  },
  now = Date.now(),
): VoiceHandoff {
  return {
    ...prev,
    guildId: d.guild_id ?? prev.guildId,
    channelId: d.channel_id ?? null,
    sessionId: d.session_id ?? prev.sessionId,
    userId: d.user_id ?? prev.userId,
    updatedAt: now,
  }
}

export function handoffReady(h: VoiceHandoff): boolean {
  return Boolean(h.endpoint && h.token && h.sessionId && h.userId && h.guildId)
}

/** Public JSON — voice token stripped. */
export function handoffPublicView(h: VoiceHandoff): Record<string, unknown> {
  return {
    guildId: h.guildId,
    channelId: h.channelId,
    endpoint: h.endpoint,
    hasToken: Boolean(h.token),
    sessionId: h.sessionId,
    userId: h.userId,
    updatedAt: h.updatedAt,
    ready: handoffReady(h),
  }
}
