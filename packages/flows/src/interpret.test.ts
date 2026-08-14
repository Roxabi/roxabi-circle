import { describe, expect, it } from 'vitest'
import { interpretRun } from './interpret'
import { createToolRegistry } from './registry'
import { createRunSnapshot, type RunnerView } from './snapshot'

const registry = createToolRegistry('reg-1', [
  { name: 'echo', description: 'Echo args', effect: 'read' },
])

const grant = {
  orgId: 'org_1',
  allowedTools: ['echo'],
  registryVersion: 'reg-1',
  allowsInfer: true,
}

const emptyReceipts = { receiptVersion: 1 as const, tokensUsed: 0, tasks: {} }

function mustView(tasks: Record<string, { after?: string[] }>): RunnerView {
  const planTasks: Record<string, { after?: string[]; invoke: { tool: string } }> = {}
  for (const [id, spec] of Object.entries(tasks)) {
    planTasks[id] = {
      ...(spec.after ? { after: spec.after } : {}),
      invoke: { tool: 'echo' },
    }
  }
  const snap = createRunSnapshot({
    plan: {
      flows: 'v0',
      plan: { id: 'p' },
      permits: { tools: ['echo'] },
      tasks: planTasks,
    },
    grant,
    registry,
    actorId: 'user_1',
    createdAt: '2026-08-06T00:00:00.000Z',
  })
  if (!snap.ok) {
    throw new Error(`expected legal snapshot: ${JSON.stringify(snap.issues)}`)
  }
  return snap.runnerView
}

function cloneView(view: RunnerView): RunnerView {
  return JSON.parse(JSON.stringify(view)) as RunnerView
}

function withAfter(view: RunnerView, edges: Record<string, string[]>): RunnerView {
  const cloned = cloneView(view)
  for (const [id, after] of Object.entries(edges)) {
    const task = cloned.sealedPlan.tasks[id]
    if (!task) throw new Error(`missing task ${id}`)
    cloned.sealedPlan.tasks[id] = { ...task, after }
  }
  return cloned
}

function bundle(tasks: Record<string, { outcome: string; errorCode?: string }>) {
  return {
    receiptVersion: 1 as const,
    tokensUsed: 0,
    tasks: Object.fromEntries(
      Object.entries(tasks).map(([id, spec]) => [id, { taskId: id, ...spec }]),
    ),
  }
}

