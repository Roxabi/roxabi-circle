import { createRunSnapshot, loadPlanFromYaml } from '@kit/flows'
import { describe, expect, it } from 'vitest'
import {
  canDogfoodCreateRun,
  DEMO_ECHO_PLAN_YAML,
  dogfoodFixedGrant,
  dogfoodPlanToSnapshot,
  dogfoodToolRegistry,
  FLOWS_MODULE_ID,
  isFlowsAdmin,
} from './flows-dogfood'

describe('flows dogfood call site', () => {
  it('exports flows module id', () => {
    expect(FLOWS_MODULE_ID).toBe('flows')
  })

  it('checks and freezes runnerView for demo plan with fixed grant', () => {
    const result = dogfoodPlanToSnapshot(DEMO_ECHO_PLAN_YAML, 'org_demo', 'user_demo')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.runnerView.planId).toBe('demo-echo')
      expect(result.runnerView.executionTools).toEqual(['echo'])
      expect(result.runnerView.orgId).toBe('org_demo')
      expect(result.runnerView.allowsInfer).toBe(true)
      expect(result.grantAudit.registryVersion).toBe('example-api-dogfood-v0')
      expect(result.runnerView.registryContentDigest).toMatch(/^[0-9a-f]{8}$/)
      expect('grantAudit' in result.runnerView).toBe(false)
    }
  })

  it('fixed grant is not free-form (tools always echo)', () => {
    const g = dogfoodFixedGrant('org_x')
    expect(g.allowedTools).toEqual(['echo'])
    expect(g.allowsInfer).toBe(true)
  })

  it('returns TOOL_NOT_GRANTED for empty tools via createRunSnapshot (not dogfood export)', () => {
    const plan = loadPlanFromYaml(DEMO_ECHO_PLAN_YAML)
    const result = createRunSnapshot({
      plan,
      grant: {
        orgId: 'org_demo',
        allowedTools: [],
        registryVersion: dogfoodToolRegistry.version,
        allowsInfer: true,
      },
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
    expect(isFlowsAdmin({ orgRole: 'member', platformRole: 'super_admin' })).toBe(true)
  })

  it('create-run requires session', () => {
    expect(canDogfoodCreateRun({ orgRole: 'admin', authMethod: 'session' })).toBe(true)
    expect(canDogfoodCreateRun({ orgRole: 'admin', authMethod: 'api_key' })).toBe(false)
    expect(canDogfoodCreateRun({ orgRole: 'admin', authMethod: undefined })).toBe(false)
    expect(canDogfoodCreateRun({ orgRole: 'admin', authMethod: null })).toBe(false)
    expect(canDogfoodCreateRun({ orgRole: 'member', authMethod: 'session' })).toBe(false)
  })
})
