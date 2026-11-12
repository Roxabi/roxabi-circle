import { handleWhoamiFromMcpIdentity, type McpIdentityPort } from '@kit/mcp'
import { createHostedMcpWorker } from '@kit/mcp/hosted'
import { createExampleCatalogue } from './catalogue'
import type { McpExampleEnv } from './worker-env'

/** Dogfood exception only. The package default is always-show. */
const DEMO_AUTO_APPROVE_EMAIL = 'demo@kit.local'

export function createMcpWorker(opts: { identityPort: McpIdentityPort }) {
  return createHostedMcpWorker<McpExampleEnv>({
    name: 'kit-mcp-example',
    version: '0.0.1',
    consent: { mode: 'demo-loopback', email: DEMO_AUTO_APPROVE_EMAIL },
    identityPort: opts.identityPort,
    apiBaseUrl: (env) => env.API_BASE_URL ?? '',
    register(server, { identity }) {
      createExampleCatalogue(async () => handleWhoamiFromMcpIdentity(identity)).registerAll(server)
    },
  })
}
