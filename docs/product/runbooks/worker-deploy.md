# Deploy — `roxabi-circle` Worker

## Live

| | |
|---|---|
| Worker | `roxabi-circle` |
| URL | https://roxabi-circle.mickael-b5e.workers.dev |
| Health | `GET /health` |
| Interactions | `POST /interactions` |
| Account | Mickael@bouly.io (`b5e90be971920ce406f7b679c4f1cd33`) |
| CF token BW | `cloudflare/roxabi-live-build-token` |

## Deploy

```bash
cd apps/circle-api
source ~/projects/security/vaultwarden/scripts/agent-bw-login.sh
export CLOUDFLARE_API_TOKEN=$(bw get notes "cloudflare/roxabi-live-build-token" | sed -n 's/.*CLOUDFLARE_API_TOKEN: "\([^"]*\)".*/\1/p')
export CLOUDFLARE_ACCOUNT_ID=$(bw get notes "cloudflare/roxabi-live-build-token" | sed -n 's/.*CLOUDFLARE_ACCOUNT_ID: "\([^"]*\)".*/\1/p')

bunx wrangler deploy
# secrets (from .dev.vars / BW) — never commit:
# bunx wrangler secret bulk secrets.json
# bunx wrangler secret put LYRA_GROK_WEBHOOK_URL   # optional; empty/unset = no-op @Lyra forward
```

After deploy, set the Grok webhook on **circle.roxabi.dev** (do not commit the URL):

```bash
cd apps/circle-api
bunx wrangler secret put LYRA_GROK_WEBHOOK_URL
```

## Discord

Interactions Endpoint URL (Developer Portal → Lyra → General):

```text
https://roxabi-circle.mickael-b5e.workers.dev/interactions
```

Discord POSTs a signed PING; Worker must return `{ "type": 1 }` with valid Ed25519 verify.

## Security model

See `docs/product/runbooks/worker-security.md`.
