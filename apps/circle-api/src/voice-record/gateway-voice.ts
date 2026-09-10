/**
 * Gateway Opcode 4 (Voice State Update) — sent on the existing DiscordGateway WS.
 * Never open a second gateway.discord.gg socket.
 */
export type VoiceStateUpdateOp = {
  op: 4
  d: {
    guild_id: string
    channel_id: string | null
    self_mute: boolean
    self_deaf: boolean
  }
}

export function buildVoiceStateUpdateOp(input: {
  guildId: string
  channelId: string | null
  selfMute?: boolean
  selfDeaf?: boolean
}): VoiceStateUpdateOp {
  return {
    op: 4,
    d: {
      guild_id: input.guildId,
      channel_id: input.channelId,
      // Mute so Lyra does not speak into the recording.
      self_mute: input.selfMute ?? true,
      // Deaf false — we must receive other speakers' streams.
      self_deaf: input.selfDeaf ?? false,
    },
  }
}

export function sendVoiceStateUpdate(ws: WebSocket, op: VoiceStateUpdateOp): void {
  ws.send(JSON.stringify(op))
}

export const DISCORD_GATEWAY_HOSTS = ['gateway.discord.gg', 'gateway.discord.com']

export function isDiscordGatewayUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return DISCORD_GATEWAY_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))
  } catch {
    const lower = url.toLowerCase()
    return DISCORD_GATEWAY_HOSTS.some((h) => lower.includes(h))
  }
}
