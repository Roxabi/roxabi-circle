import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { dogfoodPlanToSnapshot, FLOWS_MODULE_ID, isFlowsAdmin } from './flows-dogfood'

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
    const result = dogfoodPlanToSnapshot(
      fixture,
      { orgId: 'org_demo', allowedTools: ['echo'] },
      'user_demo',
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.snapshot.planId).toBe('demo-echo')
      expect(result.snapshot.effectivePermits.tools).toEqual(['echo'])
      expect(result.snapshot.orgId).toBe('org_demo')
    }
  })

  it('admin gate matches V0 (incl. super_admin)', () => {
    expect(isFlowsAdmin({ orgRole: 'admin' })).toBe(true)
    expect(isFlowsAdmin({ orgRole: 'member' })).toBe(false)
    expect(isFlowsAdmin({ orgRole: 'member', platformRole: 'super_admin' })).toBe(true)
  })
})
