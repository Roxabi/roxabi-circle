import { describe, expect, it, vi } from 'vitest'

/** Records which optional peer a module graph actually loads. */
const loaded = vi.hoisted(() => new Set<string>())

vi.mock('@cloudflare/workers-oauth-provider', () => {
  loaded.add('@cloudflare/workers-oauth-provider')
  return {}
})
vi.mock('fastmcp', () => {
  loaded.add('fastmcp')
  return {}
})
vi.mock('fastmcp/edge', () => {
  loaded.add('fastmcp/edge')
  return {}
})

// Dynamic imports on purpose: the test is the load order — root first, then hosted.
describe('@kit/mcp root stays free of the hosted peers', () => {
  it('root barrel loads neither optional peer', async () => {
    await import('./index')
    expect([...loaded]).toEqual([])
  })

  it('hosted barrel loads both (control)', async () => {
    await import('./hosted/index')
    expect([...loaded].sort()).toEqual(['@cloudflare/workers-oauth-provider', 'fastmcp/edge'])
  })
})
