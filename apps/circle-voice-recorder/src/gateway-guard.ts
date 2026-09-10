/** Forbidden hosts — opening these with the Lyra token kicks DiscordGateway. */
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

export function assertNotDiscordGateway(url: string): void {
  if (isDiscordGatewayUrl(url)) {
    throw new Error('SPIKE_A_FORBIDDEN_SECOND_GATEWAY')
  }
}
