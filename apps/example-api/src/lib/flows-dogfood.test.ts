import {
  type CapabilityGrant,
  createRunSnapshot,
  createToolRegistry,
  loadPlanFromYaml,
  mintCapabilityGrant,
  registryToolNames,
} from '@kit/flows'
import { describe, expect, it } from 'vitest'
import {
  canDogfoodCreateRun,
  DEMO_ECHO_PLAN_YAML,
  dogfoodToolRegistry,
  FLOWS_MODULE_ID,
  isFlowsAdmin,
} from './flows-dogfood'

/**
 * Sealing requires a kit-minted grant, so the fixture mints from the dogfood registry with the
 * policy facts the case needs — production does the same from org module policy.
 */
function mintFixtureGrant(orgId: string, registry = dogfoodToolRegistry): CapabilityGrant {
  const minted = mintCapabilityGrant({
    orgId,
    registry,
    facts: { moduleEffective: true, canRead: true, canWrite: true, allowedModels: ['kit-infer'] },
  })
  if (!minted.ok) throw new Error(`fixture grant must mint: ${minted.message}`)
  return minted.grant
}

describe('flows dogfood call site', () => {
  it('exports flows module id', () => {
    expect(FLOWS_MODULE_ID).toBe('flows')
  })

  it("dogfood registry is echo-only (grantClass 'mintable')", () => {
    expect(registryToolNames(dogfoodToolRegistry)).toEqual(['echo'])
    expect(dogfoodToolRegistry.tools.get('echo')?.grantClass).toBe('mintable')
  })

  it('checks and freezes runnerView for demo plan with test grant fixture', () => {
    const plan = loadPlanFromYaml(DEMO_ECHO_PLAN_YAML)
    const result = createRunSnapshot({
      plan,
      grant: mintFixtureGrant('org_demo'),
      registry: dogfoodToolRegistry,
      actorId: 'user_demo',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.runnerView.planId).toBe('demo-echo')
      expect(result.runnerView.executionTools).toEqual(['echo'])
      expect(result.runnerView.orgId).toBe('org_demo')
      expect(result.runnerView.allowsInfer).toBe(true)
      expect(result.grantAudit.registryVersion).toBe('example-api-dogfood-v1')
      expect(result.runnerView.registryContentDigest).toMatch(/^[0-9a-f]{8}$/)
      expect('grantAudit' in result.runnerView).toBe(false)
    }
  })

  it('returns TOOL_NOT_GRANTED when policy mints nothing for the demo plan', () => {
    // Same label, nothing mintable: the minted grant is empty, so the demo plan cannot seal.
    const emptyPolicyRegistry = createToolRegistry(dogfoodToolRegistry.version, [
      { name: 'echo', description: 'Echo args (dogfood)', grantClass: 'never' },
    ])
    const plan = loadPlanFromYaml(DEMO_ECHO_PLAN_YAML)
    const result = createRunSnapshot({
      plan,
      grant: mintFixtureGrant('org_demo', emptyPolicyRegistry),
      registry: dogfoodToolRegistry,
      actorId: 'user_demo',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'TOOL_NOT_GRANTED')).toBe(true)
    }
  })

  it('admin gate matches V0', () => {
    expect(isFlowsAdmin({ orgRole: 'admin' })).toBe(true)
    expect(isFlowsAdmin({ orgRole: 'member' })).toBe(false)
    expect(isFlowsAdmin({ orgRole: 'operator' })).toBe(false)
  })

  it('create-run requires session', () => {
    expect(canDogfoodCreateRun({ orgRole: 'admin', authMethod: 'session' })).toBe(true)
    expect(canDogfoodCreateRun({ orgRole: 'admin', authMethod: 'api_key' })).toBe(false)
    expect(canDogfoodCreateRun({ orgRole: 'admin', authMethod: undefined })).toBe(false)
    expect(canDogfoodCreateRun({ orgRole: 'admin', authMethod: null })).toBe(false)
    expect(canDogfoodCreateRun({ orgRole: 'member', authMethod: 'session' })).toBe(false)
  })
})
