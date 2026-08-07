import { describe, expect, it } from 'vitest'
import { canAdminFlows, canCreateFlowRun } from './access'
import { checkPlan } from './check'
import { FLOWS_MODULE_ID } from './constants'
import { DEMO_ECHO_PLAN_YAML } from './fixtures/demo-echo'
import { createToolRegistry } from './registry'
import { parsePlanDocument, safeParsePlanDocument } from './schema'
import { createRunSnapshot, digestPlan, executionTools } from './snapshot'
import { loadPlanFromYaml, PlanYamlError } from './yaml'

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
    const plan = loadPlanFromYaml(DEMO_ECHO_PLAN_YAML)
    expect(plan.flows).toBe('v0')
    expect(plan.plan.id).toBe('demo-echo')
    expect(Object.keys(plan.tasks)).toHaveLength(2)
  })

  it('rejects oversized YAML with code', () => {
    const big = `flows: v0\nplan: { id: x }\npermits: { tools: [] }\ntasks: {}\n${'x'.repeat(70_000)}`
    try {
      loadPlanFromYaml(big)
      expect.fail('expected throw')
    } catch (e) {
      expect(e).toBeInstanceOf(PlanYamlError)
      expect((e as PlanYamlError).code).toBe('YAML_TOO_LARGE')
    }
  })

  it('rejects agent key', () => {
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
    expect(() => loadPlanFromYaml(yaml)).toThrow(PlanYamlError)
  })

  it('rejects empty string', () => {
    try {
      loadPlanFromYaml('')
      expect.fail('expected throw')
    } catch (e) {
      expect((e as PlanYamlError).code).toBe('YAML_EMPTY')
    }
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
    const snap = createRunSnapshot({
      plan: {
        flows: 'v0',
        plan: { id: 'p', max_tokens: 100 },
        permits: { tools: ['echo'] },
        tasks: { t1: { agent: { prompt: 'x' } } },
      },
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

  it('rejects task with neither invoke nor infer', () => {
    const r = safeParsePlanDocument({
      flows: 'v0',
      plan: { id: 'p' },
      permits: { tools: ['echo'] },
      tasks: { t1: {} },
    })
    expect(r.success).toBe(false)
  })
})

describe('checkPlan authority (grant ∩ permits)', () => {
  it('passes dogfood when grant includes echo', () => {
    const plan = loadPlanFromYaml(DEMO_ECHO_PLAN_YAML)
    const result = checkPlan(plan, grant(['echo', 'write_demo']), registry)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.effective.tools).toEqual(['echo'])
  })

  it('fails when plan self-lists tool outside grant', () => {
    const plan = loadPlanFromYaml(DEMO_ECHO_PLAN_YAML)
    const result = checkPlan(plan, grant([]), registry)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'TOOL_NOT_GRANTED')).toBe(true)
    }
  })

  it('fails permits-superset even when invoke tool is granted', () => {
    const plan = parsePlanDocument({
      flows: 'v0',
      plan: { id: 'p' },
      permits: { tools: ['echo', 'write_demo'] },
      tasks: { t1: { invoke: { tool: 'echo' } } },
    })
    const result = checkPlan(plan, grant(['echo']), registry)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(
        result.issues.some((i) => i.code === 'TOOL_NOT_GRANTED' && i.path === 'permits.tools'),
      ).toBe(true)
    }
  })

  it('fails empty permits with invoke', () => {
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

  it('parses invoke.args as string-keyed record (Zod 4 z.record arity)', () => {
    const plan = parsePlanDocument({
      flows: 'v0',
      plan: { id: 'p' },
      permits: { tools: ['echo'] },
      tasks: {
        t1: { invoke: { tool: 'echo', args: { message: 'hi', n: 1 } } },
        t2: { after: ['t1'], invoke: { tool: 'echo', args: { message: 'bye' } } },
      },
    })
    expect(plan.tasks.t1.invoke?.args).toEqual({ message: 'hi', n: 1 })
    expect(Object.keys(plan.tasks)).toEqual(['t1', 't2'])
  })

  it('fails empty permits with infer-only', () => {
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

  it('fails TOOL_NOT_IN_PERMITS', () => {
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

  it('fails TOKEN_CEILING when multi-infer static sum exceeds plan total', () => {
    // per-task default 4096 * 2 = 8192 > plan.max_tokens 5000
    const plan = parsePlanDocument({
      flows: 'v0',
      plan: { id: 'p', max_tokens: 5000 },
      permits: { tools: ['echo'] },
      tasks: {
        a: { infer: { prompt: 'one' } },
        b: { infer: { prompt: 'two' } },
      },
    })
    const result = checkPlan(plan, grant(['echo']), registry)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'TOKEN_CEILING')).toBe(true)
    }
  })

  it('allows multi-infer when sum of defaults fits plan total', () => {
    const plan = parsePlanDocument({
      flows: 'v0',
      plan: { id: 'p', max_tokens: 10_000 },
      permits: { tools: ['echo'] },
      tasks: {
        a: { infer: { prompt: 'one' } },
        b: { infer: { prompt: 'two' } },
      },
    })
    const result = checkPlan(plan, grant(['echo']), registry)
    expect(result.ok).toBe(true)
  })

  it('fails REGISTRY_VERSION_MISMATCH', () => {
    const plan = loadPlanFromYaml(DEMO_ECHO_PLAN_YAML)
    const result = checkPlan(plan, grant(['echo'], 'old'), registry)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'REGISTRY_VERSION_MISMATCH')).toBe(true)
    }
  })

  it('fails GRANT_INVALID when pin missing', () => {
    const plan = loadPlanFromYaml(DEMO_ECHO_PLAN_YAML)
    const result = checkPlan(
      plan,
      { orgId: 'org_1', allowedTools: ['echo'], registryVersion: '' },
      registry,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(
        result.issues.some(
          (i) => i.code === 'GRANT_INVALID' || i.code === 'REGISTRY_VERSION_REQUIRED',
        ),
      ).toBe(true)
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
    const plan = loadPlanFromYaml(DEMO_ECHO_PLAN_YAML)
    const result = checkPlan(
      plan,
      { orgId: '', allowedTools: ['echo'], registryVersion: 'reg-1' },
      registry,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(
        result.issues.some((i) => i.code === 'GRANT_INVALID' || i.code === 'ORG_ID_REQUIRED'),
      ).toBe(true)
    }
  })
})

