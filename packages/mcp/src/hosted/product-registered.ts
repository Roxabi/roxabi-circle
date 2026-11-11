import type { ClientInfo, OAuthHelpers } from '@cloudflare/workers-oauth-provider'

const PRODUCT_CLIENT_PREFIX = 'mcp_product_client:'

/**
 * Positive receipt that this shell's trusted helper registered the client. Open
 * DCR and bare `OAuthHelpers.createClient` never write it. Absence fail-closes
 * under `skip` (show the page), including when Cloudflare KV has not yet made a
 * just-written receipt visible.
 */
async function markProductRegistered(kv: KVNamespace, clientId: string): Promise<void> {
  if (clientId === '') throw new Error('Product client id is empty')
  await kv.put(`${PRODUCT_CLIENT_PREFIX}${clientId}`, '1')
}

/** True only when a positive product receipt is visible for `clientId`. */
export async function isProductRegistered(kv: KVNamespace, clientId: string): Promise<boolean> {
  return (await kv.get(`${PRODUCT_CLIENT_PREFIX}${clientId}`)) !== null
}

/**
 * Product registration path for `consent: 'skip'`. Calls public `createClient`,
 * then stores a package-owned receipt. Not an allowlist: any id the helper
 * returns is attested. Bare `helpers.createClient` stays unmarked.
 */
export async function createProductClient(
  helpers: Pick<OAuthHelpers, 'createClient'>,
  kv: KVNamespace,
  clientInfo: Partial<ClientInfo>,
): Promise<ClientInfo> {
  const client = await helpers.createClient(clientInfo)
  await markProductRegistered(kv, client.clientId)
  return client
}
