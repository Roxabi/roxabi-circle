import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  canDogfoodCreateRun,
  dogfoodGrant,
  dogfoodPlanToSnapshot,
  FLOWS_MODULE_ID,
  isFlowsAdmin,
} from './flows-dogfood'

const fixture = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../packages/flows/src/fixtures/demo-echo.plan.yaml',
  ),
  'utf8',
)

describe('flows dogfood call site', () => {
  it('exports flows module id', () => {
    expect(FLOWS_MODULE_ID).toBe('flows')
  })

  it('checks and freezes snapshot for demo plan with grant', () => {
    const result = dogfoodPlanToSnapshot(fixture, dogfoodGrant('org_demo'), 'user_demo')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.snapshot.planId).toBe('demo-echo')
      expect(result.snapshot.effectivePermits.tools).toEqual(['echo'])
      expect(result.snapshot.orgId).toBe('org_demo')
      expect(result.snapshot.grantSnapshot.registryVersion).toBe('example-api-dogfood-v0')
    }
  })

  it('returns ok:false when grant omits tool (fail-closed composition)', () => {
    const result = dogfoodPlanToSnapshot(fixture, dogfoodGrant('org_demo', []), 'user_demo')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0)
    }
  })

  it('admin gate matches V0 (incl. super_admin)', () => {
    expect(isFlowsAdmin({ orgRole: 'admin' })).toBe(true)
    expect(isFlowsAdmin({ orgRole: 'member' })).toBe(false)
    expect(isFlowsAdmin({ orgRole: 'member', platformRole: 'super_admin' })).toBe(true)
  })

  it('create-run requires session', () => {
    expect(canDogfoodCreateRun({ orgRole: 'admin', authMethod: 'session' })).toBe(true)
    expect(canDogfoodCreateRun({ orgRole: 'admin', authMethod: 'api_key' })).toBe(false)
    expect(canDogfoodCreateRun({ orgRole: 'admin', authMethod: undefined })).toBe(false)
  })
})
