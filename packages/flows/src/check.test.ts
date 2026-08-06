import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { canAdminFlows, canCreateFlowRun } from './access'
import { checkPlan } from './check'
import { FLOWS_MODULE_ID } from './constants'
import { createToolRegistry } from './registry'
import { parsePlanDocument, safeParsePlanDocument } from './schema'
import { createRunSnapshot, digestPlan } from './snapshot'
import { loadPlanFromYaml } from './yaml'

const here = dirname(fileURLToPath(import.meta.url))
const demoYaml = readFileSync(join(here, 'fixtures/demo-echo.plan.yaml'), 'utf8')

const registry = createToolRegistry('reg-1', [
  { name: 'echo', description: 'Echo args', effect: 'read' },
  { name: 'write_demo', description: 'Write demo blob', effect: 'write' },
])

const grant = (allowedTools: readonly string[], registryVersion = 'reg-1') => ({
  orgId: 'org_1',
  allowedTools,
  registryVersion,
})

describe('loadPlanFromYaml + dogfood fixture', () => {
  it('loads demo-echo YAML', () => {
    const plan = loadPlanFromYaml(demoYaml)
    expect(plan.flows).toBe('v0')
    expect(plan.plan.id).toBe('demo-echo')
    expect(Object.keys(plan.tasks)).toHaveLength(2)
  })

  it('rejects oversized YAML', () => {
    const big = `flows: v0\nplan: { id: x }\npermits: { tools: [] }\ntasks: {}\n${'x'.repeat(70_000)}`
    expect(() => loadPlanFromYaml(big)).toThrow(/max/)
  })

  it('rejects agent key (strict / deferred)', () => {
    const yaml = `
flows: v0
plan:
  id: bad
  max_tokens: 100
permits:
  tools: []
tasks:
  a:
    agent:
      prompt: nope
`
    expect(() => loadPlanFromYaml(yaml)).toThrow()
  })
})

describe('schema re-validation at check/freeze', () => {
  it('refuses unparsed agent task at checkPlan', () => {
    const raw = {
      flows: 'v0',
      plan: { id: 'p', max_tokens: 100 },
      permits: { tools: ['echo'] },
      tasks: { t1: { agent: { prompt: 'x' } } },
    }
    const result = checkPlan(raw, grant(['echo']), registry)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'SCHEMA_INVALID')).toBe(true)
    }
  })

  it('refuses unparsed agent task at createRunSnapshot', () => {
    const raw = {
      flows: 'v0',
      plan: { id: 'p', max_tokens: 100 },
      permits: { tools: ['echo'] },
      tasks: { t1: { agent: { prompt: 'x' } } },
    }
    const snap = createRunSnapshot({
      plan: raw,
      grant: grant(['echo']),
      registry,
      actorId: 'u1',
    })
    expect(snap.ok).toBe(false)
  })

  it('requires plan.max_tokens when any infer task', () => {
    const r = safeParsePlanDocument({
      flows: 'v0',
      plan: { id: 'p' },
      permits: { tools: ['echo'] },
      tasks: { t1: { infer: { prompt: 'hi' } } },
    })
    expect(r.success).toBe(false)
  })
})

