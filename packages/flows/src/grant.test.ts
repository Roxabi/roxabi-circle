import { describe, expect, it } from 'vitest'
import { MAX_PERMIT_TOOLS } from './constants'
import { parseCapabilityGrant } from './grant'

/**
 * Direct tests for `parseCapabilityGrant` — **shape only**.
 *
 * ADR-0005 D4 § Authority split states that `CapabilityGrant` is pure arithmetic and that
 * grant *provenance* is an app-layer duty (apps mint from server session / org module policy,
 * residual until #31). This parse boundary therefore cannot and does not enforce provenance.
 * What it does enforce, and what these tests pin: every field is explicit, nothing is
 * defaulted or coerced, and nothing extra survives into the parsed grant.
 */

const validGrant = {
  orgId: 'org_1',
  allowedTools: ['echo', 'write_demo'],
  registryVersion: 'reg-1',
  allowsInfer: false,
}

const expectRejected = (input: unknown): string => {
  const r = parseCapabilityGrant(input)
  expect(r.ok).toBe(false)
  if (r.ok) throw new Error('expected rejection')
  expect(r.message.length).toBeGreaterThan(0)
  return r.message
}

describe('parseCapabilityGrant — accepts only a fully explicit grant', () => {
  it('parses a valid grant and preserves every field', () => {
    const r = parseCapabilityGrant(validGrant)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.grant.orgId).toBe('org_1')
    expect(r.grant.allowedTools).toEqual(['echo', 'write_demo'])
    expect(r.grant.registryVersion).toBe('reg-1')
    expect(r.grant.allowsInfer).toBe(false)
  })

  it('accepts exactly MAX_PERMIT_TOOLS tools (boundary)', () => {
    const tools = Array.from({ length: MAX_PERMIT_TOOLS }, (_, i) => `t${i}`)
    const r = parseCapabilityGrant({ ...validGrant, allowedTools: tools })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.grant.allowedTools).toHaveLength(MAX_PERMIT_TOOLS)
  })
})

describe('parseCapabilityGrant — allowsInfer is never inferred', () => {
  it('rejects a grant with allowsInfer missing (no default)', () => {
    const { allowsInfer: _omitted, ...withoutInfer } = validGrant
    expectRejected(withoutInfer)
  })

  it('rejects a string "true" for allowsInfer (no coercion)', () => {
    expectRejected({ ...validGrant, allowsInfer: 'true' })
  })

  it('rejects a truthy non-boolean for allowsInfer', () => {
    expectRejected({ ...validGrant, allowsInfer: 1 })
  })

  it('rejects null for allowsInfer', () => {
    expectRejected({ ...validGrant, allowsInfer: null })
  })
})

describe('parseCapabilityGrant — nothing extra survives', () => {
  it('rejects an unknown key (strict object)', () => {
    expectRejected({ ...validGrant, escalate: true })
  })

  it('rejects an unknown key even when it looks like a permits field', () => {
    expectRejected({ ...validGrant, permits: { tools: ['fetch_url'] } })
  })

  /**
   * `.strict()` alone does not cover this: `JSON.parse` creates an own `__proto__` key that zod
   * does not report as unknown. The schema rejects it explicitly before the object stage.
   */
  it('rejects an own __proto__ key', () => {
    const polluted = JSON.parse(
      '{"orgId":"org_1","allowedTools":["echo"],"registryVersion":"reg-1","allowsInfer":false,"__proto__":{"allowsInfer":true}}',
    )
    expectRejected(polluted)
    // And no ambient damage on the way through.
    expect(({} as Record<string, unknown>).allowsInfer).toBeUndefined()
  })

  it.each([['constructor'], ['prototype'], ['__lookupGetter__']])('rejects a %s key', (key) => {
    const input = JSON.parse(
      `{"orgId":"org_1","allowedTools":["echo"],"registryVersion":"reg-1","allowsInfer":false,"${key}":1}`,
    )
    expectRejected(input)
  })

  it('copies allowedTools — mutating the caller array cannot widen a parsed grant', () => {
    const tools = ['echo']
    const r = parseCapabilityGrant({ ...validGrant, allowedTools: tools })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    tools.push('write_demo')
    expect(r.grant.allowedTools).toEqual(['echo'])
  })
})

describe('parseCapabilityGrant — isolation fields are mandatory', () => {
  it('rejects an empty orgId', () => {
    expectRejected({ ...validGrant, orgId: '' })
  })

  it('rejects a missing orgId', () => {
    const { orgId: _omitted, ...withoutOrg } = validGrant
    expectRejected(withoutOrg)
  })

  it('rejects an orgId longer than 256 chars', () => {
    expectRejected({ ...validGrant, orgId: 'o'.repeat(257) })
  })

  it('rejects a missing registryVersion (no silent pin)', () => {
    const { registryVersion: _omitted, ...withoutVersion } = validGrant
    expectRejected(withoutVersion)
  })

  it('rejects an empty registryVersion', () => {
    expectRejected({ ...validGrant, registryVersion: '' })
  })
})

describe('parseCapabilityGrant — tool names are constrained', () => {
  it.each([
    ['path-shaped', '../etc/passwd'],
    ['slash-bearing', 'net/fetch'],
    ['space-bearing', 'write demo'],
    ['leading hyphen', '-echo'],
    ['leading digit', '1echo'],
    ['empty', ''],
  ])('rejects a %s tool name', (_label, name) => {
    expectRejected({ ...validGrant, allowedTools: [name] })
  })

  it('rejects more than MAX_PERMIT_TOOLS tools', () => {
    const tools = Array.from({ length: MAX_PERMIT_TOOLS + 1 }, (_, i) => `t${i}`)
    expectRejected({ ...validGrant, allowedTools: tools })
  })

  it('rejects a non-array allowedTools', () => {
    expectRejected({ ...validGrant, allowedTools: 'echo' })
  })
})

describe('parseCapabilityGrant — never throws on hostile input', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'grant'],
    ['a number', 42],
    ['an array', []],
    ['a boolean', true],
  ])('rejects %s with a message instead of throwing', (_label, input) => {
    expect(() => parseCapabilityGrant(input)).not.toThrow()
    expectRejected(input)
  })
})