describe('interpretRun', () => {
  describe('skip cascade', () => {
    it('adds skip for B when A fails and B.after is [A], and B is not ready', () => {
      const view = mustView({ a: {}, b: { after: ['a'] } })
      const result = interpretRun(
        view,
        bundle({ a: { outcome: 'fail', errorCode: 'INVOKE_FAILED' } }),
      )
      expect(result.receipts.tasks.a?.outcome).toBe('fail')
      expect(result.receipts.tasks.b?.outcome).toBe('skip')
      expect(result.readyTaskIds).not.toContain('b')
      expect(result.readyTaskIds).toEqual([])
      expect(result.rollup).toBe('failed')
    })

    it('keeps parallel independent C ready when A fails', () => {
      const view = mustView({ a: {}, b: { after: ['a'] }, c: {} })
      const result = interpretRun(
        view,
        bundle({ a: { outcome: 'fail', errorCode: 'INVOKE_FAILED' } }),
      )
      expect(result.receipts.tasks.b?.outcome).toBe('skip')
      expect(result.readyTaskIds).toEqual(['c'])
      expect(result.readyTaskIds).not.toContain('a')
      expect(result.readyTaskIds).not.toContain('b')
      expect(result.rollup).toBe('failed')
    })
  })

  describe('ready vs pending', () => {
    it('marks only B ready when A-ok in A→B→C chain (C still pending)', () => {
      const view = mustView({ a: {}, b: { after: ['a'] }, c: { after: ['b'] } })
      const result = interpretRun(view, bundle({ a: { outcome: 'ok' } }))
      expect(result.readyTaskIds).toEqual(['b'])
      expect(result.receipts.tasks.c).toBeUndefined()
      expect(result.receipts.tasks.b).toBeUndefined()
      expect(result.rollup).toBe('running')
      expect(result.stuck).toBeUndefined()
    })
  })

  describe('waiting fail-closed', () => {
    it('fails with WAITING_NOT_SUPPORTED and does not echo waiting in output receipts', () => {
      const view = mustView({ a: {}, b: { after: ['a'] } })
      const result = interpretRun(view, bundle({ a: { outcome: 'waiting' } }))
      expect(result.rollup).toBe('failed')
      expect(result.readyTaskIds).toEqual([])
      expect(result.stuck).toBe('WAITING_NOT_SUPPORTED')
      const outcomes = Object.values(result.receipts.tasks).map((task) => task.outcome)
      expect(outcomes).not.toContain('waiting')
    })
  })

  describe('stuck', () => {
    it('sets stuck CYCLE when sealedPlan.after has a cycle', () => {
      const view = withAfter(mustView({ a: {}, b: { after: ['a'] } }), { a: ['b'], b: ['a'] })
      const result = interpretRun(view, emptyReceipts)
      expect(result.stuck).toBe('CYCLE')
      expect(result.rollup).toBe('failed')
      expect(result.readyTaskIds).toEqual([])
    })

    it('sets stuck UNKNOWN_TASK_EDGE when after points at an unknown task id', () => {
      const view = withAfter(mustView({ a: {}, b: { after: ['a'] } }), { b: ['missing'] })
      const result = interpretRun(view, emptyReceipts)
      expect(result.stuck).toBe('UNKNOWN_TASK_EDGE')
      expect(result.rollup).toBe('failed')
      expect(result.readyTaskIds).toEqual([])
    })

    it('sets stuck CYCLE when a remaining subgraph is cyclic after progress', () => {
      const view = withAfter(mustView({ a: {}, b: { after: ['a'] }, c: { after: ['b'] } }), {
        b: ['c'],
        c: ['b'],
      })
      const result = interpretRun(view, bundle({ a: { outcome: 'ok' } }))
      expect(result.readyTaskIds).toEqual([])
      expect(result.stuck).toBe('CYCLE')
      expect(result.rollup).toBe('failed')
    })

    it('sets stuck CYCLE and does not dispatch an independent root next to a cycle', () => {
      const view = withAfter(mustView({ pwn: {}, b: {}, c: { after: ['b'] } }), {
        b: ['c'],
        c: ['b'],
      })
      const result = interpretRun(view, emptyReceipts)
      expect(result.stuck).toBe('CYCLE')
      expect(result.readyTaskIds).toEqual([])
      expect(result.rollup).toBe('failed')
    })
  })

  describe('rollup', () => {
    it('sets rollup succeeded when every task is present and ok', () => {
      const view = mustView({ a: {}, b: { after: ['a'] } })
      const result = interpretRun(view, bundle({ a: { outcome: 'ok' }, b: { outcome: 'ok' } }))
      expect(result.rollup).toBe('succeeded')
      expect(result.readyTaskIds).toEqual([])
      expect(result.stuck).toBeUndefined()
    })

    it('does not set rollup succeeded when any skip is in the bundle', () => {
      const view = mustView({ a: {}, b: {} })
      const result = interpretRun(view, bundle({ a: { outcome: 'ok' }, b: { outcome: 'skip' } }))
      expect(result.rollup).not.toBe('succeeded')
      expect(result.rollup).toBe('failed')
      expect(result.readyTaskIds).toEqual([])
    })

    it('cascades skip when the only dep is skip (no fail in the bundle)', () => {
      const view = mustView({ a: {}, b: { after: ['a'] } })
      const result = interpretRun(view, bundle({ a: { outcome: 'skip' } }))
      expect(result.receipts.tasks.b?.outcome).toBe('skip')
      expect(result.rollup).toBe('failed')
      expect(result.stuck).toBeUndefined()
    })

    it('fails rollup on a single fail with no skip to mask it', () => {
      const view = mustView({ a: {} })
      const result = interpretRun(
        view,
        bundle({ a: { outcome: 'fail', errorCode: 'INVOKE_FAILED' } }),
      )
      expect(result.rollup).toBe('failed')
      expect(result.stuck).toBeUndefined()
      expect(result.readyTaskIds).toEqual([])
    })

    it('cascades skip two hops A fail → B skip → C skip', () => {
      const view = mustView({ c: { after: ['b'] }, b: { after: ['a'] }, a: {} })
      const result = interpretRun(
        view,
        bundle({ a: { outcome: 'fail', errorCode: 'INVOKE_FAILED' } }),
      )
      expect(result.receipts.tasks.b?.outcome).toBe('skip')
      expect(result.receipts.tasks.c?.outcome).toBe('skip')
    })

    it('keeps C pending when after [A,B] and only A is ok', () => {
      const view = mustView({ a: {}, b: {}, c: { after: ['a', 'b'] } })
      const result = interpretRun(view, bundle({ a: { outcome: 'ok' } }))
      expect(result.readyTaskIds).toEqual(['b'])
      expect(result.receipts.tasks.c).toBeUndefined()
    })

    it('skips C when after [A,B] and A failed even if B is ok', () => {
      const view = mustView({ a: {}, b: {}, c: { after: ['a', 'b'] } })
      const result = interpretRun(
        view,
        bundle({ a: { outcome: 'fail', errorCode: 'INVOKE_FAILED' }, b: { outcome: 'ok' } }),
      )
      expect(result.receipts.tasks.c?.outcome).toBe('skip')
    })
  })
})
