import { describe, expect, it } from 'vitest'
import { blockedTaskIds, checkNewLink, childTaskIds } from './links'

describe('checkNewLink', () => {
  it('rejects reflexive', () => {
    const issues = checkNewLink([], {
      orgId: 'o1',
      fromTaskId: 'a',
      toTaskId: 'a',
      kind: 'parent',
    })
    expect(issues[0]?.code).toBe('REFLEXIVE')
  })

  it('rejects duplicate edge', () => {
    const existing = [{ orgId: 'o1', fromTaskId: 'p', toTaskId: 'c', kind: 'parent' as const }]
    const issues = checkNewLink(existing, {
      orgId: 'o1',
      fromTaskId: 'p',
      toTaskId: 'c',
      kind: 'parent',
    })
    expect(issues.some((i) => i.code === 'DUPLICATE_EDGE')).toBe(true)
  })

  it('rejects second parent', () => {
    const existing = [{ orgId: 'o1', fromTaskId: 'p1', toTaskId: 'c', kind: 'parent' as const }]
    const issues = checkNewLink(existing, {
      orgId: 'o1',
      fromTaskId: 'p2',
      toTaskId: 'c',
      kind: 'parent',
    })
    expect(issues.some((i) => i.code === 'MULTIPLE_PARENTS')).toBe(true)
  })

  it('detects cycle on parent chain', () => {
    const existing = [
      { orgId: 'o1', fromTaskId: 'a', toTaskId: 'b', kind: 'parent' as const },
      { orgId: 'o1', fromTaskId: 'b', toTaskId: 'c', kind: 'parent' as const },
    ]
    // c → a would cycle a→b→c→a
    const issues = checkNewLink(existing, {
      orgId: 'o1',
      fromTaskId: 'c',
      toTaskId: 'a',
      kind: 'parent',
    })
    expect(issues.some((i) => i.code === 'CYCLE')).toBe(true)
  })

  it('allows acyclic parent', () => {
    const issues = checkNewLink([], {
      orgId: 'o1',
      fromTaskId: 'p',
      toTaskId: 'c',
      kind: 'parent',
    })
    expect(issues).toEqual([])
  })

  it('detects blocks cycle', () => {
    const existing = [{ orgId: 'o1', fromTaskId: 'a', toTaskId: 'b', kind: 'blocks' as const }]
    const issues = checkNewLink(existing, {
      orgId: 'o1',
      fromTaskId: 'b',
      toTaskId: 'a',
      kind: 'blocks',
    })
    expect(issues.some((i) => i.code === 'CYCLE')).toBe(true)
  })
})

describe('childTaskIds / blockedTaskIds', () => {
  const links = [
    { orgId: 'o1', fromTaskId: 'p', toTaskId: 'c1', kind: 'parent' as const },
    { orgId: 'o1', fromTaskId: 'p', toTaskId: 'c2', kind: 'parent' as const },
    { orgId: 'o1', fromTaskId: 'x', toTaskId: 'y', kind: 'blocks' as const },
  ]

  it('lists children', () => {
    expect(childTaskIds(links, 'o1', 'p').sort()).toEqual(['c1', 'c2'])
  })

  it('lists blocked', () => {
    expect(blockedTaskIds(links, 'o1', 'x')).toEqual(['y'])
  })
})
