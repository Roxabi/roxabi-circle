import type { Env } from './types'

/**
 * Roxabi Circle Worker — Discord interactions + GitHub OAuth + scoring.
 * Scaffold: routes are stubs until Discord/GitHub apps are wired.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/health') {
      // Threshold is an intentional open hint (algo open). Do not expose ENVIRONMENT.
      return Response.json({
        ok: true,
        service: 'roxabi-circle',
        scorer: env.SCORER_VERSION,
        acceptThreshold: Number(env.ACCEPT_THRESHOLD),
      })
    }

    if (url.pathname === '/interactions' && request.method === 'POST') {
      return Response.json(
        {
          error: 'not_implemented',
          message: 'Discord interactions handler — wire DISCORD_PUBLIC_KEY first',
        },
        { status: 501 },
      )
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
        endpoints: ['/health', '/interactions', '/oauth/github/start', '/oauth/github/callback'],
      },
      { status: 200 },
    )
  },
} satisfies ExportedHandler<Env>