describe('checkPlan authority (grant ∩ permits)', () => {
  it('passes dogfood when grant includes echo', () => {
    const plan = loadPlanFromYaml(demoYaml)
    const result = checkPlan(plan, grant(['echo', 'write_demo']), registry)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.effective.tools).toEqual(['echo'])
  })

  it('fails when plan self-lists tool outside grant', () => {
    const plan = loadPlanFromYaml(demoYaml)
    const result = checkPlan(plan, grant([]), registry)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'TOOL_NOT_GRANTED')).toBe(true)
    }
  })

  it('fails empty permits with invoke (fail-closed)', () => {
    const plan = parsePlanDocument({
      flows: 'v0',
      plan: { id: 'p' },
      permits: { tools: [] },
      tasks: { t1: { invoke: { tool: 'echo' } } },
    })
    const result = checkPlan(plan, grant(['echo']), registry)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'EMPTY_PERMITS')).toBe(true)
    }
  })

  it('fails empty permits with infer-only (fail-closed token spend)', () => {
    const plan = parsePlanDocument({
      flows: 'v0',
      plan: { id: 'p', max_tokens: 100 },
      permits: { tools: [] },
      tasks: { t1: { infer: { prompt: 'hi', max_tokens: 50 } } },
    })
    const result = checkPlan(plan, grant([]), registry)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'EMPTY_PERMITS')).toBe(true)
    }
  })

  it('fails unknown tool', () => {
    const plan = parsePlanDocument({
      flows: 'v0',
      plan: { id: 'p' },
      permits: { tools: ['nope'] },
      tasks: { t1: { invoke: { tool: 'nope' } } },
    })
    const result = checkPlan(plan, grant(['nope']), registry)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'UNKNOWN_TOOL')).toBe(true)
    }
  })

  it('fails TOOL_NOT_IN_PERMITS when invoke uses grant tool outside permits', () => {
    const plan = parsePlanDocument({
      flows: 'v0',
      plan: { id: 'p' },
      permits: { tools: ['echo'] },
      tasks: { t1: { invoke: { tool: 'write_demo' } } },
    })
    const result = checkPlan(plan, grant(['echo', 'write_demo']), registry)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'TOOL_NOT_IN_PERMITS')).toBe(true)
    }
  })

  it('fails UNKNOWN_TASK_EDGE', () => {
    const plan = parsePlanDocument({
      flows: 'v0',
      plan: { id: 'p' },
      permits: { tools: ['echo'] },
      tasks: { t1: { after: ['missing'], invoke: { tool: 'echo' } } },
    })
    const result = checkPlan(plan, grant(['echo']), registry)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'UNKNOWN_TASK_EDGE')).toBe(true)
    }
  })

  it('fails TOKEN_CEILING when plan.max_tokens exceeded', () => {
    const plan = parsePlanDocument({
      flows: 'v0',
      plan: { id: 'p', max_tokens: 100 },
      permits: { tools: ['echo'] },
      tasks: { t1: { infer: { prompt: 'hi', max_tokens: 200 } } },
    })
    const result = checkPlan(plan, grant(['echo']), registry)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'TOKEN_CEILING')).toBe(true)
    }
  })

  it('fails REGISTRY_VERSION_MISMATCH', () => {
    const plan = loadPlanFromYaml(demoYaml)
    const result = checkPlan(plan, grant(['echo'], 'old'), registry)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'REGISTRY_VERSION_MISMATCH')).toBe(true)
    }
  })

  it('fails REGISTRY_VERSION_REQUIRED when pin missing', () => {
    const plan = loadPlanFromYaml(demoYaml)
    const result = checkPlan(
      plan,
      { orgId: 'org_1', allowedTools: ['echo'], registryVersion: '' },
      registry,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'REGISTRY_VERSION_REQUIRED')).toBe(true)
    }
  })

  it('detects cycle', () => {
    const plan = parsePlanDocument({
      flows: 'v0',
      plan: { id: 'p' },
      permits: { tools: ['echo'] },
      tasks: {
        a: { after: ['b'], invoke: { tool: 'echo' } },
        b: { after: ['a'], invoke: { tool: 'echo' } },
      },
    })
    const result = checkPlan(plan, grant(['echo']), registry)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'CYCLE')).toBe(true)
    }
  })

  it('requires orgId on grant', () => {
    const plan = loadPlanFromYaml(demoYaml)
    const result = checkPlan(
      plan,
      { orgId: '', allowedTools: ['echo'], registryVersion: 'reg-1' },
      registry,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'ORG_ID_REQUIRED')).toBe(true)
    }
  })
})

describe('createRunSnapshot', () => {
  it('freezes digest, ceilings, and grant copy', () => {
    const plan = loadPlanFromYaml(demoYaml)
    const g = grant(['echo'])
    const snap = createRunSnapshot({
      plan,
      grant: g,
      registry,
      actorId: 'user_1',
      createdAt: '2026-08-06T00:00:00.000Z',
    })
    expect(snap.ok).toBe(true)
    if (snap.ok) {
      expect(snap.snapshot.planDigest).toBe(digestPlan(plan))
      expect(snap.snapshot.effectivePermits.tools).toEqual(['echo'])
      expect(snap.snapshot.ceilings.maxTokens).toBe(snap.snapshot.ceilings.staticTokenBudget)
      expect(snap.snapshot.ceilings.staticTokenBudget).toBe(128)
      expect(snap.snapshot.grantSnapshot.registryVersion).toBe('reg-1')
      plan.plan.description = 'mutated'
      expect(snap.snapshot.sealedPlan.plan.description).not.toBe('mutated')
      ;(g.allowedTools as string[]).push('write_demo')
      expect(snap.snapshot.grantSnapshot.allowedTools).toEqual(['echo'])
    }
  })

  it('refuses snapshot when check fails', () => {
    const plan = loadPlanFromYaml(demoYaml)
    const snap = createRunSnapshot({
      plan,
      grant: grant([]),
      registry,
      actorId: 'user_1',
    })
    expect(snap.ok).toBe(false)
  })
})

describe('V0 admin access', () => {
  it('owner/admin can admin flows; member cannot', () => {
    expect(canAdminFlows({ orgRole: 'owner' })).toBe(true)
    expect(canAdminFlows({ orgRole: 'admin' })).toBe(true)
    expect(canAdminFlows({ orgRole: 'member' })).toBe(false)
    expect(canAdminFlows({ orgRole: 'member', platformRole: 'super_admin' })).toBe(true)
  })

  it('create run: only explicit session + admin; omit/api_key deny', () => {
    expect(canCreateFlowRun({ orgRole: 'admin', authMethod: 'api_key' })).toBe(false)
    expect(canCreateFlowRun({ orgRole: 'admin', authMethod: undefined })).toBe(false)
    expect(canCreateFlowRun({ orgRole: 'admin', authMethod: null })).toBe(false)
    expect(canCreateFlowRun({ orgRole: 'member', authMethod: 'session' })).toBe(false)
    expect(canCreateFlowRun({ orgRole: 'admin', authMethod: 'session' })).toBe(true)
    expect(
      canCreateFlowRun({
        orgRole: 'member',
        platformRole: 'super_admin',
        authMethod: 'session',
      }),
    ).toBe(true)
    expect(
      canCreateFlowRun({
        orgRole: 'member',
        platformRole: 'super_admin',
        authMethod: 'api_key',
      }),
    ).toBe(false)
  })
})

describe('module id', () => {
  it('exports flows module id', () => {
    expect(FLOWS_MODULE_ID).toBe('flows')
  })
})
