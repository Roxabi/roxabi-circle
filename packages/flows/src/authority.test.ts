import { describe, expect, it } from 'vitest'
import { type CapabilityGrant, resolveEffectiveAuthority } from './authority'
import { createToolRegistry } from './registry'
import { type PlanDocument, parsePlanDocument } from './schema'

/**
 * Direct tests for `resolveEffectiveAuthority`, the intersection stated in
 * ADR-0005 D4 § Authority split:
 *   effective.tools = grants.allowedTools ∩ plan.permits.tools ∩ registry
 * `checkPlan` exercises this function transitively, so package coverage stays green even when
 * the intersection itself is unasserted. These tests target it so a change to the set logic
 * cannot pass unnoticed behind checkPlan's issue codes.
 */

const registry = createToolRegistry('reg-1', [
  { name: 'echo', description: 'Echo args', effect: 'read' },
  { name: 'write_demo', description: 'Write demo blob', effect: 'write' },
  { name: 'fetch_url', description: 'External fetch', effect: 'external' },
])

const planWith = (tools: readonly string[]): PlanDocument =>
  parsePlanDocument({
    flows: 'v0',
    plan: { id: 'p' },
    permits: { tools },
    tasks: { t1: { invoke: { tool: 'echo' } } },
  })

const grantOf = (allowedTools: readonly string[], allowsInfer = true): CapabilityGrant => ({
  orgId: 'org_1',
  allowedTools,
  registryVersion: 'reg-1',
  allowsInfer,
})

describe('resolveEffectiveAuthority — grants bound the result', () => {
  it('never returns a tool outside the grant, even when the plan permits more', () => {
    const eff = resolveEffectiveAuthority(
      planWith(['echo', 'write_demo', 'fetch_url']),
      grantOf(['echo']),
      registry,
    )
    expect(eff.tools).toEqual(['echo'])
  })

  it('drops a permitted tool that the grant does not carry', () => {
    const eff = resolveEffectiveAuthority(planWith(['write_demo']), grantOf(['echo']), registry)
    expect(eff.tools).toEqual([])
  })

  it('lets the plan narrow the grant', () => {
    const eff = resolveEffectiveAuthority(
      planWith(['echo']),
      grantOf(['echo', 'write_demo']),
      registry,
    )
    expect(eff.tools).toEqual(['echo'])
  })

  it('excludes a tool that is granted and permitted but absent from the registry', () => {
    const eff = resolveEffectiveAuthority(planWith(['ghost']), grantOf(['ghost']), registry)
    expect(eff.tools).toEqual([])
  })

  it('yields nothing when permits are empty, however broad the grant', () => {
    const eff = resolveEffectiveAuthority(
      planWith([]),
      grantOf(['echo', 'write_demo', 'fetch_url']),
      registry,
    )
    expect(eff.tools).toEqual([])
  })

  it('yields nothing when the grant is empty, however broad the permits', () => {
    const eff = resolveEffectiveAuthority(
      planWith(['echo', 'write_demo', 'fetch_url']),
      grantOf([]),
      registry,
    )
    expect(eff.tools).toEqual([])
  })
})

describe('resolveEffectiveAuthority — shape and passthrough', () => {
  it('returns effective tools sorted and deduplicated', () => {
    const eff = resolveEffectiveAuthority(
      planWith(['write_demo', 'echo', 'echo']),
      grantOf(['write_demo', 'echo']),
      registry,
    )
    expect(eff.tools).toEqual(['echo', 'write_demo'])
  })

  it('reports grant and plan inputs unique-sorted for audit', () => {
    const eff = resolveEffectiveAuthority(
      planWith(['write_demo', 'echo', 'echo']),
      grantOf(['fetch_url', 'echo', 'echo']),
      registry,
    )
    expect(eff.grantTools).toEqual(['echo', 'fetch_url'])
    expect(eff.planPermitTools).toEqual(['echo', 'write_demo'])
  })

  it('takes allowsInfer from the grant, never from the plan', () => {
    const plan = planWith(['echo'])
    expect(resolveEffectiveAuthority(plan, grantOf(['echo'], true), registry).allowsInfer).toBe(
      true,
    )
    expect(resolveEffectiveAuthority(plan, grantOf(['echo'], false), registry).allowsInfer).toBe(
      false,
    )
  })

  it('takes orgId from the grant', () => {
    const eff = resolveEffectiveAuthority(planWith(['echo']), grantOf(['echo']), registry)
    expect(eff.orgId).toBe('org_1')
  })
})

describe('resolveEffectiveAuthority — exhaustive intersection property', () => {
  const universe = ['echo', 'write_demo', 'fetch_url', 'ghost'] as const

  const subsets = <T>(xs: readonly T[]): T[][] => {
    const out: T[][] = [[]]
    for (const x of xs) {
      const seen = out.length
      for (let i = 0; i < seen; i++) {
        out.push([...out[i]!, x])
      }
    }
    return out
  }

  it('equals grant ∩ permits ∩ registry for every combination, and never exceeds the grant', () => {
    const all = subsets(universe)
    let checked = 0

    for (const planTools of all) {
      for (const grantTools of all) {
        const eff = resolveEffectiveAuthority(planWith(planTools), grantOf(grantTools), registry)
        const expected = [...new Set(planTools)]
          .filter((t) => grantTools.includes(t) && registry.tools.has(t))
          .sort()

        expect(eff.tools).toEqual(expected)
        // The bound itself, stated independently of the expected-set computation.
        for (const t of eff.tools) {
          expect(grantTools).toContain(t)
        }
        checked++
      }
    }

    expect(checked).toBe(all.length * all.length)
  })
})
