import { runGithubDigest } from './discord/github-digest'
import { isDigestCron } from './discord/github-digest-schedule'
import { handleDiscordInteractions } from './discord/interactions'
import type { Env } from './types'

export { DiscordGateway } from './discord/gateway'

async function ensureDiscordGateway(env: Env, opts?: { force?: boolean }): Promise<void> {
  if (!env.DISCORD_GATEWAY) return
  const id = env.DISCORD_GATEWAY.idFromName('lyra')
  const stub = env.DISCORD_GATEWAY.get(id)
  const path = opts?.force
    ? 'https://discord-gateway.internal/ensure?force=1'
    : 'https://discord-gateway.internal/ensure'
  await stub.fetch(new Request(path))
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
 * Roxabi Circle Worker — Discord interactions + Gateway (links channels) + GitHub OAuth + scoring.
 * Public host: https://circle.roxabi.dev
 */
export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/health') {
      // Pure liveness — do NOT wake Gateway (public probes must not burn IDENTIFY sessions).
      return Response.json({
        ok: true,
        service: 'roxabi-circle',
        scorer: env.SCORER_VERSION,
        acceptThreshold: Number(env.ACCEPT_THRESHOLD),
      })
    }

    if (url.pathname === '/internal/github-digest' && request.method === 'POST') {
      if (!opsSecretOk(request, env.GATEWAY_OPS_SECRET)) {
        return new Response('unauthorized', { status: 401 })
      }
      const result = await runGithubDigest(env, { skipTimeCheck: true })
      return Response.json(result, { status: result.ok ? 200 : 502 })
    }

    if (url.pathname === '/internal/discord-gateway/ensure' && request.method === 'POST') {
      // Cron wakes via scheduled(); manual wake requires GATEWAY_OPS_SECRET.
      // ?force=1 clears hard-stop circuit (use after token rotate).
      if (!opsSecretOk(request, env.GATEWAY_OPS_SECRET)) {
        return new Response('unauthorized', { status: 401 })
      }
      const force =
        url.searchParams.get('force') === '1' ||
        url.searchParams.get('force') === 'true' ||
        request.headers.get('X-Gateway-Force') === '1'
      await ensureDiscordGateway(env, { force })
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

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (isDigestCron(controller.cron)) {
      ctx.waitUntil(
        runGithubDigest(env)
          .then((r) => console.log('github-digest', r))
          .catch((e) => console.error('github-digest', e)),
      )
      return
    }
    ctx.waitUntil(ensureDiscordGateway(env).catch((e) => console.error('gateway ensure', e)))
  },
} satisfies ExportedHandler<Env>
