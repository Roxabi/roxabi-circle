import { createMcpWorker } from './create-mcp-worker'
import { createBetterAuthTicketIdentityPort } from './identity-port'

export default createMcpWorker({
  identityPort: createBetterAuthTicketIdentityPort(),
})
