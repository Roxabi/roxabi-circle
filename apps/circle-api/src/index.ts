import { handleDiscordInteractions } from './discord/interactions'
import type { Env } from './types'

export { DiscordGateway } from './discord/gateway'

async function ensureDiscordGateway(env: Env): Promise<void> {
  if (!env.DISCORD_GATEWAY) return
  const id = env.DISCORD_GATEWAY.idFromName('lyra')
  const stub = env.DISCORD_GATEWAY.get(id)
  await stub.fetch(new Request('https://discord-gateway.internal/ensure'))
}

/** Constant-time-ish compare for ops secret (length leak ok for ops header). */
function opsSecretOk(request: Request, expected: string | undefined): boolean {
  if (!expected) return false
  const header =
    request.headers.get('X-Ops-Secret') ??
    request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ??
    ''
  if (header.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= header.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}

/**
 * Roxabi Circle Worker — Discord interactions + Gateway (#github-to-watch) + GitHub OAuth + scoring.
 * Public host: https://circle.roxabi.dev
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
      // Cron wakes via scheduled(); manual wake requires GATEWAY_OPS_SECRET.
      if (!opsSecretOk(request, env.GATEWAY_OPS_SECRET)) {
        return new Response('unauthorized', { status: 401 })
      }
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

    return Response.json({ error: 'not_found' }, { status: 404 })
  },

  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(ensureDiscordGateway(env).catch((e) => console.error('gateway ensure', e)))
  },
} satisfies ExportedHandler<Env>
