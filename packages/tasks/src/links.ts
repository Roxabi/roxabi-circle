import type { TaskLink } from './schema'

export type LinkIssueCode = 'REFLEXIVE' | 'DUPLICATE_EDGE' | 'MULTIPLE_PARENTS' | 'CYCLE'

export type LinkIssue = {
  code: LinkIssueCode
  message: string
}

export type LinkEdge = Pick<TaskLink, 'orgId' | 'fromTaskId' | 'toTaskId' | 'kind'>

/**
 * parent: from = parent, to = child (one incoming parent per child).
 * blocks: from blocks to.
 * duplicates: from is duplicate of to (canonical).
 */
export function checkNewLink(existing: readonly LinkEdge[], next: LinkEdge): LinkIssue[] {
  const issues: LinkIssue[] = []
  if (next.fromTaskId === next.toTaskId) {
    issues.push({ code: 'REFLEXIVE', message: 'link cannot connect a task to itself' })
    return issues
  }

  const sameOrg = existing.filter((e) => e.orgId === next.orgId)
  for (const e of sameOrg) {
    if (e.fromTaskId === next.fromTaskId && e.toTaskId === next.toTaskId && e.kind === next.kind) {
      issues.push({ code: 'DUPLICATE_EDGE', message: 'identical link already exists' })
    }
  }

  if (next.kind === 'parent') {
    if (sameOrg.some((e) => e.kind === 'parent' && e.toTaskId === next.toTaskId)) {
      issues.push({
        code: 'MULTIPLE_PARENTS',
        message: 'child task already has a parent link',
      })
    }
  }

  // Cycle check per kind within org
  const wouldCycle = createsCycle(
    sameOrg.filter((e) => e.kind === next.kind),
    next.fromTaskId,
    next.toTaskId,
  )
  if (wouldCycle) {
    issues.push({
      code: 'CYCLE',
      message: `adding ${next.kind} link would create a cycle`,
    })
  }

  return issues
}

/**
 * Adding from→to closes a cycle when `from` is already reachable from `to`.
 * Each node is expanded once, so a finite graph always finishes.
 */
function createsCycle(edgesOfKind: readonly LinkEdge[], from: string, to: string): boolean {
  const outgoing = new Map<string, string[]>()
  for (const edge of edgesOfKind) {
    const nexts = outgoing.get(edge.fromTaskId)
    if (nexts === undefined) outgoing.set(edge.fromTaskId, [edge.toTaskId])
    else nexts.push(edge.toTaskId)
  }
  const pending = [to]
  const seen = new Set<string>([to])
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    const nexts = outgoing.get(node)
    if (nexts === undefined) continue
    for (const next of nexts) {
      if (next === from) return true
      if (seen.has(next)) continue
      seen.add(next)
      pending.push(next)
    }
  }
  return false
}

/** Children of parent (kind=parent, from=parent). */
export function childTaskIds(
  links: readonly LinkEdge[],
  orgId: string,
  parentTaskId: string,
): string[] {
  return links
    .filter((e) => e.orgId === orgId && e.kind === 'parent' && e.fromTaskId === parentTaskId)
    .map((e) => e.toTaskId)
}

/** Tasks blocked by blocker (kind=blocks). */
export function blockedTaskIds(
  links: readonly LinkEdge[],
  orgId: string,
  blockerTaskId: string,
): string[] {
  return links
    .filter((e) => e.orgId === orgId && e.kind === 'blocks' && e.fromTaskId === blockerTaskId)
    .map((e) => e.toTaskId)
}
