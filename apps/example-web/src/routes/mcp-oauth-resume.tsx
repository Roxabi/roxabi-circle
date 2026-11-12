import { type AnyRoute, createRoute, useSearch } from '@tanstack/react-router'
import { useEffect } from 'react'
import { parseMcpAuthorizeResumeUrl } from '../lib/safe-return-path'

/**
 * Public bounce after Better Auth login. `r` is a loopback `/authorize` URL
 * (allowlisted). Hands off to the API ticket mint — never an MCP token.
 */
function McpOAuthResumePage() {
  const { r } = useSearch({ from: '/mcp-oauth/resume' })
  useEffect(() => {
    const resume = parseMcpAuthorizeResumeUrl(typeof r === 'string' ? r : '')
    if (!resume) return
    window.location.assign(`/api/mcp-identity/ticket?resume=${encodeURIComponent(resume)}`)
  }, [r])
  return <p>Returning to MCP authorize…</p>
}

export function createMcpOAuthResumeRoute(parent: AnyRoute) {
  return createRoute({
    getParentRoute: () => parent,
    path: '/mcp-oauth/resume',
    validateSearch: (search: Record<string, unknown>) => ({
      r: typeof search.r === 'string' ? search.r : undefined,
    }),
    component: McpOAuthResumePage,
  })
}
