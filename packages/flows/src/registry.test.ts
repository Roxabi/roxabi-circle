import { describe, expect, it } from 'vitest'
import { mintCapabilityGrant } from './mint'
import { createToolRegistry } from './registry'

/**
 * `grantClass` is the declared authority class `mintCapabilityGrant` selects on and `checkPlan`
 * re-verifies (Roxabi/roxabi-boilerplate-cf#243, ADR-0005 D4 amendment). `effect` is a separate retry hint (Roxabi/roxabi-boilerplate-cf#234): it must
 * not move the digest, must not widen the mint allowlist, and absent/unknown fails closed to write.
 */
describe('createToolRegistry — contentDigest seals grant classes, not just names', () => {
  it('reclassifying a tool changes the digest under an unchanged version label', () => {
    const permissive = createToolRegistry('reg-1', [
      { name: 'echo', grantClass: 'mintable' },
      { name: 'write_demo', grantClass: 'never' },
    ])
    const tightened = createToolRegistry('reg-1', [
      { name: 'echo', grantClass: 'never' },
      { name: 'write_demo', grantClass: 'never' },
    ])

    expect(tightened.version).toBe(permissive.version)
    expect(tightened.contentDigest).not.toBe(permissive.contentDigest)
  })

  it('refuses an undeclared or unknown class instead of defaulting to unmintable', () => {
    // Untyped input — a product config, a `.map()`, a stale key after the Roxabi/roxabi-boilerplate-cf#243 rename.
    // The missing decision fails loudly here; it used to mint an empty grant that read as policy.
    expect(() => createToolRegistry('reg-1', [{ name: 'echo' }] as never)).toThrow(
      /no usable grant class/,
    )
    expect(() => createToolRegistry('reg-1', [{ name: 'echo', effect: 'read' }] as never)).toThrow(
      /no usable grant class/,
    )
    expect(() =>
      createToolRegistry('reg-1', [{ name: 'echo', grantClass: 'read' }] as never),
    ).toThrow(/no usable grant class/)
  })

  it('is stable under declaration order and blind to description', () => {
    const a = createToolRegistry('reg-1', [
      { name: 'echo', description: 'Echo args', grantClass: 'mintable' },
      { name: 'write_demo', grantClass: 'never' },
    ])
    const b = createToolRegistry('reg-1', [
      { name: 'write_demo', grantClass: 'never' },
      { name: 'echo', description: 'different wording', grantClass: 'mintable' },
    ])

    expect(b.contentDigest).toBe(a.contentDigest)
  })

  it('contentDigest is identical when only effect changes (effect is not identity)', () => {
    const asRead = createToolRegistry('reg-1', [
      { name: 'echo', grantClass: 'mintable', effect: 'read' },
    ])
    const asWrite = createToolRegistry('reg-1', [
      { name: 'echo', grantClass: 'mintable', effect: 'write' },
    ])
    const omitted = createToolRegistry('reg-1', [{ name: 'echo', grantClass: 'mintable' }])

    expect(asWrite.contentDigest).toBe(asRead.contentDigest)
    expect(omitted.contentDigest).toBe(asRead.contentDigest)
  })
})

describe('createToolRegistry — effect is a retry hint, not authority', () => {
  it('projects effect: read stays read; write, omitted, and unknown become write', () => {
    const registry = createToolRegistry('reg-1', [
      { name: 'echo', grantClass: 'mintable', effect: 'read' },
      { name: 'write_demo', grantClass: 'never', effect: 'write' },
      { name: 'fetch_url', grantClass: 'never' },
      { name: 'odd', grantClass: 'never', effect: 'external' as never },
    ])

    expect(registry.tools.get('echo')?.effect).toBe('read')
    expect(registry.tools.get('write_demo')?.effect).toBe('write')
    expect(registry.tools.get('fetch_url')?.effect).toBe('write')
    expect(registry.tools.get('odd')?.effect).toBe('write')
  })

  it('drops unknown keys: an execute handler never reaches an entry; effect is projected', () => {
    const registry = createToolRegistry('reg-1', [
      {
        name: 'echo',
        description: 'Echo args',
        grantClass: 'mintable',
        execute: async () => 'ran',
        effect: 'write',
      },
    ] as never)

    const entry = registry.tools.get('echo')
    expect(entry).toBeDefined()
    expect(Object.keys(entry as object).sort()).toEqual([
      'description',
      'effect',
      'grantClass',
      'name',
      'sensitiveOutput',
    ])
    expect(entry?.sensitiveOutput).toBe(false)
    expect((entry as Record<string, unknown>).execute).toBeUndefined()
    expect(entry?.effect).toBe('write')
  })

  it('an unknown key cannot change the seal either', () => {
    const plain = createToolRegistry('reg-1', [{ name: 'echo', grantClass: 'mintable' }])
    const smuggled = createToolRegistry('reg-1', [
      { name: 'echo', grantClass: 'mintable', execute: async () => 'x' },
    ] as never)

    expect(smuggled.contentDigest).toBe(plain.contentDigest)
  })

  it('mint allowlist is unchanged when effect is read vs write (grants only narrow)', () => {
    const facts = {
      moduleEffective: true,
      canRead: true,
      canWrite: false,
      allowedModels: [],
    } as const
    const readReg = createToolRegistry('reg-1', [
      { name: 'echo', grantClass: 'mintable', effect: 'read' },
      { name: 'write_demo', grantClass: 'never', effect: 'write' },
    ])
    const writeReg = createToolRegistry('reg-1', [
      { name: 'echo', grantClass: 'mintable', effect: 'write' },
      { name: 'write_demo', grantClass: 'never', effect: 'read' },
    ])

    const readMint = mintCapabilityGrant({ orgId: 'org_a', registry: readReg, facts })
    const writeMint = mintCapabilityGrant({ orgId: 'org_a', registry: writeReg, facts })
    expect(readMint.ok && writeMint.ok).toBe(true)
    if (!(readMint.ok && writeMint.ok)) return
    expect(readMint.grant.allowedTools).toEqual(['echo'])
    expect(writeMint.grant.allowedTools).toEqual(['echo'])
    expect(writeMint.grant.allowedTools).toEqual(readMint.grant.allowedTools)
  })

  it('projects sensitiveOutput (default false) without moving contentDigest', () => {
    const plain = createToolRegistry('reg-1', [{ name: 'echo', grantClass: 'mintable' }])
    const flagged = createToolRegistry('reg-1', [
      { name: 'echo', grantClass: 'mintable', sensitiveOutput: true },
    ])

    expect(plain.tools.get('echo')?.sensitiveOutput).toBe(false)
    expect(flagged.tools.get('echo')?.sensitiveOutput).toBe(true)
    expect(flagged.contentDigest).toBe(plain.contentDigest)
    expect(Object.keys(flagged.tools.get('echo') as object).sort()).toEqual([
      'effect',
      'grantClass',
      'name',
      'sensitiveOutput',
    ])
  })
})
