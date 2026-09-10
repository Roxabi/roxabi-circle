import { assertNotDiscordGateway } from './gateway-guard'
import type { VoiceHandoffCreds } from './session'

/**
 * Custom @discordjs/voice adapter: injects Worker-minted handoff.
 * sendPayload is a no-op — Opcode 4 already went out on DiscordGateway.
 *
 * Voice WebSocket (*.discord.media) + UDP are allowed. gateway.discord.gg is not.
 */
export function createHandoffAdapterCreator(input: {
  guildId: string
  channelId: string
  voice: VoiceHandoffCreds
}): unknown {
  assertNotDiscordGateway(`https://${input.voice.endpoint.replace(/^wss?:\/\//, '')}`)
  return (methods: {
    onVoiceServerUpdate: (d: Record<string, string>) => void
    onVoiceStateUpdate: (d: Record<string, string>) => void
  }) => {
    queueMicrotask(() => {
      methods.onVoiceServerUpdate({
        token: input.voice.token,
        endpoint: input.voice.endpoint,
        guild_id: input.guildId,
      })
      methods.onVoiceStateUpdate({
        session_id: input.voice.sessionId,
        user_id: input.voice.userId,
        channel_id: input.channelId,
        guild_id: input.guildId,
      })
    })
    return {
      sendPayload: () => true,
      destroy: () => undefined,
    }
  }
}

export type JoinResult =
  | { ok: true; mode: 'handoff'; library: string }
  | { ok: true; mode: 'placeholder'; reason: string }
  | { ok: false; error: string }

export async function joinVoice(input: {
  guildId: string
  channelId: string
  voice: VoiceHandoffCreds | null
}): Promise<JoinResult> {
  if (!input.voice) {
    return { ok: true, mode: 'placeholder', reason: 'no_handoff_placeholder_tracks' }
  }
  try {
    assertNotDiscordGateway(
      input.voice.endpoint.startsWith('http')
        ? input.voice.endpoint
        : `https://${input.voice.endpoint}`,
    )
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'forbidden_gateway' }
  }

  try {
    const voice = await import('@discordjs/voice')
    const adapterCreator = createHandoffAdapterCreator({
      guildId: input.guildId,
      channelId: input.channelId,
      voice: input.voice,
    })
    voice.joinVoiceChannel({
      channelId: input.channelId,
      guildId: input.guildId,
      selfDeaf: false,
      selfMute: true,
      adapterCreator: adapterCreator as never,
    })
    return { ok: true, mode: 'handoff', library: '@discordjs/voice' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'join_failed'
    if (msg.includes('SPIKE_A_FORBIDDEN_SECOND_GATEWAY')) {
      return { ok: false, error: msg }
    }
    // Image without native opus / missing package — still dump placeholders.
    return { ok: true, mode: 'placeholder', reason: msg }
  }
}

export async function leaveVoice(): Promise<void> {
  try {
    const voice = await import('@discordjs/voice')
    const { getVoiceConnections } = voice
    if (typeof getVoiceConnections === 'function') {
      for (const conn of getVoiceConnections().values()) {
        conn.destroy()
      }
    }
  } catch {
    /* library optional at unit-test time */
  }
}
