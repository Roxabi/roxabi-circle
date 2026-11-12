/**
 * Identity port for hosted MCP OAuth authorize.
 * Resolves the human. NEVER mints MCP access tokens (ADR-0015).
 */

export type McpIdentity = {
  userId: string
  email?: string
}

export type McpIdentityResolveInput = {
  request: Request
  /** Kit API origin that mints/redeems the one-time identity ticket. */
  apiBaseUrl: string
}

/**
 * Kit default = Better Auth via a one-time ticket on the API origin.
 * Products may plug another resolver. The port must not call completeAuthorization.
 */
export type McpIdentityPort = {
  resolve(input: McpIdentityResolveInput): Promise<McpIdentity | Response>
}
