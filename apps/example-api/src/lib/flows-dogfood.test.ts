import { describe, expect, it } from 'vitest'
import {
  canDogfoodCreateRun,
  DEMO_ECHO_PLAN_YAML,
  dogfoodGrant,
  dogfoodPlanToSnapshot,
  FLOWS_MODULE_ID,
  isFlowsAdmin,
} from './flows-dogfood'

describe('flows dogfood call site', () => {
  it('exports flows module id', () => {
    expect(FLOWS_MODULE_ID).toBe('flows')
  })

  it('checks and freezes snapshot for demo plan with grant', () => {
    const result = dogfoodPlanToSnapshot(DEMO_ECHO_PLAN_YAML, dogfoodGrant('org_demo'), 'user_demo')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.snapshot.planId).toBe('demo-echo')
      expect(result.snapshot.executionTools).toEqual(['echo'])
      expect(result.snapshot.orgId).toBe('org_demo')
      expect(result.snapshot.grantAudit.registryVersion).toBe('example-api-dogfood-v0')
      expect(result.snapshot.registryContentDigest).toMatch(/^[0-9a-f]{8}$/)
    }
  })

  it('returns TOOL_NOT_GRANTED when grant omits tool', () => {
    const result = dogfoodPlanToSnapshot(
      DEMO_ECHO_PLAN_YAML,
      dogfoodGrant('org_demo', []),
      'user_demo',
    )
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
