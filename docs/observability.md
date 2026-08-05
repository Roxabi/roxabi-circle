# Observability (Chemin A kit)

## Always on (default)

- **Structured logs** via `@kit/core` `createLogger` / `child({ requestId })`
- Cloudflare Workers log stream (JSON lines)
- `x-request-id` + body `requestId` on API errors

## Optional (env-guarded — not kit defaults)

| Need | Tool | Notes |
|------|------|--------|
| Error tracking | Sentry (or GlitchTip) | Wire SDK only when `SENTRY_DSN` set |
| Aggregated logs + uptime | Better Stack | Prod optional |
| Web analytics | Plausible | Public sites only |
| Product analytics | PostHog | Only if real product events |

**Do not** enable Sentry + PostHog + Plausible Session Replay together without reason.

## Example (commented — do not paste secrets)

```ts
// if (env.SENTRY_DSN) {
//   // init Sentry Workers SDK with release + requestId tag
// }
```

## Local

- `console` JSON is enough for `wrangler dev`
- Mailpit UI for email (see `docker-compose.yml`)
