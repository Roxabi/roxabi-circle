import { handleDiscordInteractions } from './discord/interactions'
import type { Env } from './types'

export { DiscordGateway } from './discord/gateway'

async function ensureDiscordGateway(env: Env): Promise<void> {
  if (!env.DISCORD_GATEWAY) return
  const id = env.DISCORD_GATEWAY.idFromName('lyra')
  const stub = env.DISCORD_GATEWAY.get(id)
  await stub.fetch(new Request('https://discord-gateway.internal/ensure'))
}

/**
 * Roxabi Circle Worker — Discord interactions + Gateway (#github-to-watch) + GitHub OAuth + scoring.
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/health') {
      // Best-effort keep Gateway warm (also on cron).
      ctx.waitUntil(ensureDiscordGateway(env).catch(() => undefined))
      return Response.json({
        ok: true,
        service: 'roxabi-circle',
        scorer: env.SCORER_VERSION,
        acceptThreshold: Number(env.ACCEPT_THRESHOLD),
      })
    }

    if (url.pathname === '/internal/discord-gateway/ensure' && request.method === 'POST') {
      // Optional manual wake (local ops). Not secret-gated: only starts connection with bot token already in env.
      await ensureDiscordGateway(env)
      const id = env.DISCORD_GATEWAY.idFromName('lyra')
      return env.DISCORD_GATEWAY.get(id).fetch(
        new Request('https://discord-gateway.internal/status'),
      )
    }

    if (url.pathname === '/interactions' && request.method === 'POST') {
      return handleDiscordInteractions(request, env)
    }

    if (url.pathname.startsWith('/oauth/github')) {
      return Response.json(
        {
          error: 'not_implemented',
          message: 'GitHub OAuth — wire GITHUB_CLIENT_ID/SECRET first',
        },
        { status: 501 },
      )
    }

    return Response.json(
      {
        service: 'roxabi-circle',
        docs: 'https://github.com/Roxabi/roxabi-circle',
        endpoints: [
          '/health',
          '/interactions',
          '/oauth/github/start',
          '/oauth/github/callback',
          '/internal/discord-gateway/ensure',
        ],
      },
      { status: 200 },
    )
  },

  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(ensureDiscordGateway(env).catch((e) => console.error('gateway ensure', e)))
  },
} satisfies ExportedHandler<Env>
