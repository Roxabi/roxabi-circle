import { describe, expect, it } from 'vitest'
import { isLoopbackHost } from './loopback-host'

describe('isLoopbackHost', () => {
  it('accepts localhost, RFC 6761 .localhost, 127/8, and ::1', () => {
    expect(isLoopbackHost('localhost')).toBe(true)
    expect(isLoopbackHost('web.localhost')).toBe(true)
    expect(isLoopbackHost('127.0.0.1')).toBe(true)
    expect(isLoopbackHost('::1')).toBe(true)
    expect(isLoopbackHost('[::1]')).toBe(true)
  })

  it('rejects public hosts', () => {
    expect(isLoopbackHost('example.com')).toBe(false)
    expect(isLoopbackHost('8.8.8.8')).toBe(false)
  })
})
