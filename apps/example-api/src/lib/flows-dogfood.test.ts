import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { assertFlowsAdmin, checkDogfoodPlanYaml, FLOWS_MODULE_ID } from './flows-dogfood'

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

  it('checks demo plan with grant', () => {
    const result = checkDogfoodPlanYaml(fixture, {
      orgId: 'org_demo',
      allowedTools: ['echo'],
    })
    expect(result.ok).toBe(true)
  })

  it('admin gate matches V0', () => {
    expect(assertFlowsAdmin('admin')).toBe(true)
    expect(assertFlowsAdmin('member')).toBe(false)
  })
})