describe('createRunSnapshot', () => {
  it('freezes executionTools, ceilings, registry digest; deep-freeze', () => {
    const plan = loadPlanFromYaml(DEMO_ECHO_PLAN_YAML)
    const snap = createRunSnapshot({
      plan,
      grant: grant(['echo', 'write_demo']),
      registry,
      actorId: 'user_1',
      createdAt: '2026-08-06T00:00:00.000Z',
    })
    expect(snap.ok).toBe(true)
    if (snap.ok) {
      expect(snap.snapshot.planDigest).toBe(digestPlan(plan))
      expect(executionTools(snap.snapshot)).toEqual(['echo'])
      expect(snap.snapshot.executionTools).toEqual(['echo'])
      // grant has write_demo but plan does not — must not be executable
      expect(snap.snapshot.grantAudit.allowedTools).toContain('write_demo')
      expect(snap.snapshot.executionTools).not.toContain('write_demo')
      expect(snap.snapshot.ceilings.hardMaxTokens).toBe(128)
      expect(snap.snapshot.ceilings.staticTokenBudget).toBe(128)
      expect(snap.snapshot.ceilings.planMaxTokens).toBe(2000)
      expect(snap.snapshot.registryContentDigest).toBe(registry.contentDigest)
      expect(Object.isFrozen(snap.snapshot)).toBe(true)
      expect(() => {
        ;(snap.snapshot as { actorId: string }).actorId = 'mutated'
      }).toThrow()
    }
  })

  it('refuses snapshot when check fails', () => {
    const plan = loadPlanFromYaml(DEMO_ECHO_PLAN_YAML)
    const snap = createRunSnapshot({
      plan,
      grant: grant([]),
      registry,
      actorId: 'user_1',
    })
    expect(snap.ok).toBe(false)
  })
})

describe('registry', () => {
  it('freezes tool map against mutation', () => {
    expect(() => {
      ;(registry.tools as Map<string, unknown>).set('nuke', { name: 'nuke' })
    }).toThrow()
  })

  it('exposes contentDigest', () => {
    expect(registry.contentDigest).toMatch(/^[0-9a-f]{8}$/)
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
