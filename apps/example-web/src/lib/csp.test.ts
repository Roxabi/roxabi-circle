import { describe, expect, it } from 'vitest'
import { buildSpaCsp, spaConnectSrc } from './csp'

describe('buildSpaCsp', () => {
  it('same-origin only when API base is empty (dev proxy)', () => {
    const csp = buildSpaCsp(undefined)
    expect(spaConnectSrc(undefined)).toEqual(["'self'"])
    expect(csp).toContain("connect-src 'self'")
    expect(csp).not.toContain('api.boilerplate.roxabi.dev')
    expect(csp).not.toContain('ws:')
    expect(csp).toContain("frame-ancestors 'none'")
  })

  it('adds VITE_API_URL origin for split-origin showcase', () => {
    const csp = buildSpaCsp('https://api.boilerplate.roxabi.dev')
    expect(csp).toContain('https://api.boilerplate.roxabi.dev')
    expect(csp).not.toContain('ws:')
    expect(csp).not.toContain('wss:')
  })
})
